"""v0.6.68: strefa G12 z EMS dla innych integracji (np. pakiet pompy ciepla).

binary_sensor.ems_g12_tania_strefa = on w taniej strefie PGE G12 (czas licznika CET, lato 15-17 / zima 13-15).
Atrybuty: minut_do_taniej (0 = teraz tania), minut_do_konca (do konca taniej strefy, gdy teraz tania),
nastepna_zmiana (ISO), cena_zl_kwh. Liczone co minute z tariff.is_cheap - ta sama logika, ktora planuje EMS.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import callback
from homeassistant.helpers.event import async_track_time_change

from . import tariff
from .const import DOMAIN
from .entity import EmsEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([EmsG12Cheap(hass.data[DOMAIN][entry.entry_id])])


def _next_change(now: datetime, cheap: bool) -> int:
    """Minuty do najblizszej zmiany strefy (max 2 doby)."""
    t = now.replace(second=0, microsecond=0)
    for i in range(1, 2 * 1440 + 1):
        if tariff.is_cheap(t + timedelta(minutes=i)) != cheap:
            return i
    return 2 * 1440


class EmsG12Cheap(EmsEntity, BinarySensorEntity):
    _dom = "binary_sensor"
    _attr_icon = "mdi:cash-clock"

    def __init__(self, engine) -> None:
        super().__init__(engine, "g12_tania_strefa", "G12 tania strefa")
        self._on = False
        self._attrs: dict = {}
        self._calc()

    def _calc(self) -> None:
        now = datetime.now(timezone.utc)
        on = tariff.is_cheap(now)
        d = _next_change(now, on)
        self._on = on
        self._attrs = {"minut_do_taniej": 0 if on else d, "minut_do_konca": d if on else 0,
                       "nastepna_zmiana": (now.replace(second=0, microsecond=0) + timedelta(minutes=d)).isoformat(),
                       "cena_zl_kwh": tariff.buy_price(now), "sezon": tariff.season(now)}

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(async_track_time_change(self.hass, self._tick, second=0))

    @callback
    def _tick(self, _now) -> None:
        self._calc()
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return self._on

    @property
    def extra_state_attributes(self) -> dict:
        return self._attrs
