"""Prognoza zuzycia domu na sloty 15 min.

- baza (v0.6.7): podobne dni z historii HA (statystyki godzinowe mocy obciazenia, 56 dni):
  * ten sam dzien tygodnia (8 tygodni, nowsze tygodnie wazniejsze, odrzucone skrajne wartosci),
  * ten sam typ dnia (roboczy / weekend+swieto) z ostatnich 14 dni (nowsze wazniejsze),
  * mieszanka 60/40, wygladzenie z sasiednimi godzinami 25/50/25,
  * swieta ustawowe w Polsce liczone jak niedziela,
  * korekta biezaca: stosunek faktu do prognozy z ostatnich 3 pelnych godzin (0,7-1,4), wygasa przez 6 h,
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


def _easter(y: int):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 22 * l) // 451
    from datetime import date
    return date(y, (h + l - 7 * m + 114) // 31, ((h + l - 7 * m + 114) % 31) + 1)


def is_holiday(d) -> bool:
    """Swieta ustawowo wolne w Polsce (w tym Wigilia od 2025)."""
    fixed = {(1, 1), (1, 6), (5, 1), (5, 3), (8, 15), (11, 1), (11, 11), (12, 24), (12, 25), (12, 26)}
    if (d.month, d.day) in fixed:
        return True
    e = _easter(d.year)
    return d in (e, e + timedelta(days=1), e + timedelta(days=49), e + timedelta(days=60))


def day_type(local: datetime, weekend_hour: float) -> str:
    wd = local.weekday()
    if wd >= 5 or is_holiday(local.date()) or (wd == 4 and local.hour + local.minute / 60 >= weekend_hour):
        return "weekend"
    return f"d{wd}"


async def history(hass, entity: str, days: int = 56) -> dict[datetime, float]:
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


def _wavg(vals: list[tuple[float, float]]) -> float | None:
    """Srednia wazona z odrzuceniem skrajnych (gdy >= 4 wartosci)."""
    if not vals:
        return None
    if len(vals) >= 4:
        vals = sorted(vals)[1:-1]
    sw = sum(w for _, w in vals)
    return sum(v * w for v, w in vals) / sw if sw else None


def forecast(slots: list[datetime], hist: dict, weather: dict, p: dict, coeff: float) -> dict[datetime, float]:
    """kWh na slot."""
    wh = p["weekend_od_godz"]
    now = datetime.now(timezone.utc)
    today = now.astimezone(WAW).date()
    day_temp: dict = defaultdict(list)
    for ts, v in weather.items():
        if v["temp"] is not None:
            day_temp[ts.astimezone(WAW).date()].append(v["temp"])
    hist_days = {ts.astimezone(WAW).date() for ts in hist}
    hist_t = [sum(day_temp[d]) / len(day_temp[d]) for d in hist_days if day_temp.get(d)]
    t_ref = sum(hist_t) / len(hist_t) if hist_t else None

    # indeksy: (dzien tygodnia/ typ, godzina) -> [(W, waga)]
    by_wd: dict = defaultdict(list)
    by_type: dict = defaultdict(list)
    for ts, w in hist.items():
        loc = ts.astimezone(WAW)
        age = (today - loc.date()).days
        if age <= 0:
            continue
        dt = day_type(loc, wh)
        wd_key = "weekend" if dt == "weekend" else loc.weekday()
        by_wd[(wd_key, loc.hour)].append((w, 0.85 ** (age // 7)))
        if age <= 14:
            by_type[("we" if dt == "weekend" else "wd", loc.hour)].append((w, 0.9 ** age))

    def hour_w(loc: datetime) -> float:
        dt = day_type(loc, wh)
        res = []
        for h in (loc.hour - 1, loc.hour, loc.hour + 1):
            hh = h % 24
            a = _wavg(by_wd.get(("weekend" if dt == "weekend" else loc.weekday(), hh), []))
            b = _wavg(by_type.get(("we" if dt == "weekend" else "wd", hh), []))
            v = (0.6 * a + 0.4 * b) if a is not None and b is not None else (a if a is not None else b)
            res.append(v)
        wts = [0.25, 0.5, 0.25]
        got = [(v, k) for v, k in zip(res, wts) if v is not None]
        return sum(v * k for v, k in got) / sum(k for _, k in got) if got else 500.0

    # korekta biezaca z 3 ostatnich pelnych godzin
    fact, pred = 0.0, 0.0
    for i in range(1, 4):
        h = (now - timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
        if h in hist:
            fact += hist[h]
            pred += hour_w(h.astimezone(WAW))
    corr = min(1.4, max(0.7, fact / pred)) if pred > 0 and fact > 0 else 1.0

    out = {}
    for s in slots:
        loc = s.astimezone(WAW)
        base_w = hour_w(loc)
        lead_h = max((s - now).total_seconds() / 3600, 0)
        k = 1 + (corr - 1) * max(0.0, 1 - lead_h / 6)
        kwh = base_w * k / 1000 * 0.25
        dtemps = day_temp.get(loc.date())
        if coeff and t_ref is not None and dtemps:
            kwh += coeff * (t_ref - sum(dtemps) / len(dtemps)) / 96
        out[s] = max(kwh, 0.0)
    LOG.info("Zuzycie prognoza: %.2f kWh w horyzoncie (wsp. temp %.3f, korekta biezaca x%.2f z 3 h: fakt %.0f / prognoza %.0f W)",
             sum(out.values()), coeff, corr, fact / 3, pred / 3)
    return out
