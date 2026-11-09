"""Wspolna baza encji EMS."""
from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import DOMAIN, VERSION
from .engine import SIGNAL


class EmsEntity(Entity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    _dom = "sensor"

    def __init__(self, engine, key: str, name: str) -> None:
        self.engine = engine
        self.entity_id = f"{self._dom}.ems_{key}"   # stale ID dla panelu, niezalezne od nazwy
        self._attr_name = name
        self._attr_unique_id = f"{engine.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, engine.entry_id)}, name="EMS",
                                            manufacturer="voltronicpl", model="EMS HA", sw_version=VERSION)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL, self.async_write_ha_state))
