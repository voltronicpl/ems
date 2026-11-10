# Zmiany EMS

## 0.6.22
- Handel: „Zakup pod sprzedaż” jako kWh · zł (na czerwono).
- Kolumny kupno / sprzedaż mocniejsze (16 %).
- Plan: wykresy PV i domu liniami (pomiar ciągły + prognoza przerywana, to samo okno co główny wykres), w nagłówku prognoza i faktycznie.
- Legenda wykresów w wierszach: Faktyczne / Prognozy (każda seria osobno + „Wszystkie”) / Inne (ceny, kupno, sprzedaż); to samo w Profilu mocy.
- Plan: kafelki dnia wybranego na pasku – Produkcja PV, Konsumpcja, Zakup, Sprzedaż, Handel (zakup pod sprzedaż + zysk), Bilans, Zysk dzięki EMS; przeszłe = faktycznie (z „prognoza była”), dziś = dotąd + reszta, jutro = prognoza.

## 0.6.21
- Wykresy (Plan i Profil mocy): SOC w ramce Moc (oś % po prawej), delikatne kolumny przez całą wysokość – czerwone = kupno z sieci, zielone = sprzedaż (plan EMS + ręczne), bez napisów przy osi, cieńsze linie cen, w legendzie „Kupno” / „Sprzedaż”.
- Przegląd: jedna ramka „Sterowanie” (algorytm + ręczne kup / sprzedaj + ostatnie wpisy w 2 kolumnach, puste wyszarzone); bez „Szybkich akcji” i ramki „Autokonsumpcja”.
- Nagłówek panelu: ikonka ⟳ „Odczytaj falownik” i godzina ostatniego zapisu.
- „Energia dziś / Miesiąc” + sekcja Handel: sprzedane nie z PV (kWh, zł), sprzedaż łącznie, zakup pod sprzedaż, zysk z handlu (/api/ems/energia).
- Przegląd: kafle PGE (rachunek, depozyt, bilans) i depozyt miesięcznie.
- PGE: liczniki i moce z dataloggera EMS (stan liczników od nowa), historia wykresów ze starych encji (Historia do nauki) i ze starych sensorów PGE; brakujące miesiące od „Początku rozliczenia” przeliczane wstecz.

## 0.6.20 – PGE w EMS
- Wcielona integracja PGE Net-Billing v1.8.1: rozliczenie G12, depozyt RCE, sensory „EMS – rozliczenie PGE” (pge_*).
- Nowa zakładka **PGE** (między Przegląd a Plan) – cały dawny panel PGE.
- Przegląd: ramka „Rachunek PGE – ten miesiąc” (prognoza faktury, import dzień/noc, eksport, depozyt, opłaty stałe), obok dotychczasowy rachunek EMS.
- Karta ems-card: wiersz z rachunkiem PGE i depozytem.
- Ustawienia → Rozliczenie PGE: stawki, opłaty, liczniki. Przy pierwszym starcie przejmuje ustawienia i dane ze starej integracji (jej nie usuwa).
- API: /api/ems/pge, /api/ems/pge_rce.

## 0.6.19
- Wykres planu: uproszczona legenda – jeden przycisk na wielkość (Dom, PV, Sieć, Bateria, SOC, Ładowanie / sprzedaż (plan), Ceny RCE / G12), włącza pomiar i prognozę naraz; ikonka: ciągła = pomiar, przerywana = prognoza / plan.
- Ładowanie z sieci i sprzedaż z planu jako linie przerywane zamiast słupków.
- Usunięta ramka „Symulacja wstecz – nasz EMS vs stary” z Planu.

## v0.6.18

**Poprawione (sprzedaż – punkt TOU jak przy sprzedaży wyklikanej na falowniku, zrzut rejestrów 10.11)**
- Punkt sprzedaży: **„Z sieci” włączone** (rejestry 272–277 bit0; przy sprzedaży z falownika = 1, EMS dawał 0), „autokonsumpcja do” = rezerwa, **„sprzedaj do” = rezerwa + 1 %** i SOC punktu = rezerwa + 1 % (przy równych wartościach falownik cofał tryb eksportu).
- Punkt ładowania: „sprzedaj do” = cel + 1 % zamiast 100 (jak falownik).
- Rejestr 225 („prąd ładowania z generatora”) – EMS go nie rusza (decyzja użytkownika).

## v0.6.17

**Dodane**
- Diagnostyka: **zrzut wszystkich rejestrów falownika (0–1099)** – przyciski „Zrzut: pusto / sprzedaż / kupno”. Datalogger (pakiet `ems_zrzut.yaml`) czyta 22 bloki po 50 rejestrów (~35 s) i wysyła je zdarzeniami do HA; EMS zapisuje `/config/ems_logs/zrzut-<etykieta>-<czas>.json` i pokazuje tabelę rejestrów, które różnią się między ostatnimi zrzutami (dziesiętnie i hex). Tylko odczyt. API `GET /api/ems/zrzuty`.

## v0.6.16

**Zmienione**
- **Priorytet energii zawsze „Najpierw bateria”** (decyzja użytkownika) – EMS ustawia go przy każdym wykonaniu planu / zlecenia (zapis tylko przy zmianie), jest w snapshocie.
- Koniec „przepychanki” o tryb eksportu: gdy w trakcie sprzedaży falownik **dwa razy sam cofnie** „Sprzedaż włączona” na „Limit wbudowany”, EMS przestaje go przestawiać co minutę i pokazuje ⚠ w Przeglądzie („Falownik odrzuca sprzedaż – sprawdź na LCD Tryb pracy”). Nowe zlecenie / następna sprzedaż próbuje od nowa.
- Sprawdzenie „Pmax zakupu” (tylko odczyt 278) zawsze w logu: wartość i stan.

## v0.6.15

**Zmienione (decyzja użytkownika)**
- **EMS nigdy nie zapisuje „Pmax zakupu”** (rejestr 278) – ani algorytm, ani ręczne zlecenia. Wycofane wyłączanie / przywracanie z v0.6.11–0.6.14.
- Zostaje tylko sprawdzanie: przy sprzedaży EMS czyta 278 (co 5 min) i gdy Pmax zakupu jest włączony – ostrzeżenie w logu, w Przeglądzie i w Ustawieniach („wyłącz na LCD, Tryb pracy”).
- Jeśli wcześniejsza wersja zmieniła 278, w logu pojawi się jednorazowo Twoja poprzednia wartość (bez zapisu).

## v0.6.14

**Poprawione**
- Plan: strona sama przewijała się na środek (przewijanie paska dni do „Teraz” przesuwało całą kartę). Teraz przewija się tylko pasek dni w poziomie, i tylko gdy się nie mieści.

## v0.6.13

**Dodane – sprawdzanie „Pmax zakupu” (rejestr 278)**
- Każdy zapis 278 (wyłączenie na sprzedaż i przywrócenie po) jest sprawdzany odczytem: zgodne bity 5:4 → `POTWIERDZONO` w logu; niezgodne → jedna ponowna próba, potem błąd w logu i ⚠ w Przeglądzie oraz w Ustawieniach.
- W trakcie sprzedaży EMS co 5 min sprawdza, czy Pmax zakupu nie został znowu włączony (np. z LCD) – jeśli tak, wyłącza go ponownie.
- Ustawienia: ramka „Pmax zakupu (Tryb pracy na LCD)” – stan (włączony / wyłączony przez EMS), wartość 278 i godzina odczytu. Atrybut `pmax_zakupu` w `sensor.ems_plan`.

## v0.6.12

**Poprawione**
- „Pmax zakupu”: odczyt rejestru 278 nie działał, gdy wynik był taki sam jak poprzednio (HA nie zmienia stanu przy identycznym tekście `278=10298 (0x283A)`), więc EMS nie wyłączał checkboxa. Teraz akceptuje aktualny wynik po 2 s; gdy checkbox już wyłączony, nie czyta rejestru co cykl.

## v0.6.11

**Poprawione (sprzedaż – znaleziona przyczyna)**
- „Pmax zakupu” z menu Tryb pracy na LCD (Grid Peak Shaving, rejestr 278 bity 5:4, wartość w 291) blokował sprzedaż – falownik sam wracał z „Sprzedaż włączona” na „Limit wbudowany”. EMS na czas sprzedaży (ręcznej i z planu) **wyłącza ten checkbox**, po sprzedaży **przywraca Twoją wartość** (zapamiętaną na dysku – przeżywa restart HA). Odczyt/zapis przez akcje dataloggera `raw_read` / `raw_write`.

**Zmienione**
- Ręczne kupno / sprzedaż mają pierwszeństwo: algorytm czuwa (standby) do końca zlecenia i co cykl pilnuje ustawień zlecenia; w Przeglądzie „Czuwa (ręczne ma pierwszeństwo)”.

## v0.6.10

**Poprawione (sprzedaż)**
- Pole „Max moc sprzedazy z PV” było źle nazwane – ogranicza cały eksport (Deye „Max Sell Power”). Nowa nazwa w panelu: **„Pmax sprzedazy (eksport)”**, poprawiony dymek.
- W slocie sprzedaży (plan i ręczna) EMS ustawia Pmax sprzedaży = moc sprzedaży (max do limitu 🔒 „Max moc sprzedaży”), po sprzedaży przywraca Twoją wartość.

## v0.6.9

**Poprawione (sprzedaż nie szła do sieci)**
- W slocie sprzedaży (plan i ręczna) EMS włącza też **„Sprzedaj nadwyżkę PV”** – główny włącznik eksportu (jak „Solar Sell” w Deye); bez niego falownik nic nie oddaje, także z baterii. Zostaje włączony; jest w snapshocie (przywracany po wyłączeniu algorytmu).
- Tryb limitu eksportu: nazwa opcji dopasowywana do tej z falownika (bez polskich znaków / wielkości liter); gdy brak pasującej – błąd w logu z listą dostępnych opcji (wcześniej zapis cicho się wywalał).
- Ostrzeżenie „SPRZEDAZ nie idzie” w logu zawiera też: Sprzedaj nadwyżkę PV, Max moc sprzedaży, Max moc sprzedaży z PV, Priorytet energii.

## v0.6.8

**Dodane**
- Ustawienia → „📚 Historia do nauki (stare encje)”: wybór encji z HA (liczniki narastające kWh albo moc W): konsumpcja domu łączna, produkcja PV łączna, import, eksport, bateria ładowanie / rozładowanie, pompa ciepła (opcjonalnie). Przy każdej: od kiedy HA ma statystyki. API `GET/POST /api/ems/zrodla`.
- Prognoza zużycia uczy się na historii do 365 dni (stara konsumpcja domu uzupełnia dane dataloggera, datalogger ma pierwszeństwo).
- Pompa ciepła liczona osobno (własny licznik): model kWh/h = a + b × temperatura zewnętrzna, dom bez pompy wg podobnych dni + pompa wg prognozy temperatury.
- Kalibracja prognozy PV: fakt z licznika PV / prognoza z pogody za rok → mnożnik sprawności (0,5–1,5), widoczny w podsumowaniu planu i w logu.
- **Nauka z całego roku wstecz**: historia zużycia (datalogger i stara konsumpcja) 365 dni, model pompy ciepła z 365 dni, kalibracja PV z 365 dni. Pogoda do nauki z archiwum Open-Meteo (temperatura i nasłonecznienie na panele, godzinowo, raz na dobę z cache) – osobno od prognozy do planu.

**Zmienione**
- Harmonogram TOU: start jako godzina „HH:MM” (pole czasu) zamiast liczby HHMM.

## v0.6.7

**Zmienione**
- Prognoza zużycia domu: podobne dni z 56 dni historii – ten sam dzień tygodnia (8 tygodni, nowsze ważniejsze, bez skrajnych wartości) zmieszany 60/40 z tym samym typem dnia (roboczy / weekend) z ostatnich 14 dni, wygładzenie z sąsiednimi godzinami, **święta ustawowe jak niedziela**, korekta bieżąca z 3 ostatnich godzin (fakt / prognoza, 0,7–1,4, wygasa przez 6 h). Historia odświeżana co godzinę (było co 6 h).
- Plan – jeden główny wykres: Dom, PV, Sieć, SOC (i bateria) – **pomiar linią ciągłą, prognoza przerywaną w tym samym kolorze**; nowa przerywana „Sieć (prognoza)” i „SOC (prognoza)”.
- Okno „Prognoza vs rzeczywistość” dostępne także z Planu; porównanie z **prognozą z początku dnia** i ostatnią; nowa tabela **„Błąd wg wyprzedzenia prognozy”** (< 1 h … > 12 h: średni błąd i odchylenie – czy prognoza zaniża czy zawyża).

**Dodane**
- EMS zapisuje prognozę z początku dnia i **każdą aktualizację** w trakcie dnia (zmiana > 3 %, do 40 na slot).
- Plan: kafelek „Bilans energii dziś (kWh)” – PV, zakup, sprzedaż: do teraz i prognoza na koniec dnia; w kafelku zakupu: ile algorytm planuje jeszcze dziś dokupić do baterii.

## v0.6.6

**Dodane**
- Plan: kafelki „Zakup prądu dziś”, „Sprzedaż dziś”, „Bilans dnia” (z wartością energii w baterii) i „Zysk dzięki EMS dziś” (vs dom bez magazynu na G12: PV na bieżąco, reszta z sieci) – „do teraz” z pomiarów i „koniec dnia” z planu, bilansowanie godzinowe.
- Przegląd: ramka „Rachunek – <miesiąc>” (energia od 1. dnia miesiąca: zakup wg G12 godzinowo, depozyt = RCE × mnożnik, rachunek do teraz i prognoza na koniec miesiąca). API `GET /api/ems/rachunek`.
- Log: gdy plan sprzedaje, a po 3 min nic nie idzie do sieci – jeden wpis `[silnik] SPRZEDAZ nie idzie` ze stanem wszystkich punktów TOU i trybu eksportu (do diagnozy). Brak cen RCE dla wykresu też trafia do logu.

**Zmienione**
- Dymek wykresu Planu idzie za myszką w pionie.
- Wykres Planu niższy (420 px).

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
