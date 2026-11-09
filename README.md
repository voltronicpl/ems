# EMS – Energy Management System dla Home Assistant

Własny EMS dla falownika **ECOBSS FLEX 3L** (Modbus RTU) i domu: prognoza zużycia i PV, ładowanie w taniej strefie PGE G12, sprzedaż w najdroższych slotach RCE.

## Części

| Folder | Co to |
| --- | --- |
| `esphome/ecobss.yaml` | firmware ESPHome dla dataloggera EcoBss External v.3 (ESP32-WROVER-IE + THVD1450), ESP = master Modbus |
| `custom_components/ems` | integracja HA (HACS) |
| `docs/modbus.md` | mapa rejestrów falownika |

## Instalacja

1. Wgraj `esphome/ecobss.yaml` na datalogger (ESPHome Builder). Sekrety: `wifi_ssid`, `wifi_password`, `ecobss_api_key`, `ecobss_ota`.
2. HACS → Repozytoria niestandardowe → `https://github.com/voltronicpl/ems` (Integracja) → zainstaluj → restart HA.
3. Ustawienia → Urządzenia → Dodaj integrację → **EMS** → podaj nazwę urządzenia ESPHome (domyślnie `ecobss`).

## v0.1.0

- urządzenie **EMS** z 84 odczytami falownika (napięcia, prądy, moce L1–L3, sieć, przetwornica, UPS, obciążenie, GEN, PV1–4, bateria, BMS, temperatury, energia dzień/łącznie) – aktualizowane na zmianę, bez pollingu
- **Interwał odczytu** (5–600 s) – steruje, jak często datalogger czyta falownik

Algorytm planowania, harmonogram i karta Lovelace – kolejne wersje. Specyfikacja: dokument „EMS HA – specyfikacja”.
