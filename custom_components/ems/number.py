"""Liczby EMS: parametry algorytmu (lato/zima), ilosci do kupna/sprzedazy, interwal odczytu dataloggera."""
from __future__ import annotations

from homeassistant.components.number import NumberMode, RestoreNumber
from homeassistant.const import EntityCategory

from .const import DEFAULT_POLL, DOMAIN, MANUAL, PARAMS, POLL_NUMBER
from .diag import get_logger
from .entity import EmsEntity

LOG = get_logger("parametry")


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    e = hass.data[DOMAIN][entry.entry_id]
    ents = [EmsParam(e, k, v, EntityCategory.CONFIG) for k, v in PARAMS.items()]
    ents += [EmsParam(e, k, v, None) for k, v in MANUAL.items()]
    ents.append(EmsPollInterval(e))
    async_add_entities(ents)


class EmsParam(EmsEntity, RestoreNumber):
    _dom = "number"
    _attr_mode = NumberMode.BOX

    def __init__(self, engine, key, spec, cat) -> None:
        name, mn, mx, step, unit, default = spec
        super().__init__(engine, key, name)
        self.key = key
        self._attr_native_min_value, self._attr_native_max_value, self._attr_native_step = mn, mx, step
        self._attr_native_unit_of_measurement = unit
        self._attr_entity_category = cat

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_number_data()
        if last and last.native_value is not None:
            self.engine.p[self.key] = last.native_value

    @property
    def native_value(self) -> float:
        return self.engine.p[self.key]

    async def async_set_native_value(self, value: float) -> None:
        LOG.info("Parametr %s: %s -> %s", self.key, self.engine.p[self.key], value)
        self.engine.p[self.key] = value
        self.async_write_ha_state()


class EmsPollInterval(EmsEntity, RestoreNumber):
    _dom = "number"
    """Jak czesto datalogger czyta falownik - przekazywane do number.<dev>_interwal_odczytu."""

    _attr_mode = NumberMode.BOX
    _attr_native_min_value, _attr_native_max_value, _attr_native_step = 5, 600, 1
    _attr_native_unit_of_measurement = "s"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, engine) -> None:
        super().__init__(engine, "interwal", "Interwal odczytu")
        self._target = f"number.{engine.dev}_{POLL_NUMBER}"

    @property
    def native_value(self) -> float:
        st = self.hass.states.get(self._target) if self.hass else None
        try:
            return float(st.state)
        except (AttributeError, ValueError, TypeError):
            return DEFAULT_POLL

    async def async_set_native_value(self, value: float) -> None:
        await self.hass.services.async_call("number", "set_value", {"entity_id": self._target, "value": value}, blocking=True)
        self.async_write_ha_state()
