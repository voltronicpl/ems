# Notatka dla nowej sesji (kontekst projektu EMS) – stan na v0.5.0

> **Aktualizować ten plik przy KAŻDEJ nowej wersji** (prośba użytkownika) – nowa sesja ma z niego wiedzieć wszystko.

**Użytkownik**: Misiek (voltronicpl). Odpowiadamy po polsku, luźno, z przekleństwami. **Nigdy nic nie zmieniamy sam** – zawsze krótka lista: dodaję / zmieniam / usuwam, i cała lista od nowa przy każdej zmianie specyfikacji. **Przed push na GitHub zawsze pytamy.**

**Specyfikacja**: dokument „EMS HA – specyfikacja” (claude.ai artifact K9Mg7QDPvbjPtYb3b9j5mx). Algorytm i encje: `docs/ALGORYTM.md`.

## Sprzęt
- Falownik **ECOBSS FLEX 3L** (trójfazowy, mapa jak Deye, adresy z PDF potwierdzone – bez przesunięcia). PV 3300 Wp (Różalin), bateria 15 kWh (300 Ah ustawione, BMS raportuje 200 Ah), PGE G12 (obszar Konstancin), ceny sprzedaży RCE. Zużycie domu ~34 kWh/dobę zimą (~1,4 kW średnio).
- **Datalogger**: EcoBss External v.3 (ESP32-WROVER-IE + THVD1450, RS485 RX34/TX33/DIR32, zasilanie IO5, IO2 LOW, LED IO15/19/21, przycisk IO39) → ESPHome `ecobss.yaml` (ESP = master Modbus). **YAML nie jest w repo** (użytkownik nie chce) – wysyłamy jako plik. Sekrety: `wifi_ssid`, `wifi_password`, `ecobss_api_key`, `ecobss_ota`. Ostatni: **v5.1** (ESPHome 2026.9.1; `ModbusCommandItem`/`queue_command` deprecated, usunięte w 2027.3 – do przepisania).
- Stary **sniffer** `modbuis-falownik` (ESP32-S3, prefiks encji `modbus_falownik`) – historia do symulacji wstecz.
- **PowerWallet** (energymanager.powerwallet.pl) – poprzedni EMS; układ „Konfiguracja inwertera” odwzorowany w panelu. Rejestry PW: 901–906 autokonsumpcja, 913–918 sprzedaj do (%), 907–912/919–924 = 0x12C0 (nieznane). PW prawdopodobnie sam przepisuje 242 i SOC punktu wg suwaka „sprzedaj do” – przed startem EMS wyłączyć harmonogram PW.

## Repo `voltronicpl/ems` (publiczne)
- `custom_components/ems/` – integracja; moduły: `prices tariff weather pv_forecast load_forecast planner executor manual backtest diag engine` + encje `sensor switch number button plan_sensor entity`. Parametry: `const.PARAMS` → `number.ems_<klucz>` (RestoreNumber – zapisana wartość wygrywa z nową domyślną).
- `frontend/` (w `custom_components/ems/frontend/`) – panel boczny (`ems-panel.js` + `core.js` + `tips.js` + `inverter_spec.js` + `tabs/overview|plan|settings|diag.js`), styl z `voltronicpl/PGE-depozyt`. Wykresy planu: `core.pwChart()` = kopia stylu „Moc i bateria” (`pwSvg` z `pge-net-billing.js`); stary `chart()` tylko dla małych wykresów PV/zużycia.
- **Release automatyczny**: `.github/workflows/release.yml` – po pushu na main tworzy release `v<manifest.version>` z opisem z `CHANGELOG.md` (HACS pokazuje go w HA). Przy każdej nowej wersji: podbić `const.VERSION` + `manifest.json` (to też `?v=` w URL panelu = cache), dopisać `## vX.Y.Z` do `CHANGELOG.md` i **zaktualizować ten plik**. Sesja sama nie tworzy releasów/tagów – robi to workflow.

## Historia wersji (skrót)
- **v0.4.1** – wykresy planu (Teraz + 24 h, Wstecz) w stylu PGE: jeden wykres, schodki kW z wypełnieniem, neonowe ceny (turkus RCE / róż G12, gruba = kupuje / sprzedaje), SOC na osi %, klikane pigułki.
- **v0.5.0** – „⚡ Planowanie energii – dokupienie pod sprzedaż” (lato/zima), arbitraż dzienny + w taniej strefie, symulacja wstecz z bilansowaniem godzinowym i wyceną baterii.

## Ustalenia (decyzje użytkownika)
- **Dzienny limit sprzedaży** obejmuje wszystko (nadwyżka PV + dokupione): PV × `limit_sprzedazy_<sezon>` (zima 1,5× – np. PV 4 kWh → sprzedaż 6, czyli 2 kWh dokupione); dzień bez PV → losowo **2000–4567 Wh** (`los_min_wh_*`, `los_max_wh_*`, ziarno = data).
- **Arbitraż**: opłaca się gdy RCE × 1,23 ≥ 0,61 / sprawność (87%) + zużycie baterii (0,15 zł/kWh) + min. zysk (0,10) → RCE ≳ 0,77 zł. Sprzedaż i ładowanie w taniej strefie zawsze w **różnych godzinach zegarowych** (bilansowanie godzinowe u sprzedawcy – potwierdzone).
- Depozyt pokrywa tylko część „energia” rachunku – użytkownik jest mocno na minusie (pobór ≫ oddanie), więc to nie ogranicza.
- Wniosek z symulacji: przy ~1,4 kW zużycia bateria 15 kWh ledwo pokrywa dom 15–22 → zimą dokupienia pod sprzedaż wieczorem mało; zysk głównie w dni z niższym zużyciem / wysokim RCE.

## Pomysły czekające na decyzję użytkownika (NIE wdrożone)
- Sprzedaż energii domu, gdy RCE × 1,23 > cena drogiej G12 (1,25) + zysk (≈ RCE ≥ 1,10) – dom dokupi później po 1,25 w innej godzinie; dziś robi to dopiero `prog_droga` (2,40).
- Przenoszenie energii z nocy przez ranek na wieczór (dziś każdy blok tani liczony osobno).
- `koszt_cyklu_zl` dokładnie z ceny baterii i liczby cykli z gwarancji (użytkownik ma podać).

## Otwarte
- testy na żywym falowniku (zachowanie trybu sprzedaży TOU – sprzedaż w taniej strefie: punkt TOU bez ładowania z sieci; 242 vs PowerWallet),
- rejestry 907–912/919–924, „odłączenie baterii przy braku komunikacji”, bity 278 (redukcja szczytów),
- limity temperaturowe baterii (model baterii nieznany – na razie z BMS 823),
- link do strony PGE z godzinami stref (na razie stałe w `tariff.py`; ceny G12 0,61/1,25 też skopiowane w `core.js` – zmieniać w obu).
