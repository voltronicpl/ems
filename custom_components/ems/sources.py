"""Stare encje z HA do nauki (historia sprzed dataloggera): liczniki narastajace kWh (albo moc W/kW).

Uzytkownik wybiera encje w panelu (Ustawienia -> EMS -> Historia do nauki). Uzywane:
- dom   : konsumpcja domu laczna -> historia zuzycia (prognoza zuzycia, do 365 dni),
- pompa : pompa ciepla -> osobny model zuzycia wg temperatury zewnetrznej,
- pv    : produkcja PV laczna -> kalibracja prognozy PV (fakt / prognoza z ostatnich 28 dni),
- imp, exp, bat_in, bat_out : zapamietane do kolejnych analiz (rachunek, symulacja wstecz).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period
from homeassistant.helpers.storage import Store

from .diag import get_logger

LOG = get_logger("zrodla")
KEYS = {"dom": "Konsumpcja domu (łączna)", "pv": "Produkcja PV (łączna)", "imp": "Import z sieci", "exp": "Eksport do sieci",
        "bat_in": "Bateria – ładowanie", "bat_out": "Bateria – rozładowanie", "pompa": "Pompa ciepła"}
ENERGY = {"kWh": 1.0, "Wh": 0.001, "MWh": 1000.0}
POWER = {"W": 0.001, "kW": 1.0}


class Sources:
    def __init__(self, hass, entry_id: str) -> None:
        self.hass = hass
        self.store = Store(hass, 1, f"ems_zrodla_{entry_id}")
        self.cfg: dict = {}
        self.dev: list = []
        self.obec: list = []

    async def load(self) -> None:
        d = await self.store.async_load() or {}
        self.cfg = d.get("encje", {})
        self.dev = d.get("urzadzenia", [])
        self.obec = d.get("obecnosc", [])
        LOG.info("Stare encje do nauki: %s, urzadzenia: %s", self.cfg or "brak", [x.get("nazwa") for x in self.dev] or "brak")

    async def save(self, cfg: dict, dev: list | None = None, obec: list | None = None) -> None:
        self.cfg = {k: v for k, v in cfg.items() if k in KEYS and v}
        if dev is not None:
            self.dev = [{"nazwa": str(x.get("nazwa") or "Urządzenie")[:40], "moc": (x.get("moc") or "").strip(), "kwh": (x.get("kwh") or "").strip(),
                         "ikona": x.get("ikona") or "🔌"} for x in dev if (x.get("moc") or x.get("kwh"))]
        if obec is not None:
            self.obec = [str(x).strip() for x in obec if str(x).strip().split(".")[0] in ("person", "device_tracker")][:6]
        await self.store.async_save({"encje": self.cfg, "urzadzenia": self.dev, "obecnosc": self.obec})
        LOG.info("Zapisano stare encje do nauki: %s, urzadzenia: %s", self.cfg, self.dev)

    def unit(self, entity: str) -> str | None:
        st = self.hass.states.get(entity)
        return st.attributes.get("unit_of_measurement") if st else None

    async def hourly(self, key: str, start: datetime, end: datetime) -> dict[datetime, float]:
        """{godzina_utc: kWh w tej godzinie} ze statystyk HA (licznik -> 'change', moc -> 'mean')."""
        return await self.hourly_ent(self.cfg.get(key), start, end)

    async def hourly_ent(self, ent: str | None, start: datetime, end: datetime) -> dict[datetime, float]:
        if not ent:
            return {}
        u = self.unit(ent) or "kWh"
        power = u in POWER
        kind = "mean" if power else "change"
        mul = POWER.get(u, 1.0) if power else ENERGY.get(u, 1.0)
        st = await get_instance(self.hass).async_add_executor_job(statistics_during_period, self.hass, start, end, {ent}, "hour", None, {kind})
        out = {}
        for r in st.get(ent, []):
            v = r.get(kind)
            if v is None:
                continue
            ts = r["start"]
            ts = datetime.fromtimestamp(ts, timezone.utc) if isinstance(ts, (int, float)) else ts
            v = float(v) * mul
            if not power and v < 0:          # reset licznika
                continue
            out[ts] = v
        return out

    async def info(self) -> dict:
        out = {}
        now = datetime.now(timezone.utc)
        for k, ent in [*self.cfg.items(), *((f"u:{x['kwh'] or x['moc']}", x["kwh"] or x["moc"]) for x in self.dev)]:
            try:
                st = await get_instance(self.hass).async_add_executor_job(
                    statistics_during_period, self.hass, now - timedelta(days=3650), now, {ent}, "month", None, {"mean", "change"})
                rows = st.get(ent, [])
                first = rows[0]["start"] if rows else None
                first = datetime.fromtimestamp(first, timezone.utc) if isinstance(first, (int, float)) else first
                out[k] = {"od": first.date().isoformat() if first else None, "dni": (now - first).days if first else 0, "jednostka": self.unit(ent)}
            except Exception as err:  # noqa: BLE001
                out[k] = {"blad": str(err)}
        return out


class SourcesView(HomeAssistantView):
    """GET /api/ems/zrodla -> wybrane encje + info + kandydaci; POST {encje: {klucz: entity_id}} -> zapis."""

    url = "/api/ems/zrodla"
    name = "api:ems:zrodla"
    requires_auth = True

    def _eng(self, hass):
        e = [v for k, v in hass.data.get("ems", {}).items() if not k.startswith("_")]
        return e[0] if e else None

    async def get(self, request):
        hass = request.app["hass"]
        eng = self._eng(hass)
        if not eng:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        cand = sorted(({"id": s.entity_id, "nazwa": s.attributes.get("friendly_name", s.entity_id), "jedn": s.attributes.get("unit_of_measurement")}
                       for s in hass.states.async_all("sensor") if s.attributes.get("unit_of_measurement") in (*ENERGY, *POWER)), key=lambda x: x["id"])
        return self.json({"klucze": KEYS, "encje": eng.src.cfg, "urzadzenia": eng.src.dev, "info": await eng.src.info(), "kandydaci": cand,
                          "obecnosc": eng.src.obec, "kandydaci_obec": sorted(({"id": s.entity_id, "nazwa": s.attributes.get("friendly_name", s.entity_id), "stan": s.state}
                                                    for s in [*hass.states.async_all("person"), *hass.states.async_all("device_tracker")]), key=lambda x: x["id"])})

    async def post(self, request):
        hass = request.app["hass"]
        eng = self._eng(hass)
        if not eng:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        body = await request.json()
        await eng.src.save(body.get("encje", {}), body.get("urzadzenia"), body.get("obecnosc"))
        eng._hist_at = None                     # przelicz historie przy nastepnym planie
        hass.async_create_task(eng.replan("zmiana starych encji"))
        return self.json({"ok": True, "encje": eng.src.cfg})
