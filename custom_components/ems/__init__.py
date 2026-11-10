"""EMS - wlasny Energy Management System dla falownika ECOBSS FLEX 3L."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from . import diag
from .const import CONF_DEVICE, DOMAIN, VERSION
from .backtest import BacktestView
from .engine import Engine
from .manual import ManualView
from .verify import ReadView, WriteView

PLATFORMS = [Platform.SENSOR, Platform.NUMBER, Platform.SWITCH, Platform.BUTTON]
STATIC = f"/ems_static/{VERSION}"                    # wersja w sciezce -> wszystkie importy (core.js, tips.js, tabs/) tez nowe
PANEL_URL = f"{STATIC}/ems-panel.js?v={VERSION}"   # ?v= wymusza nowa wersje w przegladarce
PANEL_PATH = "ems"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC, str(Path(__file__).parent / "frontend"), False)]
    )
    frontend.add_extra_js_url(hass, f"{STATIC}/ems-card.js")   # karta Lovelace custom:ems-card
    diag.setup(hass)
    hass.http.register_view(BacktestView)
    hass.http.register_view(WriteView)
    hass.http.register_view(ReadView)
    hass.http.register_view(ManualView)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    engine = Engine(hass, entry.data[CONF_DEVICE], entry.entry_id)
    data[entry.entry_id] = engine
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
        data.pop(entry.entry_id, None)
        if not any(k != "_panel" for k in data):
            frontend.async_remove_panel(hass, PANEL_PATH)
            data.pop("_panel", None)
    return ok
