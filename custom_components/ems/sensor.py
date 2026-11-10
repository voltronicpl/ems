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
    ents += [PgeSensor(eng, entry, *spec) for spec in PGE_SENSORS]
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


# ---------- Rozliczenie PGE (dawna integracja PGE Net-Billing) ----------
from homeassistant.components.sensor import SensorDeviceClass, SensorStateClass  # noqa: E402

PGE_SENSORS = [
    ("import_s1", "Pobór S1", "kWh"), ("import_s2", "Pobór S2", "kWh"),
    ("export_kwh", "Eksport", "kWh"), ("energy_cost", "Koszt energii netto", "PLN"),
    ("distribution_cost", "Koszt dystrybucji zmiennej netto", "PLN"),
    ("export_value", "Wartość eksportu (szacunek)", "PLN"),
    ("unpriced_export_kwh", "Eksport bez ceny RCE", "kWh"),
    ("deposit_estimate", "Saldo depozytu (prognoza)", "PLN"),
    ("deposit_available", "Depozyt dostępny teraz", "PLN"),
    ("deposit_pending", "Depozyt naliczany w tym miesiącu", "PLN"),
    ("deposit_next_month", "Depozyt dostępny od przyszłego miesiąca", "PLN"),
    ("deposit_previous_month", "Depozyt na koniec poprzedniego miesiąca", "PLN"),
    ("deposit_added", "Depozyt naliczony łącznie", "PLN"),
    ("deposit_used", "Depozyt wykorzystany łącznie", "PLN"),
    ("deposit_expired", "Depozyt wygasły łącznie", "PLN"),
    ("variable_cost_gross", "Koszt zmienny brutto", "PLN"),
    ("net_energy_estimate", "Energia po depozycie (miesiąc)", "PLN"),
    ("fixed_monthly", "Opłaty stałe miesięcznie brutto", "PLN"),
    ("rce_current", "Aktualna RCE brutto", "PLN/kWh"),
    ("pending_export_kwh", "Eksport oczekujący na RCE", "kWh"),
    ("data_gaps", "Niekompletne pomiary", ""),
    ("invoice_forecast", "Prognoza rachunku za bieżący miesiąc", "PLN"),
]
PGE_CUMULATIVE = {"energy_cost", "distribution_cost", "export_value"}
PGE_SNAPSHOT = {"invoice_forecast", "deposit_estimate", "rce_current", "deposit_available", "deposit_next_month", "deposit_previous_month", "deposit_pending"}


class PgeSensor(SensorEntity):
    """Szacunek rozliczenia PGE; translation_key = pge_<klucz> (po nim zakladka PGE znajduje encje)."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, eng, entry: ConfigEntry, key: str, label: str, unit: str) -> None:
        self.eng, self.key = eng, key
        self._attr_name = label
        self._attr_unique_id = f"{entry.entry_id}_pge_{key}"
        self._attr_translation_key = f"pge_{key}"
        self._attr_native_unit_of_measurement = unit or None
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, f"{entry.entry_id}_pge")}, name="EMS – rozliczenie PGE", manufacturer="EMS")
        if unit == "kWh":
            self._attr_state_class = SensorStateClass.TOTAL
        elif key in PGE_CUMULATIVE:
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_state_class = SensorStateClass.TOTAL
        elif key in PGE_SNAPSHOT:
            self._attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def extra_state_attributes(self):
        return {"note": "Szacunek lokalny, nie oficjalne rozliczenie PGE", **self.eng.pge.attributes(self.key)}

    @property
    def native_value(self):
        return self.eng.pge.value(self.key)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.eng.pge.subscribe(self.async_write_ha_state))
