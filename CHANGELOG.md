# Zmiany EMS

## v0.6.5

**Zmienione**
- EMS-001: linie przesyłu widoczne już od 5 W (było 20 W); najwolniejsza animacja poniżej 100 W.
- EMS-002: łagodne ładowanie z sieci w algorytmie – parametr „Łagodne ładowanie z sieci” (domyślnie 0,2C ≈ 3 kW przy 15 kWh). Szybciej (do limitów) tylko gdy przy tej mocy nie zdąży do celu przed końcem taniej strefy – powód w dymku planu. Moc punktu TOU z planu (kroki 500 W). Ręczne kupno zawsze pełną mocą.
- EMS-003: Plan po wejściu w zakładkę zawsze na „Teraz” (±12 h, podświetlone).
- EMS-004: konsumpcja domu w pasie Moc – pomiar wypełnioną linią, prognoza przerywaną (ten sam niebieski).
- EMS-005: kolejność pasów w Planie: Moc → SOC → Ceny.
- EMS-006: pasek dni: 3 dni wstecz, Teraz, jutro + 📅 kalendarz.
- EMS-007: przyciski Tydzień (pn–nd, co 15 min) i Miesiąc (co 1 h) – ten sam wykres Planu ze statystyk HA i zapisanych prognoz.

## v0.6.4

**Zmienione**
- Przegląd: nowe tło sceny (grafika użytkownika bez kafelków), kafelki i linie przesyłu ułożone od nowa. Kafelek Sieć: „← Pobór” (czerwony, od słupa do domu), „→ Oddawanie” (niebieski).
- Tło na wszystkich zakładkach: ta sama grafika, przyciemniona i rozmyta, ramki półprzezroczyste.
- Profil mocy (Przegląd) wg wzoru użytkownika: okno teraz ±12 h („teraz” na środku), pomiar co 1 min gładką linią z wypełnieniem, **prognoza linią przerywaną** (PV, dom, bateria, sieć, SOC z planu), oś „Moc [kW]” symetryczna, SOC na osi %, kropki i dymek pod kursorem, klikana legenda, plakietka SOC. Znaki: bateria + = ładowanie, sieć − = pobór.
- Plan: jeden wykres zamiast „Teraz + 24 h” / „Wstecz” – pasek dni na górze (14 dni wstecz, **Teraz**, jutro). „Teraz” = okno ±12 h z „teraz” na środku; inny dzień = 00–24. Przeszłość: pomiar co 1 min + przerywana prognoza, jaką EMS wtedy miał; ceny RCE także wstecz. Symulacja „nasz EMS vs stary” jako ramka pod wykresem.
- Harmonogram TOU także w Ustawieniach (na górze; wspólny kod z Planem).

**Dodane**
- Okno „Prognoza vs rzeczywistość” (klik w Profil mocy albo przycisk): wykres godzinowy fakt / prognoza, tabela godzinowa PV i dom (fakt, prognoza ostatnia i z rana, błąd), ładowanie i sprzedaż plan / fakt, podsumowanie dnia (błąd kWh i %, trafione godziny ±10 %), dni ◀ ▶.
- EMS zapisuje prognozę każdego slotu (pierwsza „z rana” i ostatnia przed slotem; Store `ems_prognozy_<wpis>`, 14 dni). API `GET /api/ems/dzien?day=` (prognozy + ceny RCE dnia).

## v0.6.3

**Poprawione**
- Ręczne kupno / ładowanie z planu nie ładowało baterii: EMS nie ustawiał w punktach TOU „Autokonsumpcja do” (901–906) i „Sprzedaj do” (913–918). Teraz ustawia je w każdym punkcie:
  - ładowanie: „Z sieci” ON, „Autokonsumpcja do” = cel (SOC max), „Sprzedaj do” 100 %,
  - sprzedaż: „Z sieci” OFF, „Autokonsumpcja do” i „Sprzedaj do” = rezerwa SOC,
  - autokonsumpcja: „Z sieci” OFF, „Autokonsumpcja do” = dolny limit (SOC min / burza) – bateria trzyma limit, dom bierze z sieci do taniej strefy; „Sprzedaj do” 100 %.
  Te pola są też w snapshocie (przywracane po wyłączeniu algorytmu).
- Postęp ręcznego kupna liczony z ładowania baterii (licznik dzienny), a nie z importu z sieci (który łapał też zużycie domu).

**Dodane**
- Ręczne zlecenie: po 3 min sprawdzenie, czy falownik faktycznie ładuje / oddaje do sieci – jeśli nie, ostrzeżenie w Przeglądzie, w Planie i w logu `[reczne]`. Zlecenie ręczne nadal ma pierwszeństwo przed algorytmem, a EMS co cykl poprawia wpisy w TOU, jeśli ktoś je zmienił.
- Harmonogram TOU (Plan): „Odczyt” i „Zapisz” zawsze, także przy włączonym algorytmie (informacja, że EMS nadpisze przy następnym zapisie), oraz „Ostatni zapis EMS do TOU”.

## v0.6.2

**Zmienione**
- Plan „Teraz + 24 h” → „Dziś + jutro” na osi minutowej: od 00:00 do teraz pomiary z dataloggera co 1 min (PV, dom, bateria + ładowanie, sieć + pobór, SOC), dalej plan (sloty 15 min rozłożone na minuty). Kursor / dotyk co 1 minutę na całym wykresie; w dymku przed „teraz” pomiar z tej minuty i ręczne kupno / sprzedaż, jeśli trwało. Odświeżane po każdym odczycie pomiarów dataloggera.
- Dane minutowe wspólne dla Profilu mocy i Planu (`frontend/minute.js`) – historia pobierana raz.

## v0.6.1

**Dodane**
- Historia ręcznego kupna / sprzedaży (14 dni, Store `ems_reczne_<wpis>`): od–do, zadane i zrobione kWh, **kwota zł** (kupno: stawka G12 w danej chwili, sprzedaż: RCE × mnożnik depozytu, liczone przyrostowo co cykl), powód końca (cel / granica SOC / limit 4 h / przerwane / zastąpione). API `GET /api/ems/reczne?dni=`.
- Sensory `sensor.ems_reczne_kupione_dzis` i `sensor.ems_reczne_sprzedane_dzis` (kWh, od północy; atrybuty `zl`, `ile_razy`, `wpisy`).
- Przegląd: „Ręcznie teraz” – podsumowanie dnia (kupione / sprzedane, kWh i zł), 3 ostatnie wpisy z godzinami, kliknięcie → okno z pełną listą (dziś / 7 / 14 dni, sumy). Kwota zł także przy zadaniu w toku.
- Przegląd: „Energia dziś” – wiersze „Ręcznie kupione” i „Ręcznie sprzedane” (kWh · zł).
- Wykresy (Profil mocy, Plan „Teraz + 24 h” i „Wstecz”): ręczne kupno / sprzedaż jako zaznaczony pas czasu z opisem (kupno pomarańczowe, sprzedaż niebieska).

**Zmienione**
- Profil mocy (Przegląd): dane co 1 minutę zamiast średnich 15-min, wypełnione linie zamiast słupków, najechanie / dotyk na każdą minutę (godzina, PV, bateria, sieć, dom, SOC, ręczne w tej minucie). Odświeżany po każdym nowym odczycie pomiarów z dataloggera (dociągany tylko nowy kawałek historii).

## v0.6.0

**Dodane**
- Przegląd: animowane linie przesyłu na scenie (PV → dom, bateria ↔ dom, sieć ↔ dom; linia do auta wygaszona). Neon z poświatą i biegnącymi impulsami, kierunek wg znaku mocy, prędkość w 3 progach (< 500 W, < 1500 W, więcej), poniżej 20 W linia gaśnie (szary kabel). Kolory: PV zielony; sieć – pobór czerwony, oddawanie niebieskie; bateria – ładowanie pomarańczowe, rozładowanie zielone. Bez animacji przy „ograniczonym ruchu” w systemie (`frontend/flow.js`).
- Karta na pulpit `custom:ems-card` (mały kafelek: PV, Bateria z SOC/mocą/ład.-rozł./V/°C, Dom, Sieć z importem/eksportem dziś) z tymi samymi animowanymi liniami. Rejestrowana automatycznie przez integrację; opcje `device` (domyślnie `ecobss`) i `navigate` (domyślnie `/ems`, kliknięcie otwiera panel).

**Zmienione**
- Nowe tło sceny Przeglądu (`frontend/scene.jpg`) – grafika użytkownika bez namalowanych linii, czerwone auto; kafelki dopasowane do nowego obrazka.

## v0.5.9

**Dodane**
- Dymek (i) przy każdym polu Części Inwerter (sieć, bateria, port GEN, tryb pracy, czas) – co robi ustawienie, jak działa, na co uważać (`frontend/inverter_tips.js`).
- Nowe logo EMS w nagłówku panelu (`frontend/logo.png`).
- Plan: okienka „Kup energię teraz” / „Sprzedaj teraz” (jak w Przeglądzie) pod wykresem, z postępem i „Przerwij”.
- Przegląd wg wzoru użytkownika: scena (dom, PV, bateria, sieć – obrazek użytkownika `frontend/scene.jpg`) z żywymi kafelkami PV / Bateria (SOC, ład./rozł. dziś, moc, „do pełna”) / Dom / Sieć oraz pogoda, data i godzina; rząd kafelków SOC, Moc baterii, PV, Dom, Sieć, Autokonsumpcja; sterowanie w Przeglądzie (Algorytm z najbliższą akcją, Kup / Sprzedaj z postępem i Przerwij, Szybkie akcje: Przelicz plan, Odczytaj falownik, Ustaw czas + ostatni odczyt/zapis); Energia dziś, Profil mocy (dziś, z historii HA co 15 min), Autokonsumpcja PV → dom / bateria / sieć; Sieć (3F), Przetwornica, PV (stringi).
- Ikony zamiast emoji (`frontend/icons.js`): kolorowe z gradientami i poświatą (słońce, bateria z ogniwami, piorun, dom ze światłem w oknie, słup, liść, monety) na kafelkach, scenie i pasach wykresu planu; liniowe w nagłówkach ramek, przyciskach i pasku pogody.
- Pasek pogody: kolorowa ikona zależna od pogody w HA (słońce, słońce z chmurą, chmura, deszcz, śnieg, burza, księżyc), kalendarz i zegar.
- Plakietka „Tryb: …” w nagłówku panelu (bieżąca akcja planu) na każdej zakładce.

**Zmienione**
- Wykres planu wg wzoru użytkownika: pasy w ramkach z ikoną i opisem po lewej („Ceny energii zł/kWh”, „Moc kW (± sieć / bateria)”, „SOC baterii”), progi i „min 25%” jako kolorowe pigułki po prawej, oś mocy symetryczna (np. ±10 co 2,5), kropki na liniach cen i SOC pod kursorem, dymek obok kursora z kolorowymi kropkami (RCE, G12, ładowanie kW, sprzedaż kW, PV / dom kW, SOC).
- Plan: „Teraz + 24 h” / „Wstecz” i „przeliczono … / Przelicz” w jednym rzędzie, „taryfa: G12” w nagłówku wykresu.

## v0.5.8

**Poprawione**
- „Odczyt” i potwierdzenie zapisu nie widziały odczytu dataloggera, gdy HA nadał encjom ESPHome inne ID niż `sensor.<dev>_ostatni_odczyt_ustawien` (ESP czytał w 3 s, EMS po 25 s „brak odczytu”). EMS szuka teraz encji dataloggera (ostatni odczyt, licznik cykli, interwał) w rejestrze HA po nazwie z ESPHome; znalezione ID w logu.
- Komunikat błędu mówi konkretnie: encja wyłączona w HA / brak encji / brak zmiany.
- Pasek potwierdzeń w Części Inwerter też szuka tych encji po nazwie.

**Dodane**
- Diagnostyka: przycisk „📋 Kopiuj” – kopiuje widoczne linie logu (z filtrem) do schowka (działa też po http), widać 1000 ostatnich linii.
- Więcej debugu przy zapisie i odczycie: co panel wysłał, stan przed zapisem, wysłanie do dataloggera, na co czeka (interwał, limit, licznik, encja odczytu), po ilu sekundach przyszedł odczyt i jakie wartości.

## v0.5.7

**Dodane**
- Przycisk „Odczyt” w grupach naprawdę czyta z falownika: EMS każe dataloggerowi przeczytać ustawienia od razu (akcja `esphome.<dev>_odczytaj_ustawienia`), czeka na odczyt i pokazuje „✅ Odczytano z falownika o HH:MM:SS” z listą wartości; pola dostają świeże wartości. W trakcie „⏳ odczytuję z falownika…”. `POST /api/ems/odczyt`, w logu `[zapis] ODCZYTANO`.

**Zmienione**
- Potwierdzenie zapisu po kilku sekundach: datalogger (`ecobss.yaml` v5.4) czyta ustawienia zaraz po zapisie, EMS porównuje z tym odczytem (wcześniej czekał 2 cykle, przy interwale 60 s ~2 min albo „nie potwierdzono”).
- „Odczyt” obejmuje też przełączniki i listy wyboru grupy.

## v0.5.6

**Dodane**
- Część Inwerter: pasek potwierdzeń z dataloggera – „📥 Pomiary HH:MM:SS”, „📥 Ustawienia HH:MM:SS”, „📤 Ostatni zapis: rej. X o HH:MM:SS”, licznik cykli (wymaga `ecobss.yaml` v5.3).
- Lista encji, których brakuje w HA (zamiast samego „brak encji” w polach).

**Poprawione**
- Pola Inwertera szukają encji także pod innym ID (sufiks `_2`, prefiks urządzenia, ta sama nazwa) – zapis idzie do znalezionej encji.

## v0.5.5

**Zmienione**
- Wykres planu („Teraz + 24 h” i „Wstecz”) rozbity na 3 pasy na wspólnej osi czasu – każdy z jedną osią, bez nachodzących podpisów:
  - **Ceny zł/kWh**: RCE i G12 jako ciągłe schodki (gruba świecąca linia = wtedy kupuje / sprzedaje), progi droga / tania / za bezcen,
  - **Moc kW**: ładowanie z sieci (niebieskie słupki w górę) i sprzedaż (zielone w dół), PV jako schodki z wypełnieniem, dom jako linia; opis „↑ z sieci do baterii / ↓ oddanie do sieci”,
  - **SOC baterii**: osobny pas z linią minimum (`soc_min`),
  - tanie strefy G12 jako pas przez całą wysokość z podpisem „tania G12”, pionowa linia dymka przez wszystkie pasy.

## v0.5.4

**Poprawione**
- Biały ekran panelu po aktualizacji (`core.js doesn't provide an export named 'ui'`): przeglądarka brała stare `core.js` / `tips.js` / zakładki z pamięci podręcznej. Pliki panelu są teraz pod `/ems_static/<wersja>/`, więc każda nowa wersja ładuje się cała od nowa, bez czyszczenia cache.

## v0.5.3

**Dodane**
- Straty baterii w planie: dwa parametry „Sprawność ładowania” i „Sprawność rozładowania” (domyślnie 93% / 93%, razem ≈ 86,5%).
  - do baterii trafia energia × sprawność ładowania (z sieci i z nadwyżki PV) – 1 kWh z sieci = 0,93 kWh w baterii,
  - z baterii ubywa energia / sprawność rozładowania (dom, sprzedaż) – 1 kWh do domu = 1,075 kWh z baterii,
  - cel ładowania, energia „ponad potrzeby domu” i sprzedaż w taniej strefie liczone po stratach, pobór z sieci przy ładowaniu ze stratami,
  - symulacja wstecz liczy z tym samym modelem.
- Zapis z panelu tylko przy zmianie: jeśli falownik już ma tę wartość, EMS nic nie wysyła – „✅ Bez zmian – falownik już ma …”, w logu `[zapis] BEZ ZMIAN`.

**Zmienione**
- Próg opłacalności dokupienia: 0,61 / (sprawność ładowania × rozładowania) + zużycie + zysk (przy 93 × 93 ≈ 0,78 zł – praktycznie jak dotąd).

**Usunięte**
- Parametr „Sprawność baterii” (`number.ems_sprawnosc_baterii`) – zastąpiony dwoma powyżej. Starą encję można usunąć w HA (Ustawienia → Encje).

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
