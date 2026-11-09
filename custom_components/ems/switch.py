"""Glowny wylacznik algorytmu EMS. Wylaczony = dzialaja Twoje reczne ustawienia (przywracane ze snapshotu)."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DOMAIN
from .entity import EmsEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([EmsAlgorithm(hass.data[DOMAIN][entry.entry_id])])


class EmsAlgorithm(EmsEntity, SwitchEntity, RestoreEntity):
    _dom = "switch"
    _attr_icon = "mdi:robot"

    def __init__(self, engine) -> None:
        super().__init__(engine, "algorytm", "Algorytm")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state == "on":
            self.engine.enabled = True           # po restarcie HA bez nowego snapshotu

    @property
    def is_on(self) -> bool:
        return self.engine.enabled

    async def async_turn_on(self, **kw) -> None:
        await self.engine.set_enabled(True)

    async def async_turn_off(self, **kw) -> None:
        await self.engine.set_enabled(False)
