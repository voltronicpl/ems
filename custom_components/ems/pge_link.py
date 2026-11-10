"""Rozliczenie PGE w EMS (dawna osobna integracja „PGE Net-Billing” v1.8.1).

- Ustawienia (stawki G12, opłaty stałe, depozyt startowy, liczniki) w Store `ems_pge_<entry>`, edycja w panelu EMS -> Ustawienia.
- Przy pierwszym starcie przejmuje ustawienia i zebrane dane ze starej integracji pge_net_billing (jesli jest w HA),
  zeby nie stracic historii rozliczenia i depozytu. Starej integracji NIE usuwa.
- API:  GET /api/ems/pge_rce?start&end&agg   (ceny RCE dla zakladki PGE)
        GET/POST /api/ems/pge                (ustawienia rozliczenia)
"""
from __future__ import annotations

from datetime import date

from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.storage import Store

from .diag import get_logger
from .pge.const import DEFAULTS, POWER_ENTITIES, POWER_FLAGS, auto_entity
from .pge.coordinator import PGELedger
from .pge.pse import aggregate, prices_between

LOG = get_logger("pge")
OLD_DOMAIN = "pge_net_billing"
ENTITY_KEYS = ["import_entity", "export_entity", *POWER_ENTITIES]


async def start(hass, entry_id: str) -> PGELedger:
    cfg_store = Store(hass, 1, f"ems_pge_{entry_id}")
    saved = await cfg_store.async_load()
    key = f"ems_pge_dane_{entry_id}"
    if saved is None:
        saved = {"ustawienia": {}}
        old = hass.config_entries.async_entries(OLD_DOMAIN)
        if old:
            e = old[0]
            saved["ustawienia"] = {**e.data, **e.options}
            data_new = Store(hass, 3, key)
            if await data_new.async_load() is None:
                old_data = await Store(hass, 3, f"pge_net_billing_{e.entry_id}").async_load()
                if old_data:
                    await data_new.async_save(old_data)
            LOG.info("Przejęto ustawienia i dane ze starej integracji PGE Net-Billing (%s). Starej integracji nie ruszam.", e.title)
        await cfg_store.async_save(saved)
    ledger = PGELedger(hass, saved.get("ustawienia", {}), key)
    ledger.cfg_store = cfg_store
    await ledger.async_load()
    return ledger


def _engine(hass):
    e = [v for k, v in hass.data.get("ems", {}).items() if not k.startswith("_")]
    return e[0] if e else None


class PgeRceView(HomeAssistantView):
    url = "/api/ems/pge_rce"
    name = "api:ems:pge_rce"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        try:
            start_d = date.fromisoformat(request.query["start"])
            end_d = date.fromisoformat(request.query["end"])
        except (KeyError, ValueError):
            return self.json_message("start/end must be YYYY-MM-DD", 400)
        agg = request.query.get("agg", "raw")
        if agg not in ("raw", "hour", "day"):
            agg = "raw"
        prices = await prices_between(hass, start_d, end_d)
        last = max(prices) if prices else None
        return self.json({"rows": aggregate(prices, agg), "agg": agg, "published_until": last})


class PgeSettingsView(HomeAssistantView):
    url = "/api/ems/pge"
    name = "api:ems:pge"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        eng = _engine(hass)
        led = getattr(eng, "pge", None) if eng else None
        if not led:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        cur = dict(led.settings)
        auto = {k: auto_entity(hass, k, cur.get(k)) for k in ENTITY_KEYS}
        return self.json({"ustawienia": cur, "domyslne": DEFAULTS, "encje": ENTITY_KEYS, "flagi": POWER_FLAGS, "auto": auto})

    async def post(self, request):
        hass = request.app["hass"]
        eng = _engine(hass)
        led = getattr(eng, "pge", None) if eng else None
        if not led:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        body = (await request.json()).get("ustawienia", {})
        new = {}
        for k, d in DEFAULTS.items():
            if k in body:
                if isinstance(d, str):
                    try:
                        date.fromisoformat(str(body[k]))
                    except ValueError:
                        return self.json_message(f"{k}: zła data (RRRR-MM-DD)", 400)
                    new[k] = str(body[k])
                else:
                    try:
                        new[k] = float(str(body[k]).replace(",", "."))
                    except (TypeError, ValueError):
                        return self.json_message(f"{k}: to nie liczba", 400)
        for k in ENTITY_KEYS:
            if k in body:
                new[k] = body[k] or None
        for k in POWER_FLAGS:
            if k in body:
                new[k] = bool(body[k])
        merged = {**{k: v for k, v in led.settings.items()}, **new}
        await led.cfg_store.async_save({"ustawienia": merged})
        LOG.info("Zapisano ustawienia rozliczenia PGE – przeładowuję")
        await eng.reload_pge(merged)
        return self.json({"ok": True})
