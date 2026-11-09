# EMS – Energy Management System dla Home Assistant

Własny EMS dla falownika **ECOBSS FLEX 3L** (Modbus RTU) i domu: prognoza zużycia i PV, ładowanie w taniej strefie PGE G12, sprzedaż w najdroższych slotach RCE.

## Części

| Folder | Co to |
| --- | --- |
| `custom_components/ems` | integracja HA (HACS) |
| `docs/modbus.md` | mapa rejestrów falownika |

## Instalacja

1. Datalogger ESPHome (urządzenie `ecobss`) musi być dodany do HA.
2. HACS → Repozytoria niestandardowe → `https://github.com/voltronicpl/ems` (Integracja) → zainstaluj → restart HA.
3. Ustawienia → Urządzenia → Dodaj integrację → **EMS** → podaj nazwę urządzenia ESPHome (domyślnie `ecobss`).

## v0.4.0

- panel w stylu PGE Net-Billing; zakładki: **Przegląd | Plan | Ustawienia | Diagnostyka**
- **Plan**: wykres 15 min jak w PGE (ładowanie/sprzedaż/PV/dom, cena RCE z progami, strefy G12, kursor z powodem decyzji), SOC, kafelki, tabela akcji z kolumną „dlaczego”, osobne wykresy prognozy PV i zużycia (z faktem), harmonogram TOU falownika
- **Wstecz**: symulacja naszego EMS na prawdziwej historii (od pierwszego dnia danych, stary sniffer + datalogger) i bilans w zł vs poprzedni EMS: dzień po dniu, miesiące, razem
- **Ustawienia** = część EMS (lato | zima, odpytywanie i przeliczanie, bateria, PV w Wp, prognozy) + 🔒 limity twarde (edytowalne wszędzie) + część Inwerter (cały Modbus w grupach jak w PowerWallet) + surowy rejestr po odblokowaniu
- dymki ⓘ przy wszystkim: co to / jak działa / ➕ / ➖
- wartości wpisywane w jednostkach bazowych (W, Wh, A, V); sumy w kWh
- opis algorytmu i encji: `docs/ALGORYTM.md`

## v0.3.0

- **algorytm** (spec 7/7a): prognoza zużycia (te same dni tygodnia + temperatura) i PV (Open-Meteo + mnożniki lato/zima + korekta w trakcie dnia), ceny RCE z PSE (dziś + jutro), ładowanie w taniej strefie G12 tylko tyle, ile trzeba, sprzedaż w najdroższych slotach (progi tania/droga, „za bezcen”, limit dzienny ×PV), zapas na burzę, blokada eksportu za bezcen
- **wyłącznik algorytmu**: wyłączony = działają Twoje ustawienia (EMS robi ich zdjęcie przy włączeniu i przywraca przy wyłączeniu)
- **Kup teraz / Sprzedaj teraz** z wpisaną ilością kWh (działa też przy wyłączonym algorytmie)
- **zakładka Diagnostyka**: logi na żywo z filtrem + pobieranie pliku z całego dnia (`/config/ems_logs/`, 14 dni)
- kod w modułach: `prices`, `tariff`, `weather`, `pv_forecast`, `load_forecast`, `planner`, `executor`, `manual`, `diag`, `engine`; panel: `frontend/tabs/*.js`

## v0.2.0

- panel **EMS** w pasku bocznym HA: Przegląd (na żywo), Plan, Parametry EMS, Konfiguracja inwertera (odczyt/zapis jak w PowerWallet, harmonogram TOU, limity twarde 🔒)

## v0.1.0

- urządzenie **EMS** z 84 odczytami falownika (napięcia, prądy, moce L1–L3, sieć, przetwornica, UPS, obciążenie, GEN, PV1–4, bateria, BMS, temperatury, energia dzień/łącznie) – aktualizowane na zmianę, bez pollingu
- **Interwał odczytu** (5–600 s) – steruje, jak często datalogger czyta falownik

Algorytm planowania, harmonogram i karta Lovelace – kolejne wersje. Specyfikacja: dokument „EMS HA – specyfikacja”.
