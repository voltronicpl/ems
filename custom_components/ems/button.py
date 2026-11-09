"""Przyciski: Kup teraz, Sprzedaj teraz, Przerwij reczne, Przelicz plan."""
from __future__ import annotations

from homeassistant.components.button import ButtonEntity

from .const import DOMAIN
from .entity import EmsEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    e = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        EmsButton(e, "kup_teraz", "Kup teraz", "mdi:transmission-tower-import", lambda: e.start_manual("buy")),
        EmsButton(e, "sprzedaj_teraz", "Sprzedaj teraz", "mdi:transmission-tower-export", lambda: e.start_manual("sell")),
        EmsButton(e, "przerwij_reczne", "Przerwij reczne", "mdi:stop", e.stop_manual),
        EmsButton(e, "przelicz", "Przelicz plan", "mdi:refresh", lambda: e.replan("przycisk")),
    ])


class EmsButton(EmsEntity, ButtonEntity):
    _dom = "button"
    def __init__(self, engine, key, name, icon, action) -> None:
        super().__init__(engine, key, name)
        self._attr_icon = icon
        self._action = action

    async def async_press(self) -> None:
        await self._action()
