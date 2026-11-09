export const title = "Konfiguracja inwertera";
export function render(c) {
  const d = c.dev, n = k => `number.${d}_${k}`;
  const bat = ["limit_twardy_max_prad_ladowania_baterii", "limit_twardy_max_prad_rozladowania_baterii", "poziom_wylaczenia_load", "niski_poziom_baterii", "poziom_wlaczenia_load"].map(n);
  const mode = ["limit_twardy_prad_ladowania_z_sieci", "limit_twardy_max_moc_sprzedazy", "max_moc_sprzedazy_z_pv"].map(n);
  const tk = []; for (let p = 1; p <= 6; p++) tk.push(n(`tou_${p}_start_hhmm`), n(`tou_${p}_moc`), n(`tou_${p}_soc`), n(`tou_${p}_autokonsumpcja_do`), n(`tou_${p}_sprzedaj_do`));
  const alg = c.hass.states["switch.ems_algorytm"]?.state === "on";
  const tou = [1, 2, 3, 4, 5, 6].map(p => `<div class="tou" style="grid-template-columns:130px 100px 100px 90px minmax(0,1fr) minmax(0,1fr)">${c.sw(`switch.${d}_tou_${p}_ladowanie_z_sieci`, `Z sieci ${p}`)}
    <div>${c.field(n(`tou_${p}_start_hhmm`), "")}</div><div>${c.field(n(`tou_${p}_moc`), "W")}</div><div>${c.field(n(`tou_${p}_soc`), "%")}</div>
    ${c.range(n(`tou_${p}_autokonsumpcja_do`), `Autokonsumpcja ${p}`)}${c.range(n(`tou_${p}_sprzedaj_do`), `Sprzedaj do ${p}`)}</div>`).join("");
  return `${alg ? `<div class="card warn">Algorytm jest WŁĄCZONY – harmonogram i tryb eksportu ustawia EMS i nadpisze ręczne zmiany. Wyłącz algorytm w „Przeglądzie”, żeby działały Twoje wartości.</div>` : ""}
  ${c.group("Bateria – podstawowe", `<div class="g3"><div><label class="f">🔒 Limit prądu ładowania</label>${c.field(bat[0], "A", 0, 1)}</div><div><label class="f">🔒 Limit prądu rozładowania</label>${c.field(bat[1], "A", 0, 1)}</div><div></div>
    ${c.range(bat[2], "Poziom wyłączenia LOAD")}${c.range(bat[3], "Niski poziom baterii")}${c.range(bat[4], "Poziom włączenia LOAD")}</div>`, bat)}
  ${c.group("Tryb pracy – podstawowe", `<div class="g3"><div><label class="f">🔒 Prąd ładowania z sieci</label>${c.field(mode[0], "A", 0, 1)}</div><div><label class="f">🔒 Maksymalna moc sprzedaży</label>${c.field(mode[1], "W", 0, 1)}</div><div><label class="f">Max moc sprzedaży z PV</label>${c.field(mode[2], "W")}</div>
    ${c.sel(`select.${d}_priorytet_energii`, "Priorytet energii")}${c.sel(`select.${d}_tryb_limitu_eksportu`, "Tryb limitu eksportu")}<div><label class="f">Interwał odczytu</label>${c.field("number.ems_interwal", "s")}</div>
    ${c.sw(`switch.${d}_harmonogram_tou`, "Harmonogram pracy")}${c.sw(`switch.${d}_ladowanie_z_sieci_dozwolone`, "Ładowanie z sieci dozwolone")}${c.sw(`switch.${d}_sprzedaj_nadwyzke_pv`, "Sprzedaj nadwyżkę PV")}</div>`, [...mode, "number.ems_interwal"])}
  ${c.group("Harmonogram (TOU)", `<div class="tou" style="grid-template-columns:130px 100px 100px 90px minmax(0,1fr) minmax(0,1fr);border:0"><span class="l">Ładowanie</span><span class="l">Start HHMM</span><span class="l">Moc</span><span class="l">SOC</span><span class="l">Autokonsumpcja do</span><span class="l">Sprzedaj do</span></div>${tou}`, tk)}
  <p class="note">Przełączniki i listy zapisują się od razu. Pola i suwaki – po „Zapisz” w grupie. 🔒 = limit twardy (tylko człowiek).</p>`;
}
