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

    async def load(self) -> None:
        self.cfg = (await self.store.async_load() or {}).get("encje", {})
        LOG.info("Stare encje do nauki: %s", self.cfg or "brak")

    async def save(self, cfg: dict) -> None:
        self.cfg = {k: v for k, v in cfg.items() if k in KEYS and v}
        await self.store.async_save({"encje": self.cfg})
        LOG.info("Zapisano stare encje do nauki: %s", self.cfg)

    def unit(self, entity: str) -> str | None:
        st = self.hass.states.get(entity)
        return st.attributes.get("unit_of_measurement") if st else None

    async def hourly(self, key: str, start: datetime, end: datetime) -> dict[datetime, float]:
        """{godzina_utc: kWh w tej godzinie} ze statystyk HA (licznik -> 'change', moc -> 'mean')."""
        ent = self.cfg.get(key)
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
        for k, ent in self.cfg.items():
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
        return self.json({"klucze": KEYS, "encje": eng.src.cfg, "info": await eng.src.info(), "kandydaci": cand})

    async def post(self, request):
        hass = request.app["hass"]
        eng = self._eng(hass)
        if not eng:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        body = await request.json()
        await eng.src.save(body.get("encje", {}))
        eng._hist_at = None                     # przelicz historie przy nastepnym planie
        hass.async_create_task(eng.replan("zmiana starych encji"))
        return self.json({"ok": True, "encje": eng.src.cfg})
