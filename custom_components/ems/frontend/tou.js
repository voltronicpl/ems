// Harmonogram TOU falownika (6 punktow) – wspolny dla Planu i Ustawien.
import { S, tip } from "./core.js";
import { T } from "./tips.js";

export function tou(c) {
  const d = c.dev, n = k => `number.${d}_${k}`, alg = S(c.hass, "switch.ems_algorytm")?.state === "on";
  const ids = []; for (let p = 1; p <= 6; p++) ids.push(n(`tou_${p}_start_hhmm`), n(`tou_${p}_moc`), n(`tou_${p}_soc`), n(`tou_${p}_autokonsumpcja_do`), n(`tou_${p}_sprzedaj_do`));
  const rows = [1, 2, 3, 4, 5, 6].map(p => `<tr><td data-l="Punkt ${p}">${c.sw(`switch.${d}_tou_${p}_ladowanie_z_sieci`, `Z sieci ${p}`)}</td>
    <td data-l="Start">${c.field(n(`tou_${p}_start_hhmm`), "", { time: true })}</td><td data-l="Moc">${c.field(n(`tou_${p}_moc`), "W")}</td><td data-l="SOC">${c.field(n(`tou_${p}_soc`), "%")}</td>
    <td data-l="Autokons. do">${c.range(n(`tou_${p}_autokonsumpcja_do`), "")}</td><td data-l="Sprzedaj do">${c.range(n(`tou_${p}_sprzedaj_do`), "")}</td></tr>`).join("");
  const lw = S(c.hass, "sensor.ems_plan")?.attributes?.ostatni_zapis_tou;
  return c.group(`🗓 Harmonogram w falowniku (TOU)${tip(T.tou)}`, `${alg ? `<div class="note" style="margin:0 0 8px">Algorytm włączony – EMS przy następnym zapisie (co ~1 min) ustawi TOU według planu.</div>` : ""}
    <div style="overflow:auto"><table class="tbl rt"><tr><th>Ładowanie</th><th>Start</th><th>Moc</th><th>SOC</th><th>Autokonsumpcja do</th><th>Sprzedaj do</th></tr>${rows}</table></div>
    <div class="lab" style="margin-top:8px">Ostatni zapis EMS do TOU: ${lw ? new Date(lw).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"}</div>`, ids);
}
