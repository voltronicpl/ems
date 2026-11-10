# Zmiany EMS

## v0.5.2

**Dodane**
- Zapis ze sprawdzeniem w falowniku: „Zapisz”, przełączniki i listy wyboru w panelu idą przez `POST /api/ems/zapis` – EMS zapisuje, czeka na pełny cykl odczytu dataloggera **po** zapisie i porównuje z tym, co wysłałeś.
  - pole w trakcie: żółte, „⏳ sprawdzam w falowniku…”, przycisk „Sprawdzam…”,
  - potwierdzone: komunikat „✅ Zapisano – falownik potwierdził” z listą wartości,
  - nie przyjęte: pole czerwone, komunikat „❌ falownik ma X, a nie Y” albo „brak nowego odczytu – nie potwierdzono”; wpisana wartość zostaje do poprawki,
  - każdy wynik w logu dnia (znacznik `[zapis]`: ZAPISANO / NIE ZAPISANO).
- Szybsze potwierdzanie, jeśli ESP ma licznik cykli odczytu `sensor.<datalogger>_licznik_odczytow` (2 cykle po zapisie). Bez niego: 2 × interwał odczytu + 3 s.

**Zmienione**
- Przełączniki „dokupienie pod sprzedaż” / „sprzedaż w taniej strefie” też z komunikatem „Zapisano”.

## v0.5.1

**Dodane**
- Panel na telefon (≤ 700 px, też Galaxy Fold złożony i rozłożony):
  - przycisk ☰ – otwiera menu Home Assistant (wcześniej na telefonie nie dało się wyjść z panelu),
  - nagłówek z zakładkami przyklejony u góry, zakładki przewijane w bok,
  - wykresy skalowane do szerokości ekranu (czytelne podpisy, mniej etykiet godzin),
  - dotyk na wykresach: dotknij albo przesuń palcem – szczegóły slotu pod wykresem (zostają po puszczeniu palca i po odświeżeniu),
  - dymki (i) jako plansza na dole ekranu,
  - tabele (przeliczniki lato/zima, dokupienie pod sprzedaż, TOU, zaplanowane akcje, miesiące) jako karty; „Dzień po dniu” przewijana w bok z podpowiedzią,
  - kafelki 2 w rzędzie, większe przyciski i pola (16 px – bez przybliżania przy wpisywaniu),
  - przerysowanie przy złożeniu / rozłożeniu telefonu.

**Zmienione**
- Siatki kafelków i ramek nie wychodzą poza ekran na wąskich telefonach (< 360 px).
- Kup / Sprzedaj teraz, filtr logów i surowy rejestr bez stałych szerokości na telefonie.

## v0.5.0

**Dodane**
- Ustawienia → nowa rubryka „⚡ Planowanie energii – dokupienie pod sprzedaż” (☀ lato / ❄ zima): limit sprzedaży × PV, losowy limit dnia bez PV (od–do Wh), dokupienie pod sprzedaż wł./wył., sprzedaż w taniej strefie (noc) wł./wył., min. zysk; wspólne: sprawność baterii, koszt zużycia baterii. Pod spodem wyliczony próg RCE, od którego się opłaca.
- Algorytm: dokupienie w taniej strefie pod sprzedaż w następnym drogim oknie, gdy RCE × depozyt − (0,61 / sprawność + zużycie) ≥ min. zysk. Liczy realną moc ładowania w taniej strefie.
- Algorytm: sprzedaż z baterii w samej taniej strefie (noc / 13–15) w godzinach z najwyższym RCE, ładowanie w innych godzinach (bilansowanie godzinowe).
- Wszystko mieści się w dziennym limicie sprzedaży (PV × mnożnik, dzień bez PV losowo od–do).
- Symulacja wstecz: bilansowanie godzinowe (pobór i oddanie w tej samej godzinie się znoszą) i wycena energii w baterii na koniec dnia (kolumna „Bateria”, SOC start → koniec).
- `docs/SESJA.md` aktualizowany przy każdej wersji – notatka dla nowej sesji.

**Zmienione**
- Dzień bez PV: losowy limit 1–4 kWh → 2000–4567 Wh (ustawiane).
- Domyślny limit sprzedaży zimą 2,0× → 1,5× PV (zapisana już wartość w HA zostaje – przestaw ręcznie).
- „Limit sprzedaży” przeniesiony z przeliczników do nowej rubryki.

## v0.4.1

**Zmienione**
- Wykresy planu w stylu „Moc i bateria” z PGE Net-Billing: jeden duży wykres zamiast kilku – schodki mocy (kW) z wypełnieniem, neonowe ceny (turkus = RCE, róż = G12; gruba świecąca linia = wtedy kupuje / sprzedaje), SOC na osi %, tania strefa G12 jako niebieski pas, klikane pigułki legendy.
- Plan „Teraz + 24 h”: ładowanie, sprzedaż, PV, dom, SOC planu, ceny i progi na jednym wykresie.
- Plan „Wstecz”: nasz EMS (ładowanie, sprzedaż, SOC) i stary EMS (sieć, SOC) na jednym wykresie.

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
