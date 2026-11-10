# Notatka dla nowej sesji (kontekst projektu EMS) – stan na v0.5.3

> **Aktualizować ten plik przy KAŻDEJ nowej wersji** (prośba użytkownika) – nowa sesja ma z niego wiedzieć wszystko.

**Użytkownik**: Misiek (voltronicpl). Odpowiadamy po polsku, luźno, z przekleństwami. **Nigdy nic nie zmieniamy sam** – zawsze krótka lista: dodaję / zmieniam / usuwam, i cała lista od nowa przy każdej zmianie specyfikacji. **Przed push na GitHub zawsze pytamy.**

**Specyfikacja**: dokument „EMS HA – specyfikacja” (claude.ai artifact K9Mg7QDPvbjPtYb3b9j5mx). Algorytm i encje: `docs/ALGORYTM.md`.

## Sprzęt
- Falownik **ECOBSS FLEX 3L** (trójfazowy, mapa jak Deye, adresy z PDF potwierdzone – bez przesunięcia). PV 3300 Wp (Różalin), bateria 15 kWh (300 Ah ustawione, BMS raportuje 200 Ah), PGE G12 (obszar Konstancin), ceny sprzedaży RCE. Zużycie domu ~34 kWh/dobę zimą (~1,4 kW średnio).
- **Datalogger**: EcoBss External v.3 (ESP32-WROVER-IE + THVD1450, RS485 RX34/TX33/DIR32, zasilanie IO5, IO2 LOW, LED IO15/19/21, przycisk IO39) → ESPHome `ecobss.yaml` (ESP = master Modbus). **YAML nie jest w repo** (użytkownik nie chce) – wysyłamy jako plik. Sekrety: `wifi_ssid`, `wifi_password`, `ecobss_api_key`, `ecobss_ota`. Ostatni: **v5.2** (ESPHome 2026.9.1): odczyt blokami ≤100 rejestrów, dwa kontrolery na jednej magistrali – `inv` pomiary co „Interwał odczytu”, `inv_cfg` ustawienia co „Interwał odczytu ustawień” (600 s) + wymuszone przez 3 cykle po każdym zapisie (0x10), `sensor.ecobss_licznik_odczytow` (+1 po pełnym cyklu), switche jako template z ukrytych sensorów rejestrów (modbus switch nie publikował stanu). Zasada: **zapis do falownika tylko przy zmianie, nigdy cyklicznie**. `ModbusCommandItem`/`queue_command` (raw_read/raw_write/czas) deprecated, usunięte w 2027.3 – do przepisania osobno. Log v5.1: magistrala czysta (81/81 odpowiedzi), ale 40 zapytań ≈ 25 s na cykl.
- Stary **sniffer** `modbuis-falownik` (ESP32-S3, prefiks encji `modbus_falownik`) – historia do symulacji wstecz.
- **PowerWallet** (energymanager.powerwallet.pl) – poprzedni EMS; układ „Konfiguracja inwertera” odwzorowany w panelu. Rejestry PW: 901–906 autokonsumpcja, 913–918 sprzedaj do (%), 907–912/919–924 = 0x12C0 (nieznane). PW prawdopodobnie sam przepisuje 242 i SOC punktu wg suwaka „sprzedaj do” – przed startem EMS wyłączyć harmonogram PW.

## Repo `voltronicpl/ems` (publiczne)
- `custom_components/ems/` – integracja; moduły: `prices tariff weather pv_forecast load_forecast planner executor manual backtest diag engine verify` + encje `sensor switch number button plan_sensor entity`. Parametry: `const.PARAMS` → `number.ems_<klucz>` (RestoreNumber – zapisana wartość wygrywa z nową domyślną).
- `frontend/` (w `custom_components/ems/frontend/`) – panel boczny (`ems-panel.js` + `core.js` + `tips.js` + `inverter_spec.js` + `tabs/overview|plan|settings|diag.js`), styl z `voltronicpl/PGE-depozyt`. **Telefon** (≤700 px): style w `@media(max-width:700px)` na końcu `CSS` w `core.js`; tabele, które mają się zamieniać w karty, dostają klasę `rt` i `data-l="etykieta"` na `<td>` (`hd` = nagłówek karty, `wide` = tekst pod etykietą). Wykresy planu: `core.pwChart()` = kopia stylu „Moc i bateria” (`pwSvg` z `pge-net-billing.js`); stary `chart()` tylko dla małych wykresów PV/zużycia.
- **Release automatyczny**: `.github/workflows/release.yml` – po pushu na main tworzy release `v<manifest.version>` z opisem z `CHANGELOG.md` (HACS pokazuje go w HA). Przy każdej nowej wersji: podbić `const.VERSION` + `manifest.json` (to też `?v=` w URL panelu = cache), dopisać `## vX.Y.Z` do `CHANGELOG.md` i **zaktualizować ten plik**. Sesja sama nie tworzy releasów/tagów – robi to workflow.

## Historia wersji (skrót)
- **v0.4.1** – wykresy planu (Teraz + 24 h, Wstecz) w stylu PGE: jeden wykres, schodki kW z wypełnieniem, neonowe ceny (turkus RCE / róż G12, gruba = kupuje / sprzedaje), SOC na osi %, klikane pigułki.
- **v0.5.0** – „⚡ Planowanie energii – dokupienie pod sprzedaż” (lato/zima), arbitraż dzienny + w taniej strefie, symulacja wstecz z bilansowaniem godzinowym i wyceną baterii.
- **v0.5.1** – panel na telefon: ☰ (wyjście do menu HA), przyklejony nagłówek z przewijanymi zakładkami, wykresy skalowane do szerokości (`core.ui.w` → viewBox), dotyk na wykresach (dymek pod wykresem, zostaje po puszczeniu palca), (i) jako plansza na dole, tabele `.rt` → karty na ≤700 px, kafelki 2 w rzędzie, przerysowanie przy złożeniu/rozłożeniu Folda (ResizeObserver). Komputer bez zmian.
- **v0.5.2** – zapis ze sprawdzeniem (`verify.py`, `POST /api/ems/zapis`): panel nie woła już `number.set_value` sam, tylko przez EMS, który czeka na pełny cykl odczytu po zapisie (ESPHome publikuje wartość „na słowo”, a HA połyka identyczne odczyty – dlatego nie `last_reported`). Z `sensor.<dev>_licznik_odczytow` (do dodania w YAML) – licznik +2; bez – 2 × interwał + 3 s i dowód, że datalogger żyje. Executor (algorytm) jeszcze NIE sprawdza – czeka na decyzję.
- **v0.5.3** – straty baterii w planie: `sprawnosc_ladowania` / `sprawnosc_rozladowania` (93/93, zastąpiły `sprawnosc_baterii`) – do baterii energia × ładowanie, z baterii energia / rozładowanie; cel ładowania, „spare”, sprzedaż w taniej strefie i backtest po stratach. Zapis z panelu pomija encje, które już mają wartość („bez zmian”).

## Ustalenia (decyzje użytkownika)
- **Dzienny limit sprzedaży** obejmuje wszystko (nadwyżka PV + dokupione): PV × `limit_sprzedazy_<sezon>` (zima 1,5× – np. PV 4 kWh → sprzedaż 6, czyli 2 kWh dokupione); dzień bez PV → losowo **2000–4567 Wh** (`los_min_wh_*`, `los_max_wh_*`, ziarno = data).
- **Arbitraż**: opłaca się gdy RCE × 1,23 ≥ 0,61 / (sprawność ładowania × rozładowania, 93 × 93 ≈ 86,5%) + zużycie baterii (0,15 zł/kWh) + min. zysk (0,10) → RCE ≳ 0,77 zł. Sprzedaż i ładowanie w taniej strefie zawsze w **różnych godzinach zegarowych** (bilansowanie godzinowe u sprzedawcy – potwierdzone).
- Depozyt pokrywa tylko część „energia” rachunku – użytkownik jest mocno na minusie (pobór ≫ oddanie), więc to nie ogranicza.
- Wniosek z symulacji: przy ~1,4 kW zużycia bateria 15 kWh ledwo pokrywa dom 15–22 → zimą dokupienia pod sprzedaż wieczorem mało; zysk głównie w dni z niższym zużyciem / wysokim RCE.

- Rejestr 214 „Sprawność ładowania” falownika NIE jest źródłem parametrów EMS (to ustawienie do liczenia SOC, nie pomiar).

## Pomysły czekające na decyzję użytkownika (NIE wdrożone)
- Sprzedaż energii domu, gdy RCE × 1,23 > cena drogiej G12 (1,25) + zysk (≈ RCE ≥ 1,10) – dom dokupi później po 1,25 w innej godzinie; dziś robi to dopiero `prog_droga` (2,40).
- Przenoszenie energii z nocy przez ranek na wieczór (dziś każdy blok tani liczony osobno).
- `koszt_cyklu_zl` dokładnie z ceny baterii i liczby cykli z gwarancji (użytkownik ma podać).

## Otwarte
- testy na żywym falowniku (zachowanie trybu sprzedaży TOU – sprzedaż w taniej strefie: punkt TOU bez ładowania z sieci; 242 vs PowerWallet),
- rejestry 907–912/919–924, „odłączenie baterii przy braku komunikacji”, bity 278 (redukcja szczytów),
- limity temperaturowe baterii (model baterii nieznany – na razie z BMS 823),
- link do strony PGE z godzinami stref (na razie stałe w `tariff.py`; ceny G12 0,61/1,25 też skopiowane w `core.js` – zmieniać w obu).
