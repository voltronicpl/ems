"""Odczyty falownika w EMS - lustro encji z dataloggera ESPHome."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.event import async_track_state_change_event

from .const import CONF_DEVICE, DOMAIN, READINGS
from .plan_sensor import EmsManualSensor, EmsPlanSensor


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    dev = entry.data[CONF_DEVICE]
    ents = [EmsReading(entry, dev, key, name) for key, name in READINGS.items()]
    eng = hass.data[DOMAIN][entry.entry_id]
    ents += [EmsPlanSensor(eng), EmsManualSensor(eng, "kup"), EmsManualSensor(eng, "sprzedaj")]
    async_add_entities(ents)


class EmsReading(SensorEntity):
    """Jeden odczyt falownika, aktualizowany na zmiane encji zrodlowej (bez pollingu)."""

    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, entry: ConfigEntry, dev: str, key: str, name: str) -> None:
        self._src = f"sensor.{dev}_{key}"
        self._attr_name = name
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name="EMS", manufacturer="voltronicpl", model="EMS HA"
        )

    async def async_added_to_hass(self) -> None:
        self._copy(self.hass.states.get(self._src))
        self.async_on_remove(
            async_track_state_change_event(self.hass, [self._src], self._on_change)
        )

    @callback
    def _on_change(self, event: Event) -> None:
        self._copy(event.data.get("new_state"))
        self.async_write_ha_state()

    def _copy(self, st) -> None:
        if st is None or st.state in ("unknown", "unavailable"):
            self._attr_available = False
            return
        self._attr_available = True
        a = st.attributes
        self._attr_native_unit_of_measurement = a.get("unit_of_measurement")
        self._attr_device_class = a.get("device_class")
        self._attr_state_class = a.get("state_class")
        try:
            self._attr_native_value = float(st.state)
        except ValueError:
            self._attr_native_value = st.state
