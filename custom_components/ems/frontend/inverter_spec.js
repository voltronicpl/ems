// Wygenerowane z listy rejestrow (te same nazwy co w ecobss.yaml). r = adres Modbus.
export const GROUPS = [
 {
  "title": "Dane podstawowe",
  "fields": [
   {
    "t": "b",
    "id": "button.ecobss_ustaw_czas_z_ha",
    "l": "Ustaw czas z HA"
   }
  ]
 },
 {
  "title": "Siec – podstawowe",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_max_napiecie_sieci",
    "l": "Max napiecie sieci",
    "u": "V",
    "r": 285
   },
   {
    "t": "n",
    "id": "number.ecobss_min_napiecie_sieci",
    "l": "Min napiecie sieci",
    "u": "V",
    "r": 286
   },
   {
    "t": "o",
    "id": "select.ecobss_napiecie_sieci",
    "l": "Napiecie sieci",
    "r": 238
   },
   {
    "t": "o",
    "id": "select.ecobss_kierunek_wirowania_faz",
    "l": "Kierunek wirowania faz",
    "r": 247
   }
  ]
 },
 {
  "title": "Siec – zaawansowane",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_max_czestotliwosc_sieci",
    "l": "Max czestotliwosc sieci",
    "u": "Hz",
    "r": 287
   },
   {
    "t": "n",
    "id": "number.ecobss_min_czestotliwosc_sieci",
    "l": "Min czestotliwosc sieci",
    "u": "Hz",
    "r": 288
   },
   {
    "t": "o",
    "id": "select.ecobss_tryb_sieci",
    "l": "Tryb sieci",
    "r": 282
   },
   {
    "t": "o",
    "id": "select.ecobss_czestotliwosc_sieci",
    "l": "Czestotliwosc sieci",
    "r": 283
   },
   {
    "t": "n",
    "id": "number.ecobss_wspolczynnik_mocy_pf",
    "l": "Wspolczynnik mocy PF",
    "u": "%",
    "r": 293
   },
   {
    "t": "s",
    "id": "switch.ecobss_asymetryczne_zasilanie_faz",
    "l": "Asymetryczne zasilanie faz",
    "r": 337
   },
   {
    "t": "s",
    "id": "switch.ecobss_praca_wyspowa",
    "l": "Praca wyspowa",
    "r": 183
   },
   {
    "t": "s",
    "id": "switch.ecobss_detekcja_awarii_uziemienia",
    "l": "Detekcja awarii uziemienia",
    "r": 185
   }
  ]
 },
 {
  "title": "Bateria – podstawowe",
  "fields": [
   {
    "t": "s",
    "id": "switch.ecobss_bateria_litowa_z_bms",
    "l": "Bateria litowa z BMS",
    "r": 198
   },
   {
    "t": "o",
    "id": "select.ecobss_typ_sterowania_baterii",
    "l": "Typ sterowania baterii",
    "r": 211
   },
   {
    "t": "n",
    "id": "number.ecobss_pojemnosc_baterii",
    "l": "Pojemnosc baterii",
    "u": "Ah",
    "r": 202
   },
   {
    "t": "s",
    "id": "switch.ecobss_aktywacja_baterii",
    "l": "Aktywacja baterii",
    "r": 212
   },
   {
    "t": "n",
    "id": "number.ecobss_limit_twardy_max_prad_ladowania_baterii",
    "l": "Max prad ladowania baterii",
    "lock": true,
    "u": "A"
   },
   {
    "t": "n",
    "id": "number.ecobss_limit_twardy_max_prad_rozladowania_baterii",
    "l": "Max prad rozladowania baterii",
    "lock": true,
    "u": "A"
   },
   {
    "t": "n",
    "id": "number.ecobss_poziom_wylaczenia_load",
    "l": "Poziom wylaczenia LOAD",
    "lock": false,
    "u": "%"
   },
   {
    "t": "n",
    "id": "number.ecobss_niski_poziom_baterii",
    "l": "Niski poziom baterii",
    "lock": false,
    "u": "%"
   },
   {
    "t": "n",
    "id": "number.ecobss_poziom_wlaczenia_load",
    "l": "Poziom wlaczenia LOAD",
    "lock": false,
    "u": "%"
   }
  ]
 },
 {
  "title": "Bateria – zaawansowane",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_napiecie_wyrownujace",
    "l": "Napiecie wyrownujace",
    "u": "V",
    "r": 199
   },
   {
    "t": "n",
    "id": "number.ecobss_napiecie_absorpcji",
    "l": "Napiecie absorpcji",
    "u": "V",
    "r": 200
   },
   {
    "t": "n",
    "id": "number.ecobss_napiecie_podtrzymujace",
    "l": "Napiecie podtrzymujace",
    "u": "V",
    "r": 201
   },
   {
    "t": "n",
    "id": "number.ecobss_rezystancja_baterii",
    "l": "Rezystancja baterii",
    "u": "mΩ",
    "r": 213
   },
   {
    "t": "n",
    "id": "number.ecobss_sprawnosc_ladowania",
    "l": "Sprawnosc ladowania",
    "u": "%",
    "r": 214
   },
   {
    "t": "n",
    "id": "number.ecobss_niski_poziom_baterii_napiecie",
    "l": "Niski poziom baterii napiecie",
    "u": "V",
    "r": 220
   },
   {
    "t": "n",
    "id": "number.ecobss_wlaczenie_load_napiecie",
    "l": "Wlaczenie LOAD napiecie",
    "u": "V",
    "r": 219
   },
   {
    "t": "n",
    "id": "number.ecobss_wylaczenie_load_napiecie",
    "l": "Wylaczenie LOAD napiecie",
    "u": "V",
    "r": 218
   }
  ]
 },
 {
  "title": "Port GEN – podstawowe",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_max_czas_pracy_generatora",
    "l": "Max czas pracy generatora",
    "u": "h",
    "r": 221
   },
   {
    "t": "n",
    "id": "number.ecobss_czas_chlodzenia_generatora",
    "l": "Czas chlodzenia generatora",
    "u": "h",
    "r": 222
   },
   {
    "t": "n",
    "id": "number.ecobss_prad_ladowania_z_generatora",
    "l": "Prad ladowania z generatora",
    "u": "A",
    "r": 225
   },
   {
    "t": "n",
    "id": "number.ecobss_moc_generatora",
    "l": "Moc generatora",
    "u": "W",
    "r": 239
   },
   {
    "t": "s",
    "id": "switch.ecobss_sygnal_zalaczenia_generatora",
    "l": "Sygnal zalaczenia generatora",
    "r": 240
   },
   {
    "t": "s",
    "id": "switch.ecobss_ladowanie_z_generatora",
    "l": "Ladowanie z generatora",
    "r": 229
   },
   {
    "t": "n",
    "id": "number.ecobss_zalaczenie_generatora_przy",
    "l": "Zalaczenie generatora przy",
    "u": "%",
    "r": 224
   },
   {
    "t": "n",
    "id": "number.ecobss_wylaczenie_bufora_ciepla_przy",
    "l": "Wylaczenie bufora ciepla przy",
    "u": "%",
    "r": 235
   },
   {
    "t": "n",
    "id": "number.ecobss_zalaczenie_bufora_ciepla_przy",
    "l": "Zalaczenie bufora ciepla przy",
    "u": "%",
    "r": 237
   },
   {
    "t": "o",
    "id": "select.ecobss_tryb_pracy_portu_gen",
    "l": "Tryb pracy portu GEN",
    "r": 233
   }
  ]
 },
 {
  "title": "Port GEN – zaawansowane",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_moc_szczytowa_gen",
    "l": "Moc szczytowa GEN",
    "u": "W",
    "r": 290
   }
  ]
 },
 {
  "title": "Tryb pracy – podstawowe",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_limit_twardy_prad_ladowania_z_sieci",
    "l": "Prad ladowania z sieci",
    "lock": true,
    "u": "A"
   },
   {
    "t": "n",
    "id": "number.ecobss_limit_twardy_max_moc_sprzedazy",
    "l": "Max moc sprzedazy",
    "lock": true,
    "u": "W"
   },
   {
    "t": "n",
    "id": "number.ecobss_max_moc_sprzedazy_z_pv",
    "l": "Pmax sprzedazy (eksport)",
    "lock": false,
    "u": "W"
   },
   {
    "t": "n",
    "id": "number.ecobss_zalaczenie_ladowania_z_sieci_przy",
    "l": "Zalaczenie ladowania z sieci przy",
    "u": "%",
    "r": 227
   },
   {
    "t": "s",
    "id": "switch.ecobss_pmax_zakupu",
    "l": "Pmax zakupu (limit poboru z sieci)",
    "r": 278
   },
   {
    "t": "n",
    "id": "number.ecobss_moc_szczytowa_sieci",
    "l": "Moc szczytowa sieci",
    "u": "W",
    "r": 291
   },
   {
    "t": "o",
    "id": "select.ecobss_priorytet_energii",
    "l": "Priorytet energii"
   },
   {
    "t": "o",
    "id": "select.ecobss_tryb_limitu_eksportu",
    "l": "Tryb limitu eksportu"
   },
   {
    "t": "o",
    "id": "select.ecobss_pomiar",
    "l": "Pomiar",
    "r": 444
   },
   {
    "t": "s",
    "id": "switch.ecobss_ladowanie_z_sieci_dozwolone",
    "l": "Ladowanie z sieci dozwolone"
   },
   {
    "t": "s",
    "id": "switch.ecobss_sprzedaj_nadwyzke_pv",
    "l": "Sprzedaj nadwyzke PV"
   },
   {
    "t": "s",
    "id": "switch.ecobss_harmonogram_tou",
    "l": "Harmonogram TOU"
   }
  ]
 },
 {
  "title": "Tryb pracy – zaawansowane",
  "fields": [
   {
    "t": "n",
    "id": "number.ecobss_zalaczenie_ladowania_z_sieci_przy_napieciu",
    "l": "Zalaczenie ladowania z sieci przy napieciu",
    "u": "V",
    "r": 226
   },
   {
    "t": "n",
    "id": "number.ecobss_przelozenie_miernika_energii",
    "l": "Przelozenie miernika energii",
    "u": "",
    "r": 448
   },
   {
    "t": "n",
    "id": "number.ecobss_przelozenie_wbudowanego_przekladnika",
    "l": "Przelozenie wbudowanego przekladnika",
    "u": "",
    "r": 447
   }
  ]
 }
];
