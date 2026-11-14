"""EMS - wlasny Energy Management System dla falownika ECOBSS FLEX 3L."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from . import diag, dump
from .const import CONF_DEVICE, DOMAIN, VERSION
from .backtest import BacktestView, BillView
from .engine import Engine
from .manual import DayView, ManualView
from .sources import SourcesView
from .learn import LearnView
from . import pge_link
from .energy import EnergyView
from .verify import ReadView, WriteView

PLATFORMS = [Platform.SENSOR, Platform.NUMBER, Platform.SWITCH, Platform.BUTTON]
STATIC = f"/ems_static/{VERSION}"                    # wersja w sciezce -> wszystkie importy (core.js, tips.js, tabs/) tez nowe
PANEL_URL = f"{STATIC}/ems-panel.js?v={VERSION}"   # ?v= wymusza nowa wersje w przegladarce
PANEL_PATH = "ems"


async def _card_resource(hass: HomeAssistant) -> None:
    """v0.6.59: karta jako zasob Lovelace (HA czeka na zasoby przed narysowaniem pulpitu -> brak 'Custom element doesn't exist')."""
    log = diag.get_logger("start")
    url = f"{STATIC}/ems-card.js"
    try:
        ll = hass.data.get("lovelace")
        res = getattr(ll, "resources", None) if ll is not None and not isinstance(ll, dict) else (ll or {}).get("resources")
        if res is None or not hasattr(res, "async_create_item"):
            log.info("Karta EMS: zasoby Lovelace w trybie YAML – zostaje ladowanie przez extra_js_url")
            return
        if hasattr(res, "loaded") and not res.loaded:
            await res.async_load()
            res.loaded = True
        mine = [r for r in res.async_items() if "/ems_static/" in str(r.get("url", "")) and "ems-card.js" in str(r.get("url", ""))]
        if mine and mine[0].get("url") == url:
            return
        if mine:
            await res.async_update_item(mine[0]["id"], {"res_type": "module", "url": url})
            for r in mine[1:]:
                await res.async_delete_item(r["id"])
        else:
            await res.async_create_item({"res_type": "module", "url": url})
        log.info("Karta EMS zarejestrowana jako zasob Lovelace: %s", url)
    except Exception as err:  # noqa: BLE001
        log.warning("Karta EMS: nie udalo sie zarejestrowac zasobu Lovelace (%s)", err)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC, str(Path(__file__).parent / "frontend"), False)]
    )
    frontend.add_extra_js_url(hass, f"{STATIC}/ems-card.js")   # karta Lovelace custom:ems-card (zapas)
    hass.bus.async_listen_once("homeassistant_started", lambda _e: hass.async_create_task(_card_resource(hass)))
    if hass.is_running:
        hass.async_create_task(_card_resource(hass))
    diag.setup(hass)
    dump.setup(hass)
    hass.http.register_view(BacktestView)
    hass.http.register_view(BillView)
    hass.http.register_view(WriteView)
    hass.http.register_view(ReadView)
    hass.http.register_view(ManualView)
    hass.http.register_view(DayView)
    hass.http.register_view(SourcesView)
    hass.http.register_view(LearnView)
    hass.http.register_view(pge_link.PgeRceView)
    hass.http.register_view(EnergyView)
    hass.http.register_view(pge_link.PgeSettingsView)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    engine = Engine(hass, entry.data[CONF_DEVICE], entry.entry_id)
    data[entry.entry_id] = engine
    engine.pge = await pge_link.start(hass, engine, entry.entry_id)     # rozliczenie PGE (dawna integracja PGE Net-Billing)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    engine.start()
    entry.async_on_unload(engine.stop)
    diag.get_logger("start").info("EMS %s uruchomiony (datalogger: %s)", VERSION, entry.data[CONF_DEVICE])
    if not data.get("_panel"):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="ems-dashboard",
            frontend_url_path=PANEL_PATH,
            module_url=PANEL_URL,
            sidebar_title="EMS",
            sidebar_icon="mdi:home-lightning-bolt",
            require_admin=False,
            config={"device": entry.data[CONF_DEVICE]},
        )
        data["_panel"] = True
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        data = hass.data[DOMAIN]
        eng = data.pop(entry.entry_id, None)
        if eng and eng.pge:
            await eng.pge.async_shutdown()
        if not any(k != "_panel" for k in data):
            frontend.async_remove_panel(hass, PANEL_PATH)
            data.pop("_panel", None)
    return ok
