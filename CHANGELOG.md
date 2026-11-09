# Zmiany EMS

## v0.4.0

**Dodane**
- Panel w stylu PGE Net-Billing: zakładki Przegląd | Plan | Ustawienia | Diagnostyka.
- Plan „Teraz + 24 h”: wykres 15 min (ładowanie, sprzedaż, PV, dom, cena RCE z progami, strefy G12, kursor z powodem decyzji), SOC, kafelki, tabela akcji z kolumną „dlaczego”, osobne prognozy PV i zużycia z faktem, harmonogram TOU falownika.
- Plan „Wstecz”: symulacja naszego EMS na całej historii (stary sniffer + datalogger) i bilans w zł vs poprzedni EMS – dzień po dniu, miesiące, razem.
- Ustawienia: część EMS (lato | zima, odpytywanie i przeliczanie, bateria, PV, prognozy), 🔒 limity twarde edytowalne wszędzie, część Inwerter (cały Modbus w grupach jak w PowerWallet), surowy rejestr po odblokowaniu.
- Dymki ⓘ przy wszystkim: co to / jak działa / ➕ / ➖.
- Opis algorytmu i encji: docs/ALGORYTM.md.

**Zmienione**
- Wartości wpisywane w jednostkach bazowych: Moc PV w Wp, pojemność w Wh, kup/sprzedaj w Wh.
- Bilans z mnożnikiem depozytu 1,23 (parametr).
- Zmienione ID encji: number.ems_pv_moc_w, number.ems_pojemnosc_wh, number.ems_kup_wh, number.ems_sprzedaj_wh (stare *_kwh / pv_kwp można usunąć).

**Usunięte**
- Stary jasny wygląd panelu, osobne zakładki „Parametry EMS” i „Konfiguracja inwertera”.

**Wymaga**: datalogger ecobss.yaml v5.1.

## v0.3.0
- Algorytm (prognozy PV i zużycia, ceny RCE, ładowanie w taniej strefie, sprzedaż w najdroższych slotach, burza, blokada eksportu), wyłącznik algorytmu ze snapshotem ustawień, Kup/Sprzedaj teraz, zakładka Diagnostyka z logami, kod w modułach.

## v0.2.0
- Panel EMS w pasku bocznym HA.

## v0.1.0
- Integracja z 84 odczytami falownika z dataloggera ESPHome i interwałem odczytu.
