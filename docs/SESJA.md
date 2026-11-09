# Notatka dla nowej sesji (kontekst projektu EMS)

**Użytkownik**: Misiek (voltronicpl). Odpowiadamy po polsku, luźno, z przekleństwami. **Nigdy nic nie zmieniamy sam** – zawsze krótka lista: dodaję / zmieniam / usuwam, i cała lista od nowa przy każdej zmianie specyfikacji. **Przed push na GitHub zawsze pytamy.**

**Specyfikacja**: dokument „EMS HA – specyfikacja” (claude.ai artifact K9Mg7QDPvbjPtYb3b9j5mx).

## Sprzęt
- Falownik **ECOBSS FLEX 3L** (trójfazowy, mapa jak Deye, adresy z PDF potwierdzone – bez przesunięcia). PV 3300 Wp (Różalin), bateria 15 kWh (300 Ah ustawione, BMS raportuje 200 Ah), PGE G12 (obszar Konstancin), ceny sprzedaży RCE.
- **Datalogger**: EcoBss External v.3 (ESP32-WROVER-IE + THVD1450, RS485 RX34/TX33/DIR32, zasilanie IO5, IO2 LOW, LED IO15/19/21, przycisk IO39) → ESPHome `ecobss.yaml` (ESP = master Modbus). **YAML nie jest w repo** (użytkownik nie chce) – wysyłamy jako plik. Sekrety: `wifi_ssid`, `wifi_password`, `ecobss_api_key`, `ecobss_ota`.
- Stary **sniffer** `modbuis-falownik` (ESP32-S3, prefiks encji `modbus_falownik`) – historia do symulacji wstecz.
- **PowerWallet** (energymanager.powerwallet.pl) – poprzedni EMS; układ „Konfiguracja inwertera” odwzorowany w panelu. Rejestry PW: 901–906 autokonsumpcja, 913–918 sprzedaj do (%), 907–912/919–924 = 0x12C0 (nieznane). PW prawdopodobnie sam przepisuje 242 i SOC punktu wg suwaka „sprzedaj do” – przed startem EMS wyłączyć harmonogram PW.

## Repo `voltronicpl/ems` (publiczne)
- `custom_components/ems/` – integracja; moduły: `prices tariff weather pv_forecast load_forecast planner executor manual backtest diag engine` + encje `sensor switch number button plan_sensor entity`.
- `frontend/` – panel boczny (`ems-panel.js` + `core.js` + `tips.js` + `inverter_spec.js` + `tabs/overview|plan|settings|diag.js`), styl skopiowany z `voltronicpl/PGE-depozyt`.
- Release: sesja **nie może** tworzyć releasów ani pushować tagów – użytkownik robi release ręcznie (`releases/new`, tag `vX.Y.Z`), inaczej HACS pokazuje hash.
- Wersja: `const.VERSION` + `manifest.json` (+ `?v=` w URL panelu).

## Otwarte
- testy na żywym falowniku (zachowanie trybu sprzedaży TOU, 242 vs PowerWallet),
- rejestry 907–912/919–924, „odłączenie baterii przy braku komunikacji”, bity 278 (redukcja szczytów),
- limity temperaturowe baterii (model baterii nieznany – na razie z BMS 823),
- link do strony PGE z godzinami stref (na razie stałe w `tariff.py`).
