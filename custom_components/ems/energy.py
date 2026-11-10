"""Energia dzis / w tym miesiacu + handel (sprzedaz nie z PV) – GET /api/ems/energia?okres=dzis|miesiac

Zrodla (godzinowe statystyki HA, 'change' licznikow narastajacych):
- datalogger: sensor.<dev>_energia_*_lacznie (import, eksport, PV, dom, bateria ladowanie / rozladowanie),
- godziny bez dataloggera: stare encje z Ustawien -> Historia do nauki (imp, exp, pv, dom, bat_in, bat_out).
Handel (co godzine):
- nadwyzka PV = max(0, PV - dom); sprzedane nie z PV = max(0, eksport - nadwyzka PV),
- zakup do baterii z sieci = max(0, import - max(0, dom - PV)), koszt wg G12 tej godziny,
- zakup pod sprzedaz = sprzedane nie z PV / (sprawnosc lad. x rozl.) x sredni koszt kWh kupionego do baterii,
- wartosc sprzedazy = eksport x RCE x mnoznik depozytu; zysk z handlu = wartosc sprzedanych nie z PV - zakup pod sprzedaz.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from homeassistant.components.http import HomeAssistantView

from . import prices
from .backtest import _stats, _ts
from .const import DOMAIN
from .diag import get_logger
from .tariff import buy_price

LOG = get_logger("energia")
WAW = ZoneInfo("Europe/Warsaw")
# klucz -> (licznik dataloggera, klucz starej encji)
CNT = {"imp": ("energia_siec_import_lacznie", "imp"), "exp": ("energia_siec_export_lacznie", "exp"), "pv": ("energia_pv_produkcja_lacznie", "pv"),
       "dom": ("energia_zuzycie_dom_lacznie", "dom"), "bin": ("energia_bateria_ladowanie_lacznie", "bat_in"), "bout": ("energia_bateria_rozladowanie_lacznie", "bat_out")}


async def hourly(hass, eng, start: datetime, end: datetime) -> dict[str, dict[datetime, float]]:
    """{klucz: {godzina_utc: kWh}} – datalogger, a godziny bez niego ze starych encji."""
    ids = {f"sensor.{eng.dev}_{v[0]}": k for k, v in CNT.items()}
    st = await _stats(hass, set(ids), start, end, {"change"})
    out = {k: {} for k in CNT}
    for eid, k in ids.items():
        for r in st.get(eid, []):
            v = r.get("change")
            if v is not None and float(v) >= 0:
                out[k][_ts(r["start"])] = float(v)
    src = getattr(eng, "src", None)
    if src:
        for k, (_, old) in CNT.items():
            try:
                for h, v in (await src.hourly(old, start, end)).items():
                    out[k].setdefault(h, v)
            except Exception as err:  # noqa: BLE001
                LOG.debug("stara encja %s: %s", old, err)
    return out


async def summary(hass, eng, start: datetime, end: datetime) -> dict:
    H = await hourly(hass, eng, start.astimezone(timezone.utc), end.astimezone(timezone.utc))
    rce = await prices.fetch_days(hass, start.date(), end.date())
    dep = float(eng.p.get("depozyt_mnoznik", 1.23))
    eta = float(eng.p.get("sprawnosc_ladowania", 93)) / 100 * float(eng.p.get("sprawnosc_rozladowania", 93)) / 100 or 0.86
    t = {k: 0.0 for k in ("imp", "exp", "pv", "dom", "bin", "bout", "sprz_zl", "nonpv_kwh", "nonpv_zl", "kup_bat_kwh", "kup_bat_zl")}
    hours = sorted(set().union(*[set(v) for v in H.values()]))
    for h in hours:
        g = {k: H[k].get(h, 0.0) for k in CNT}
        for k in CNT:
            t[k] += g[k]
        q = [rce.get(h + timedelta(minutes=15 * i)) for i in range(4)]
        q = [v for v in q if v is not None]
        r = max(sum(q) / len(q), 0.0) if q else 0.0
        surplus = max(0.0, g["pv"] - g["dom"])
        nonpv = max(0.0, g["exp"] - surplus)
        grid_bat = max(0.0, g["imp"] - max(0.0, g["dom"] - g["pv"]))
        t["sprz_zl"] += g["exp"] * r * dep
        t["nonpv_kwh"] += nonpv
        t["nonpv_zl"] += nonpv * r * dep
        t["kup_bat_kwh"] += grid_bat
        t["kup_bat_zl"] += grid_bat * buy_price(h)
    avg = t["kup_bat_zl"] / t["kup_bat_kwh"] if t["kup_bat_kwh"] > 0.01 else None
    cost = t["nonpv_kwh"] / eta * avg if avg is not None else None
    out = {k: round(v, 3) for k, v in t.items()}
    out.update({"koszt_kwh_baterii": round(avg, 3) if avg is not None else None, "zakup_pod_sprzedaz_zl": round(cost, 2) if cost is not None else None, "zakup_pod_sprzedaz_kwh": round(t["nonpv_kwh"] / eta, 2),
                "zysk_handel_zl": round(t["nonpv_zl"] - cost, 2) if cost is not None else None, "godzin": len(hours)})
    return out


class EnergyView(HomeAssistantView):
    url = "/api/ems/energia"
    name = "api:ems:energia"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        engines = [e for k, e in hass.data.get(DOMAIN, {}).items() if not k.startswith("_")]
        if not engines:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        now = datetime.now(WAW)
        d0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if request.query.get("okres") == "miesiac":
            d0 = d0.replace(day=1)
        try:
            return self.json({"okres": request.query.get("okres", "dzis"), "od": d0.isoformat(), **await summary(hass, engines[0], d0, now)})
        except Exception as err:  # noqa: BLE001
            LOG.exception("Energia: %s", err)
            return self.json_message(f"blad: {err}", 500)
