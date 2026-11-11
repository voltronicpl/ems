# Modbus ECOBSS FLEX 3L

RS485, 9600 bps, 8N1, Modbus RTU, adres 1. Odczyt 03H, zapis 10H (holding). Adresy z PDF „Rejestr adresów MODBUS” potwierdzone odczytem (688 = SOC, 686 = temp. baterii) – bez przesunięcia.

## Ustawienia (R/W)

| Adres | Nazwa | Jednostka |
| --- | --- | --- |
| 202 | pojemność baterii | Ah |
| 208 / 209 | max prąd ładowania / rozładowania | A |
| 212 | aktywacja baterii | 0/1 |
| 215 / 216 / 217 | LOAD wył. / LOAD wł. / niski poziom | % |
| 228 | prąd ładowania z sieci | A |
| 230 | ładowanie z sieci dozwolone | 0/1 |
| 241 | priorytet energii: 0 bateria, 1 obciążenia | – |
| 242 | limit eksportu: 0 sprzedaż, 1 wbudowany, 2 zewn. | – |
| 243 | max moc sprzedaży | W |
| 245 | sprzedaj nadwyżkę PV | 0/1 |
| 246 | harmonogram TOU + dni (bity) | – |
| 278 | bity 5:4 „Pmax zakupu” (Grid Peak Shaving, LCD: Tryb pracy): 11 wł., 10 wył. (różni się tylko bit 4 = 0x10) – zaznaczony blokuje sprzedaż; zapis TYLKO 10H (06H falownik ignoruje – stąd wcześniej „nie da się zapisać”); YAML v5.7: `switch` „Pmax zakupu” (bit 0x10, zapis 10H); EMS sam nie przestawia | – |
| 291 | wartość „Pmax zakupu” (moc szczytowa sieci) | W |
| 248–253 | start punktów TOU | HHMM |
| 254–259 | moc punktów TOU | W |
| 266–271 | SOC punktów TOU | % |
| 272–277 | ładowanie z sieci w punkcie (bit0) | – |
| 440 | max moc sprzedaży z PV | W |
| 901–906 | autokonsumpcja do poziomu 1–6 (blok PowerWallet) | % |
| 913–918 | sprzedaj do poziomu 1–6 (blok PowerWallet) | % |
| 907–912, 919–924 | 0x12C0, prawdopodobnie 48,00 V – do ustalenia | – |

## Odczyty

Uwagi: radiator 641 = (raw − 1000) / 10; liczniki „łącznie” 32-bit, młodsze słowo pierwsze; moce S16.

## Rejestry w grupach panelu (Ustawienia → Inwerter)

Pełna lista z adresami: `custom_components/ems/frontend/inverter_spec.js` (pole `r`). Dodatkowo: 162–164 czas systemowy (rok−2000<<8|miesiąc, dzień<<8|godzina, minuta<<8|sekunda) – przycisk „Ustaw czas z HA”; surowy odczyt/zapis dowolnego rejestru po odblokowaniu.
