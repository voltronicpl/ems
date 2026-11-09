import { tip, esc } from "../core.js";
export const title = "Diagnostyka";
let cache = { lines: [], days: [] }, timer = null, filter = "";
const TIP = { co: "Logi EMS z całego dnia, linia po linii.", jak: "Każdy moduł ma swój znacznik: [ceny] RCE z PSE, [pogoda] Open-Meteo, [pv] prognoza PV, [zuzycie] prognoza domu, [plan] algorytm, [wykonanie] zapisy do falownika, [reczne] kup/sprzedaj, [wstecz] symulacja historii, [parametry] zmiany ustawień, [panel] akcje z panelu, [silnik] cykle.", czytaj: "Filtr zawęża do linii z danym słowem, np. „ZAPIS”, „blad”, „plan”." };
export function render(c) {
  if (!timer) { load(c); timer = setInterval(() => { if (c.tab === 3) load(c); }, 5000); }
  const lines = cache.lines.filter(l => !filter || l.toLowerCase().includes(filter));
  const col = l => / ERROR /.test(l) ? "#ff8c97" : / WARNING /.test(l) ? "#ffd58a" : /ZAPIS|SUROWY/.test(l) ? "#7fb3ff" : "";
  return `<div class="box"><div class="h"><span>🩺 Logi na żywo${tip(TIP)}</span>
      <span class="ctrl"><div class="inp" style="width:260px"><input placeholder="filtr: plan, pv, ZAPIS, blad…" data-filter value="${esc(filter)}"></div><button class="btn" data-reload>↻ Odśwież</button></span></div>
      <div class="log" id="log">${lines.map(l => `<span style="color:${col(l)}">${esc(l)}</span>`).join("\n") || "Brak logów."}</div></div>
    <div class="box"><div class="h"><span>💾 Pobierz log z całego dnia</span><span class="lab">/config/ems_logs/ · 14 dni</span></div>
      ${cache.days.map(d => `<div class="row"><span>${d}</span><button class="btn" data-dl="${d}">Pobierz</button></div>`).join("") || `<p class="note">Brak plików.</p>`}</div>`;
}
async function load(c) { try { cache = await c.hass.callApi("GET", "ems/logs?tail=600"); } catch (e) { cache.lines = ["Błąd pobierania logów: " + e.message]; } c.render(true); }
export function bind(c, r) {
  const f = r.querySelector("[data-filter]");
  if (f) { f.onfocus = () => { c._hold = true; }; f.onblur = () => { c._hold = false; }; f.oninput = () => { filter = f.value.toLowerCase(); }; f.onchange = () => { c._hold = false; c.render(true); }; }
  r.querySelector("[data-reload]")?.addEventListener("click", () => load(c));
  r.querySelectorAll("[data-dl]").forEach(b => b.onclick = async () => {
    const res = await c.hass.fetchWithAuth(`/api/ems/logs/download?day=${b.dataset.dl}`);
    const url = URL.createObjectURL(await res.blob()), a = document.createElement("a"); a.href = url; a.download = `ems-${b.dataset.dl}.log`; a.click(); URL.revokeObjectURL(url);
  });
  const log = r.querySelector("#log"); if (log && !c._hold) log.scrollTop = log.scrollHeight;
}
