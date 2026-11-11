// Harmonogram TOU falownika (6 punktow) – wspolny dla Planu i Ustawien.
import { S, num, tip } from "./core.js";
import { T } from "./tips.js";

export function tou(c) {
  const d = c.dev, n = k => `number.${d}_${k}`, alg = S(c.hass, "switch.ems_algorytm")?.state === "on";
  const ids = []; for (let p = 1; p <= 6; p++) ids.push(n(`tou_${p}_start_hhmm`), n(`tou_${p}_moc`), n(`tou_${p}_soc`), n(`tou_${p}_autokonsumpcja_do`), n(`tou_${p}_sprzedaj_do`));
  const v = id => (c.dirty && c.dirty[id] !== undefined ? c.dirty[id] : num(c.hass, id));
  const st = [1, 2, 3, 4, 5, 6].map(p => v(n(`tou_${p}_start_hhmm`)));
  const hm = x => x == null ? "–" : `${String(Math.floor(x / 100)).padStart(2, "0")}:${String(Math.round(x % 100)).padStart(2, "0")}`;
  const mins = x => x == null ? null : Math.floor(x / 100) * 60 + Math.round(x % 100);
  const endOf = i => i < 5 && st[i + 1] != null ? st[i + 1] : 2359;           // koniec = start nastepnego, ostatni do 23:59
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const mode = p => { const g = S(c.hass, `switch.${d}_tou_${p}_ladowanie_z_sieci`)?.state === "on", soc = v(n(`tou_${p}_soc`)), au = v(n(`tou_${p}_autokonsumpcja_do`)), sp = v(n(`tou_${p}_sprzedaj_do`));
    if (g && sp != null && au != null && sp <= au + 1 && (soc ?? 100) <= au + 1) return ["Sprzedaż", "#22e07a"];
    if (g) return ["Ładowanie", "#ff4d5e"];
    if ((soc ?? 0) >= 90) return ["Trzymanie", "#a78bfa"];
    return ["Autokonsumpcja", "#8fa6bd"]; };
  const rows = [1, 2, 3, 4, 5, 6].map((p, i) => { const a = mins(st[i]), e = mins(endOf(i)), len = a == null ? null : (i < 5 ? e - a : 24 * 60 - a), act = a != null && nowM >= a && nowM < (i < 5 ? e : 24 * 60), [mn, mc] = mode(p);
    return `<tr style="${act ? "background:#1e9bff22;box-shadow:inset 3px 0 0 #1e9bff" : ""}"><td data-l="Punkt ${p}">${c.sw(`switch.${d}_tou_${p}_ladowanie_z_sieci`, `Z sieci ${p}`)}<div class="lab" style="margin-top:4px;color:${mc}">● ${mn}${act ? " <b style=\"color:#7fb3ff\">· TERAZ</b>" : ""}</div></td>
    <td data-l="Start">${c.field(n(`tou_${p}_start_hhmm`), "", { time: true })}</td>
    <td data-l="Do"><b>${hm(endOf(i))}</b><div class="lab">${len == null ? "" : len < 0 ? '<span class="t-r">⚠ start po następnym</span>' : `${Math.floor(len / 60)} h ${String(len % 60).padStart(2, "0")} min`}</div></td>
    <td data-l="Moc">${c.field(n(`tou_${p}_moc`), "W")}</td><td data-l="SOC">${c.field(n(`tou_${p}_soc`), "%")}</td>
    <td data-l="Autokons. do">${c.range(n(`tou_${p}_autokonsumpcja_do`), "")}</td><td data-l="Sprzedaj do">${c.range(n(`tou_${p}_sprzedaj_do`), "")}</td></tr>`; }).join("");
  const warn0 = st[0] != null && st[0] !== 0 ? `<div class="box err" style="margin:0 0 8px">⚠ Punkt 1 startuje o ${hm(st[0])}, a nie o 00:00 – od północy do ${hm(st[0])} falownik nie ma własnego punktu (dzień w falowniku to 00:00–23:59).</div>` : "";
  const lw = S(c.hass, "sensor.ems_plan")?.attributes?.ostatni_zapis_tou;
  return c.group(`🗓 Harmonogram w falowniku (TOU)${tip(T.tou)}`, `${warn0}${alg ? `<div class="note" style="margin:0 0 8px">Algorytm włączony – EMS przy następnym zapisie (co ~1 min) ustawi TOU według planu.</div>` : ""}
    <div style="overflow:auto"><table class="tbl rt"><tr><th>Ładowanie</th><th>Start</th><th>Do</th><th>Moc</th><th>SOC</th><th>Autokonsumpcja do</th><th>Sprzedaj do</th></tr>${rows}</table></div>
    <div class="lab" style="margin-top:8px">Ostatni zapis EMS do TOU: ${lw ? new Date(lw).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"}</div>`, ids);
}
