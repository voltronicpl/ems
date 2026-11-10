"""Sensory stanu EMS: biezaca akcja + caly plan w atrybutach (dla panelu), zadanie reczne."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass

from .entity import EmsEntity


class EmsPlanSensor(EmsEntity, SensorEntity):
    _dom = "sensor"
    _attr_icon = "mdi:calendar-clock"
    _unrecorded_attributes = frozenset({"plan", "podsumowanie", "reczne"})

    def __init__(self, engine) -> None:
        super().__init__(engine, "plan", "Plan")

    @property
    def native_value(self) -> str:
        e = self.engine
        if e.manual:
            return "reczne_" + e.manual.kind
        if not e.enabled:
            return "wylaczony"
        cur = e.current()
        return cur["action"] if cur else "brak_planu"

    @property
    def extra_state_attributes(self) -> dict:
        e = self.engine
        return {
            "plan": [{k: s[k] for k in ("start", "action", "grid_kwh", "price", "soc", "pv", "load", "cheap", "storm", "imp", "exp", "why")} for s in e.plan],
            "podsumowanie": e.summary,
            "reczne": e.manual.info() if e.manual else None,
            "algorytm": e.enabled,
            "przeliczono": e.last_plan.isoformat() if e.last_plan else None,
            "blad": e.error,
        }


class EmsManualSensor(EmsEntity, SensorEntity):
    """Recznie kupione / sprzedane dzis (kWh), kwota i wpisy w atrybutach."""

    _unrecorded_attributes = frozenset({"wpisy"})
    _attr_native_unit_of_measurement = "kWh"
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:cart-arrow-down"

    def __init__(self, engine, typ: str) -> None:
        self.typ = typ
        super().__init__(engine, "reczne_kupione_dzis" if typ == "kup" else "reczne_sprzedane_dzis",
                         "Recznie kupione dzis" if typ == "kup" else "Recznie sprzedane dzis")
        if typ != "kup":
            self._attr_icon = "mdi:cash-plus"

    @property
    def native_value(self) -> float:
        return self.engine.manual_today()[self.typ]["kwh"]

    @property
    def last_reset(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Warsaw")).replace(hour=0, minute=0, second=0, microsecond=0)

    @property
    def extra_state_attributes(self) -> dict:
        t = self.engine.manual_today()
        return {"zl": t[self.typ]["zl"], "ile_razy": t[self.typ]["n"],
                "wpisy": [r for r in t["wpisy"] if r["typ"] == self.typ][-10:]}
