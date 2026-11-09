"""EMS - wlasny Energy Management System dla falownika ECOBSS FLEX 3L."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import CONF_DEVICE, DOMAIN, VERSION

PLATFORMS = [Platform.SENSOR, Platform.NUMBER]
STATIC = "/ems_static"
PANEL_URL = f"{STATIC}/ems-panel.js?v={VERSION}"   # ?v= wymusza nowa wersje w przegladarce
PANEL_PATH = "ems"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC, str(Path(__file__).parent / "frontend"), False)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    data[entry.entry_id] = entry.data
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
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
