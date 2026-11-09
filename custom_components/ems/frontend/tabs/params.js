import { num, fmt } from "../core.js";
export const title = "Parametry EMS";
const PAIRS = [
  ["Limit sprzedaży", "limit_sprzedazy", "× PV", "Ile razy prognozę PV wolno sprzedać w ciągu dnia. Więcej: większa sprzedaż. Mniej: ostrożniej."],
  ["Próg sprzedaży – tania", "prog_tania", "zł", "Min. RCE dla energii kupionej tanio. Więcej: rzadziej, zyskowniej. Mniej: częściej, mniejszy zysk."],
  ["Próg sprzedaży – droga", "prog_droga", "zł", "Powyżej tej ceny sprzedaje nawet energię potrzebną domowi. Więcej: rzadziej. Mniej: częściej, ryzyko straty."],
  ["Próg „za bezcen”", "prog_bezcen", "zł", "Poniżej tej ceny EMS nie oddaje energii. Więcej: częściej blokuje eksport. Mniej: częściej oddaje tanio."],
  ["Mnożnik PV – słonecznie", "mn_slonecznie", "×", "Skaluje prognozę PV w słoneczne dni. Więcej: zakłada więcej PV, mocniej opróżnia baterię. Mniej: trzyma więcej."],
  ["Mnożnik PV – pochmurno", "mn_pochmurno", "×", "Jak wyżej, dla pochmurnych dni."],
  ["Mnożnik PV – deszcz", "mn_deszcz", "×", "Jak wyżej, dla deszczu."],
  ["Mnożnik PV – śnieg", "mn_snieg", "×", "Jak wyżej, dla śniegu na panelach."],
];
const SINGLE = [
  ["SOC minimalny", "soc_min", "%", "Zapas, poniżej którego EMS nie rozładuje baterii."],
  ["SOC przy burzy", "soc_burza", "%", "Zapas trzymany od N godzin przed burzą do jej końca."],
  ["SOC maksymalny", "soc_max", "%", "Do ilu ładować z sieci."],
  ["Burza – zapas od (h przed)", "burza_wyprzedzenie_h", "h", "Ile godzin przed burzą zacząć trzymać zapas."],
  ["Współczynnik temperatury (0 = auto)", "wsp_temp", "kWh/°C", "Ile kWh/dobę więcej na każdy °C chłodniej. 0 = liczy sam z historii."],
  ["Weekend od (piątek, godz.)", "weekend_od_godz", "h", "Od tej godziny piątek liczony jak weekend w prognozie zużycia."],
  ["Pojemność baterii", "pojemnosc_kwh", "kWh", ""], ["Moc PV", "pv_kwp", "kWp", ""], ["Sprawność instalacji PV", "pv_sprawnosc", "%", ""],
  ["Nachylenie paneli", "pv_nachylenie", "°", ""], ["Azymut paneli (0 = południe)", "pv_azymut", "°", ""],
];
export function render(c) {
  const winter = !c.zone.summer;
  const f = (k, u, act) => c.field(`number.ems_${k}`, u, act);
  const tip = t => t ? ` <span title="${t}" style="cursor:help;color:var(--secondary-text-color)">ⓘ</span>` : "";
  const lim = (n, k, u) => `<div class="row"><span>🔒 ${n}</span><span>${fmt(num(c.hass, `number.${c.dev}_${k}`), 0, u)}</span></div>`;
  return `${c.group("Przeliczniki lato / zima", `
    <div class="tou" style="grid-template-columns:minmax(0,1.4fr) 1fr 1fr;border:0"><span class="l">Parametr</span><span class="l">☀ Lato (1.04–30.09)${winter ? "" : " · aktywne"}</span><span class="l">❄ Zima (1.10–31.03)${winter ? " · aktywne" : ""}</span></div>
    ${PAIRS.map(([n, k, u, t]) => `<div class="tou" style="grid-template-columns:minmax(0,1.4fr) 1fr 1fr"><span>${n}${tip(t)}</span>${f(k + "_lato", u, !winter)}${f(k + "_zima", u, winter)}</div>`).join("")}`,
    PAIRS.flatMap(([, k]) => [`number.ems_${k}_lato`, `number.ems_${k}_zima`]))}
  ${c.group("Bateria, burza, prognozy", `<div class="g3">${SINGLE.map(([n, k, u, t]) => `<div><label class="f">${n}${tip(t)}</label>${f(k, u)}</div>`).join("")}</div>`, SINGLE.map(([, k]) => `number.ems_${k}`))}
  <div class="card lock"><div class="h" style="color:var(--error-color)">🔒 Limity twarde – nie do ruszenia przez algorytm</div>
    ${lim("Max sprzedaż do sieci", "limit_twardy_max_moc_sprzedazy", "W")}${lim("Max prąd ładowania baterii", "limit_twardy_max_prad_ladowania_baterii", "A")}${lim("Max prąd rozładowania baterii", "limit_twardy_max_prad_rozladowania_baterii", "A")}${lim("Prąd ładowania z sieci", "limit_twardy_prad_ladowania_z_sieci", "A")}
    <p class="note">Ustawiasz je w zakładce „Konfiguracja inwertera”. EMS tylko je czyta i nigdy nie przekracza.</p></div>`;
}
