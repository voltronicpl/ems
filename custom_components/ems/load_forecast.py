"""Prognoza zuzycia domu na sloty 15 min.

- baza: te same dni tygodnia z historii HA (statystyki godzinowe mocy obciazenia, 28 dni),
- druga polowa piatku (od "weekend_od_godz") liczona jak weekend,
- brak danych -> sasiedni dzien roboczy (nie weekend),
- korekta na temperature zewnetrzna dla wszystkich dni; wspolczynnik kWh/°C liczony automatycznie
  (regresja dzienne zuzycie vs srednia temperatura) albo reczny.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period

from .diag import get_logger

LOG = get_logger("zuzycie")
WAW = ZoneInfo("Europe/Warsaw")


def day_type(local: datetime, weekend_hour: float) -> str:
    wd = local.weekday()
    if wd >= 5 or (wd == 4 and local.hour + local.minute / 60 >= weekend_hour):
        return "weekend"
    return f"d{wd}"


async def history(hass, entity: str, days: int = 28) -> dict[datetime, float]:
    """Srednia moc [W] na godzine (UTC)."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    stats = await get_instance(hass).async_add_executor_job(
        statistics_during_period, hass, start, end, {entity}, "hour", None, {"mean"}
    )
    out = {}
    for row in stats.get(entity, []):
        ts = row["start"]
        ts = datetime.fromtimestamp(ts, timezone.utc) if isinstance(ts, (int, float)) else ts
        if row.get("mean") is not None:
            out[ts] = float(row["mean"])
    LOG.info("Historia %s: %d godzin", entity, len(out))
    return out


def temp_coeff(hist: dict, weather: dict, weekend_hour: float) -> float:
    """kWh/dzien na kazdy °C chlodniej (dodatni = chlodniej -> wiecej). Prosta regresja liniowa."""
    daily_kwh, daily_t = defaultdict(float), defaultdict(list)
    for ts, w in hist.items():
        daily_kwh[ts.astimezone(WAW).date()] += w / 1000
    for ts, v in weather.items():
        if v["temp"] is not None:
            daily_t[ts.astimezone(WAW).date()].append(v["temp"])
    pts = [(sum(daily_t[d]) / len(daily_t[d]), k) for d, k in daily_kwh.items() if d in daily_t and k > 1]
    if len(pts) < 7:
        LOG.info("Wspolczynnik temperatury: za malo danych (%d dni) -> 0", len(pts))
        return 0.0
    mt = sum(t for t, _ in pts) / len(pts)
    mk = sum(k for _, k in pts) / len(pts)
    var = sum((t - mt) ** 2 for t, _ in pts)
    slope = sum((t - mt) * (k - mk) for t, k in pts) / var if var else 0.0
    c = max(0.0, -slope)
    LOG.info("Wspolczynnik temperatury (auto): %.3f kWh/°C/dzien z %d dni", c, len(pts))
    return c


def forecast(slots: list[datetime], hist: dict, weather: dict, p: dict, coeff: float) -> dict[datetime, float]:
    """kWh na slot."""
    wh = p["weekend_od_godz"]
    prof: dict[tuple[str, int], list[float]] = defaultdict(list)
    day_temp: dict = defaultdict(list)
    for ts, w in hist.items():
        loc = ts.astimezone(WAW)
        prof[(day_type(loc, wh), loc.hour)].append(w)
    for ts, v in weather.items():
        if v["temp"] is not None:
            day_temp[ts.astimezone(WAW).date()].append(v["temp"])
    hist_days = {ts.astimezone(WAW).date() for ts in hist}
    hist_t = [sum(day_temp[d]) / len(day_temp[d]) for d in hist_days if day_temp.get(d)]
    t_ref = sum(hist_t) / len(hist_t) if hist_t else None

    order = ["d0", "d1", "d2", "d3", "d4"]
    out = {}
    for s in slots:
        loc = s.astimezone(WAW)
        dt = day_type(loc, wh)
        vals = prof.get((dt, loc.hour))
        if not vals and dt != "weekend":       # brak danych -> sasiedni dzien roboczy
            i = order.index(dt)
            for j in (i - 1, i + 1, i - 2, i + 2):
                if 0 <= j < 5 and prof.get((order[j], loc.hour)):
                    vals = prof[(order[j], loc.hour)]
                    break
        base_w = sum(vals) / len(vals) if vals else 500.0
        kwh = base_w / 1000 * 0.25
        dtemps = day_temp.get(loc.date())
        if coeff and t_ref is not None and dtemps:
            kwh += coeff * (t_ref - sum(dtemps) / len(dtemps)) / 96
        out[s] = max(kwh, 0.0)
    LOG.info("Zuzycie prognoza: %.2f kWh w horyzoncie (wsp. temp %.3f)", sum(out.values()), coeff)
    return out
