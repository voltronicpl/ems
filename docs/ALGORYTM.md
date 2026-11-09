# EMS – algorytm, moduły i encje (v0.5.0)

## Przepływ

```
co 10 s  engine._tick
 ├─ co "Przeliczanie planu co" (domyślnie 15 min):  replan()
 │   prices.fetch (RCE PSE dziś+jutro) → weather.fetch (Open-Meteo 15 min, 28 dni wstecz)
 │   → load_forecast.history (statystyki HA, 28 dni) → pv_forecast.forecast (+ korekta dnia)
 │   → load_forecast.forecast (+ wsp. temperatury) → planner.plan → sensor.ems_plan
 └─ co "Zapis do falownika co" (domyślnie 60 s):  execute()
     zadanie ręczne (kup/sprzedaj)  → executor.apply(plan ręczny)
     algorytm włączony              → executor.apply(plan) → 6 punktów TOU + tryb eksportu
```

## Algorytm (`planner.py`)

Sloty 15 min, horyzont = do końca znanych cen RCE (min. 12 h).

1. **Zapas SOC**: `soc_min`; przy burzy (kod pogody 95/96/99) `soc_burza` od `burza_wyprzedzenie_h` przed burzą do jej końca.
2. **Okna**: doba dzielona na bloki taniej strefy G12 (czas licznika CET; zima 13–15, 22–6, lato 15–17, 22–6) i drogie okna między nimi.
3. **Sprzedaż w drogim oknie** (najdroższe sloty RCE najpierw, max `limit_twardy_max_moc_sprzedazy` na slot, limit dzienny = `limit_sprzedazy_<sezon>` × prognoza PV dnia; dzień bez PV → losowo `los_min_wh_<sezon>`–`los_max_wh_<sezon>` (2000–4567 Wh), ziarno = data; w limicie mieści się wszystko – nadwyżka PV i dokupienie):
   - RCE ≥ `prog_droga` → sprzedaje nawet energię potrzebną domowi,
   - RCE ≥ `prog_tania` → sprzedaje nadwyżkę ponad potrzeby domu do następnej taniej strefy,
   - RCE ≥ `prog_bezcen` i po pojawieniu się nadwyżki PV → sprzedaje tylko nadwyżkę PV.
   - **dokupienie pod sprzedaż** (`arbitraz_<sezon>` = 1): próg „tania” obniżony do progu opłacalności `(0,61 / sprawnosc_baterii + koszt_cyklu_zl + arbitraz_zysk_<sezon>) / depozyt_mnoznik` (domyślnie ≈ 0,77 zł); energia „ponad potrzeby domu” liczona z realnej mocy ładowania w poprzedniej taniej strefie (SOC startu + długość strefy × moc ładowania, max `soc_max`).
3a. **Sprzedaż w taniej strefie** (`arbitraz_noc_<sezon>` = 1): w taniej strefie (≥ 2 h) wybiera pełne godziny zegarowe z RCE ≥ progu opłacalności, od najdroższej; godzinę bierze, jeśli symulacja (sprzedaż + dom z baterii w tej godzinie, ładowanie pełną mocą w pozostałych) nie zejdzie poniżej zapasu i na koniec strefy dojdzie do celu. W godzinie sprzedaży: dom z baterii, bez ładowania (bilansowanie godzinowe). Limit dzienny zjadają najpierw okna drogie, noc dostaje resztę.
4. **Cel ładowania** na koniec taniej strefy = zapas + potrzeby domu w następnym oknie + zaplanowana sprzedaż − nadwyżka PV, ograniczony do `soc_max`.
5. **Symulacja** slot po slocie: SOC, pobór/oddanie z sieci (`imp`/`exp`), akcja (`charge`/`sell`/`self`/`block`) i **powód** (`why`).
6. **Blokada eksportu**: bateria pełna i RCE < `prog_bezcen` → `block`.

Moc ładowania = min(limit prądu ładowania 🔒, prąd ładowania z sieci 🔒, limit BMS z temperatury) × napięcie baterii.

## Wykonanie (`executor.py`)

- plan → maks. 6 segmentów w najbliższych 24 h (falownik ma 6 punktów TOU); nadmiar scalany, brakujące dzielone.
- punkt: start HHMM, moc (W), SOC (%), ładowanie z sieci; globalnie harmonogram ON, ładowanie z sieci ON, tryb limitu eksportu = „Sprzedaz wlaczona” tylko w slocie sprzedaży, inaczej „Limit wbudowany”.
- zapisuje tylko różnice; **odmawia zapisu** encji `*_limit_twardy_*`.
- snapshot ustawień użytkownika przy włączeniu algorytmu, przywrócenie przy wyłączeniu (Store `ems_snapshot_<entry>`).

## Ręczne (`manual.py`)

Kup/Sprzedaj teraz (Wh): od teraz przez max 4 h, koniec gdy licznik importu/eksportu urośnie o zadaną ilość albo SOC dojdzie do granicy. Działa też przy wyłączonym algorytmie.

## Symulacja wstecz (`backtest.py`, `GET /api/ems/backtest`)

Statystyki godzinowe HA (bezterminowe) dla prefiksów `modbus_falownik` (stary sniffer) i `<datalogger>` (nowy ma pierwszeństwo). Zużycie, PV1–4, SOC (mean), import/eksport (change liczników dziennych). Ten sam `planner.plan` na prawdziwych danych. Bilans = eksport × RCE × `depozyt_mnoznik` − import × stawka G12 (0,61 / 1,25 zł) + (SOC koniec − SOC start) × pojemność × 0,61. **Bilansowanie godzinowe**: w każdej godzinie zegarowej liczy się tylko nadwyżka poboru albo oddania (jak u sprzedawcy), dla starego i nowego EMS.

## Diagnostyka (`diag.py`)

`/config/ems_logs/ems-RRRR-MM-DD.log` (14 dni), bufor 1000 linii na żywo. API: `GET /api/ems/logs?tail=`, `GET /api/ems/logs/download?day=`, `POST /api/ems/log`. Znaczniki: `[ceny] [pogoda] [pv] [zuzycie] [plan] [wykonanie] [reczne] [wstecz] [parametry] [panel] [silnik] [start]`.

## Encje integracji (stałe ID)

| Encja | Co |
| --- | --- |
| `switch.ems_algorytm` | główny wyłącznik |
| `sensor.ems_plan` | stan = bieżąca akcja; atrybuty: `plan` (sloty), `podsumowanie`, `reczne`, `przeliczono`, `blad` |
| `button.ems_kup_teraz`, `button.ems_sprzedaj_teraz`, `button.ems_przerwij_reczne`, `button.ems_przelicz` | akcje |
| `number.ems_kup_wh`, `number.ems_sprzedaj_wh` | ilości (Wh) |
| `number.ems_interwal` | → `number.<datalogger>_interwal_odczytu` |
| `number.ems_<parametr>` | parametry z `const.PARAMS` (np. `prog_tania_lato`, `soc_min`, `pv_moc_w`, `plan_co_min`) |
| `sensor.ems_<odczyt>` | 84 odczyty z dataloggera (lustro `sensor.<datalogger>_*`) |

## Encje dataloggera (ESPHome `ecobss.yaml`, poza repo)

Odczyty `sensor.ecobss_*` (84), zapis: `number.ecobss_*` (limity 🔒, TOU 1–6, wszystkie rejestry z grup Inwertera), `switch.ecobss_*`, `select.ecobss_*`, `button.ecobss_ustaw_czas_z_ha`, `number.ecobss_interwal_odczytu`, akcje `esphome.ecobss_raw_read` / `esphome.ecobss_raw_write`, wynik w `sensor.ecobss_surowy_odczyt`. Mapa rejestrów: `docs/modbus.md`, grupy panelu: `frontend/inverter_spec.js` (generowane z jednej listy razem z YAML).
