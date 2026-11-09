export const title = "Diagnostyka";
let cache = { lines: [], days: [] }, timer = null, filter = "";
export function render(c) {
  if (!timer) { load(c); timer = setInterval(() => c.tab === 4 ? load(c) : null, 5000); }
  const lines = cache.lines.filter(l => !filter || l.toLowerCase().includes(filter));
  return `<div class="card"><div class="h"><span>Logi na żywo</span>
      <span class="act"><input placeholder="filtr: plan, pv, zapis, blad…" data-filter value="${filter}" style="padding:6px;border-radius:8px;border:1px solid var(--divider-color);background:var(--secondary-background-color);color:inherit">
      <button class="sec" data-reload>Odśwież</button></span></div>
      <div class="log" id="log">${lines.map(l => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("\n") || "Brak logów."}</div>
      <p class="note">Moduły w nawiasach: [ceny] RCE, [pogoda] Open-Meteo, [pv] prognoza PV, [zuzycie] prognoza domu, [plan] algorytm, [wykonanie] zapisy do falownika, [reczne] kup/sprzedaj, [parametry] zmiany ustawień.</p></div>
    <div class="card"><div class="h">Pobierz log z całego dnia</div>
      ${cache.days.map(d => `<div class="row"><span>${d}</span><button class="sec" data-dl="${d}">Pobierz</button></div>`).join("") || `<p class="note">Brak plików.</p>`}
      <p class="note">Pliki w HA: /config/ems_logs/ems-RRRR-MM-DD.log (14 dni).</p></div>`;
}
async function load(c) {
  try { cache = await c.hass.callApi("GET", "ems/logs?tail=500"); c.render(true); } catch (e) { cache.lines = ["Błąd pobierania logów: " + e.message]; }
}
export function bind(c, r) {
  const f = r.querySelector("[data-filter]");
  if (f) f.oninput = () => { filter = f.value.toLowerCase(); c.render(true); setTimeout(() => { const g = c.shadowRoot.querySelector("[data-filter]"); g.focus(); g.setSelectionRange(g.value.length, g.value.length); }, 0); };
  r.querySelector("[data-reload]")?.addEventListener("click", () => load(c));
  r.querySelectorAll("[data-dl]").forEach(b => b.onclick = async () => {
    const res = await c.hass.fetchWithAuth(`/api/ems/logs/download?day=${b.dataset.dl}`);
    const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
    a.href = url; a.download = `ems-${b.dataset.dl}.log`; a.click(); URL.revokeObjectURL(url);
  });
  const log = r.querySelector("#log"); if (log) log.scrollTop = log.scrollHeight;
}
