"""Symulacja wstecz: nasz algorytm na prawdziwych danych z historii vs to, co faktycznie zrobil poprzedni EMS.

Dane z historii HA (statystyki godzinowe - trzymane bezterminowo):
- zuzycie domu (sensor.<prefiks>_obciazenie_moc_suma), PV (pv1..pv4_moc), SOC, import/eksport (liczniki dzienne),
- prefiksy: nowy datalogger (<dev>) i stary sniffer (OLD_PREFIX) - laczone w jedna ciagla historie.
Bilans = przychod ze sprzedazy (RCE x mnoznik depozytu) - koszt zakupu (stawki G12).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period

from . import prices
from .const import DOMAIN, OLD_PREFIX
from .diag import get_logger
from .planner import plan
from .tariff import buy_price, is_cheap

LOG = get_logger("wstecz")
WAW = ZoneInfo("Europe/Warsaw")
KEYS = {"load": "obciazenie_moc_suma", "pv1": "pv1_moc", "pv2": "pv2_moc", "pv3": "pv3_moc", "pv4": "pv4_moc",
        "soc": "bateria_soc", "imp": "energia_siec_import_dzisiaj", "exp": "energia_siec_export_dzisiaj"}


async def _stats(hass, ids: set[str], start: datetime, end: datetime, kinds: set[str]) -> dict:
    return await get_instance(hass).async_add_executor_job(statistics_during_period, hass, start, end, ids, "hour", None, kinds)


def _ts(x):
    return datetime.fromtimestamp(x, timezone.utc) if isinstance(x, (int, float)) else x


async def history(hass, dev: str, start: datetime, end: datetime) -> dict[str, dict[datetime, float]]:
    """{klucz: {godzina_utc: wartosc}}; nowy prefiks ma pierwszenstwo, dziury uzupelnia stary."""
    out: dict = {k: {} for k in KEYS}
    for prefix in (OLD_PREFIX, dev):                       # stary najpierw, nowy nadpisuje
        ids = {f"sensor.{prefix}_{v}" for v in KEYS.values()}
        mean = await _stats(hass, ids, start, end, {"mean"})
        chg = await _stats(hass, {f"sensor.{prefix}_{KEYS['imp']}", f"sensor.{prefix}_{KEYS['exp']}"}, start, end, {"change"})
        for k, v in KEYS.items():
            src = chg if k in ("imp", "exp") else mean
            field = "change" if k in ("imp", "exp") else "mean"
            for row in src.get(f"sensor.{prefix}_{v}", []):
                if row.get(field) is not None:
                    val = float(row[field])
                    if k in ("imp", "exp") and val < 0:            # zerowanie licznika o polnocy
                        continue
                    out[k][_ts(row["start"])] = val
    return out


async def first_day(hass, dev: str) -> date | None:
    start = datetime(2015, 1, 1, tzinfo=timezone.utc)
    end = datetime.now(timezone.utc)
    ids = {f"sensor.{p}_{KEYS['soc']}" for p in (OLD_PREFIX, dev)}
    st = await get_instance(hass).async_add_executor_job(statistics_during_period, hass, start, end, ids, "month", None, {"mean"})
    firsts = [_ts(r[0]["start"]) for r in st.values() if r]
    return min(firsts).astimezone(WAW).date() if firsts else None


def _money(imp_slots, exp_slots, p) -> dict:
    t = sum(v for s, v in imp_slots.items() if is_cheap(s))
    d = sum(v for s, v in imp_slots.items() if not is_cheap(s))
    koszt = sum(v * buy_price(s) for s, v in imp_slots.items())
    przych = sum(v * max(pr, 0) * p["depozyt_mnoznik"] for s, (v, pr) in exp_slots.items())
    return {"kup_tanio_kwh": round(t, 2), "kup_drogo_kwh": round(d, 2), "koszt_zl": round(koszt, 2),
            "sprzedaz_kwh": round(sum(v for v, _ in exp_slots.values()), 2), "przychod_zl": round(przych, 2),
            "bilans_zl": round(przych - koszt, 2)}


async def run(hass, engine, d0: date, d1: date, detail: bool) -> dict:
    p = engine.p
    start = datetime.combine(d0, datetime.min.time(), WAW).astimezone(timezone.utc)
    end = datetime.combine(d1 + timedelta(days=1), datetime.min.time(), WAW).astimezone(timezone.utc)
    LOG.info("Symulacja wstecz %s..%s", d0, d1)
    h = await history(hass, engine.dev, start, end)
    rce = await prices.fetch_days(hass, d0, d1)
    ch_w, sell_w = engine.limits()
    days, tot_old, tot_new = [], defaultdict(float), defaultdict(float)
    det = None
    d = d0
    while d <= d1:
        ds = datetime.combine(d, datetime.min.time(), WAW).astimezone(timezone.utc)
        hours = [ds + timedelta(hours=i) for i in range(24 if d.month else 24)]
        if not any(hh in h["load"] for hh in hours):
            LOG.debug("  %s: brak danych - pomijam", d)
            d += timedelta(days=1)
            continue
        slots = [ds + timedelta(minutes=15 * i) for i in range(96)]
        hr = lambda s: s.replace(minute=0)                                      # noqa: E731
        pv = {s: sum(h[k].get(hr(s), 0) for k in ("pv1", "pv2", "pv3", "pv4")) / 1000 * 0.25 for s in slots}
        ld = {s: h["load"].get(hr(s), 0) / 1000 * 0.25 for s in slots}
        soc0 = h["soc"].get(hours[0]) or next((h["soc"][x] for x in hours if x in h["soc"]), 50.0)
        miss = sum(1 for x in hours if x not in h["load"])
        if miss:
            LOG.debug("  %s: brak %d godzin danych zuzycia (traktuje jako 0)", d, miss)
        res, _ = plan(slots, rce, pv, ld, {}, soc0, p, p["pojemnosc_wh"] / 1000, ch_w, sell_w)
        new = _money({datetime.fromisoformat(s.start): s.imp for s in res},
                     {datetime.fromisoformat(s.start): (s.exp, s.price or 0) for s in res}, p)
        avg = lambda x: sum(rce.get(x + timedelta(minutes=15 * i), 0) for i in range(4)) / 4  # noqa: E731
        old = _money({x: h["imp"].get(x, 0) for x in hours}, {x: (h["exp"].get(x, 0), avg(x)) for x in hours}, p)
        row = {"dzien": d.isoformat(), "stary": old, "nowy": new, "roznica_zl": round(new["bilans_zl"] - old["bilans_zl"], 2),
               "rce_brak": not any(s in rce for s in slots)}
        days.append(row)
        for k, v in old.items():
            tot_old[k] += v
        for k, v in new.items():
            tot_new[k] += v
        LOG.info("  %s: stary %.2f zl, nowy %.2f zl, roznica %+.2f zl", d, old["bilans_zl"], new["bilans_zl"], row["roznica_zl"])
        if detail:
            det = {"sim": [{"start": s.start, "action": s.action, "grid_kwh": s.grid_kwh, "price": s.price, "soc": s.soc,
                            "pv": s.pv, "load": s.load, "imp": s.imp, "exp": s.exp, "why": s.why} for s in res],
                   "fakt": [{"start": x.isoformat(), "soc": h["soc"].get(x), "imp": h["imp"].get(x, 0), "exp": h["exp"].get(x, 0),
                             "pv": sum(h[k].get(x, 0) for k in ("pv1", "pv2", "pv3", "pv4")), "load": h["load"].get(x)} for x in hours]}
        d += timedelta(days=1)
    r2 = lambda m: {k: round(v, 2) for k, v in m.items()}  # noqa: E731
    total = {"stary": r2(tot_old), "nowy": r2(tot_new), "roznica_zl": round(tot_new["bilans_zl"] - tot_old["bilans_zl"], 2), "dni": len(days)}
    LOG.info("Wstecz razem (%d dni): roznica %+.2f zl na korzysc %s", len(days), total["roznica_zl"],
             "nowego EMS" if total["roznica_zl"] >= 0 else "starego EMS")
    return {"dni": days, "razem": total, "szczegoly": det}


class BacktestView(HomeAssistantView):
    """GET /api/ems/backtest?start=YYYY-MM-DD&end=YYYY-MM-DD  (bez parametrow: info o zakresie historii)."""

    url = "/api/ems/backtest"
    name = "api:ems:backtest"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        engines = [e for k, e in hass.data.get(DOMAIN, {}).items() if not k.startswith("_")]
        if not engines:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        eng = engines[0]
        if "start" not in request.query:
            fd = await first_day(hass, eng.dev)
            return self.json({"pierwszy_dzien": fd.isoformat() if fd else None, "dzis": date.today().isoformat()})
        try:
            d0 = date.fromisoformat(request.query["start"])
            d1 = date.fromisoformat(request.query.get("end", request.query["start"]))
        except ValueError:
            return self.json_message("start/end = YYYY-MM-DD", 400)
        if d1 < d0 or (d1 - d0).days > 800:
            return self.json_message("zly zakres (max 800 dni)", 400)
        try:
            return self.json(await run(hass, eng, d0, d1, d0 == d1))
        except Exception as err:  # noqa: BLE001
            LOG.exception("Blad symulacji wstecz: %s", err)
            return self.json_message(f"blad: {err}", 500)
