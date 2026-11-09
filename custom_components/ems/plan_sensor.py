"""Sensory stanu EMS: biezaca akcja + caly plan w atrybutach (dla panelu), zadanie reczne."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity

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
