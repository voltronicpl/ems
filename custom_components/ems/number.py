"""Ustawienia EMS przekazywane do dataloggera."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo

from .const import CONF_DEVICE, DEFAULT_POLL, DOMAIN, POLL_NUMBER


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    async_add_entities([EmsPollInterval(entry)])


class EmsPollInterval(NumberEntity):
    """Jak czesto datalogger czyta falownik (number.<device>_interwal_odczytu)."""

    _attr_has_entity_name = True
    _attr_name = "Interwal odczytu"
    _attr_native_min_value = 5
    _attr_native_max_value = 600
    _attr_native_step = 1
    _attr_native_unit_of_measurement = UnitOfTime.SECONDS
    _attr_mode = NumberMode.BOX
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: ConfigEntry) -> None:
        self._target = f"number.{entry.data[CONF_DEVICE]}_{POLL_NUMBER}"
        self._attr_unique_id = f"{entry.entry_id}_poll"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="EMS")

    @property
    def native_value(self) -> float | None:
        st = self.hass.states.get(self._target)
        try:
            return float(st.state) if st else DEFAULT_POLL
        except ValueError:
            return DEFAULT_POLL

    async def async_set_native_value(self, value: float) -> None:
        await self.hass.services.async_call(
            "number", "set_value", {"entity_id": self._target, "value": value}, blocking=True
        )
        self.async_write_ha_state()
