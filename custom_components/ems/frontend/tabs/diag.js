import { tip, esc } from "../core.js";
export const title = "Diagnostyka";
let cache = { lines: [], days: [] }, timer = null, filter = "";
const TIP = { co: "Logi EMS z całego dnia, linia po linii.", jak: "Każdy moduł ma swój znacznik: [ceny] RCE z PSE, [pogoda] Open-Meteo, [pv] prognoza PV, [zuzycie] prognoza domu, [plan] algorytm, [wykonanie] zapisy do falownika, [reczne] kup/sprzedaj, [wstecz] symulacja historii, [parametry] zmiany ustawień, [panel] akcje z panelu, [silnik] cykle.", czytaj: "Filtr zawęża do linii z danym słowem, np. „ZAPIS”, „blad”, „plan”." };
// Zrzut wszystkich rejestrow (pusto / sprzedaz / kupno) – tylko odczyt, przez datalogger (pakiet ems_zrzut.yaml)
let dump = { d: null, at: 0 };
async function loadDump(c) { try { dump.d = await c.hass.callApi("GET", "ems/zrzuty"); } catch (e) { dump.d = { err: e.message || String(e) }; } dump.at = Date.now(); c.render(true); }
const LAB = { pusto: "Pusto (bez akcji)", sprzedaz: "Sprzedaż", kupno: "Kupno" };
function dumpBox(c) {
  if (Date.now() - dump.at > (dump.d?.trwa && Object.keys(dump.d.trwa).length ? 3000 : 30000)) { dump.at = Date.now(); loadDump(c); }
  const d = dump.d || {}, hex = v => v == null ? "–" : `${v} <span class="lab">0x${v.toString(16).toUpperCase().padStart(4, "0")}</span>`;
  const btns = Object.keys(LAB).map(k => `<button class="btn ${k === "pusto" ? "" : "pri"}" data-dump="${k}">📸 Zrzut: ${LAB[k]}</button>`).join("");
  const trwa = Object.entries(d.trwa || {}).map(([k, v]) => `<div class="lab">⏳ ${LAB[k] || k}: ${v.bloki}/22 bloków, ${v.rejestry} rejestrów…</div>`).join("");
  const ost = Object.entries(d.ostatnie || {}).map(([k, v]) => `<div class="row"><span>${LAB[k] || k}: <b>${esc(v.czas || "")}</b> · ${v.ile} rejestrów${v.bledy?.length ? ` · <span class="t-o">bez odpowiedzi bloki od: ${v.bledy.join(", ")}</span>` : ""}</span><span class="lab">${esc(v.plik)}</span></div>`).join("");
  const labs = d.etykiety || [];
  const tab = (d.roznice || []).length ? `<div style="overflow:auto;max-height:420px"><table class="tbl"><tr><th>Rejestr</th>${labs.map(k => `<th class="r">${LAB[k] || k}</th>`).join("")}</tr>
    ${d.roznice.map(x => `<tr><td><b>${x.rejestr}</b></td>${labs.map(k => `<td class="r">${hex(x[k])}</td>`).join("")}</tr>`).join("")}</table></div>` : `<p class="note">${labs.length > 1 ? "Brak różnic między zrzutami." : "Zrób co najmniej dwa zrzuty, żeby zobaczyć różnice."}</p>`;
  return `<div class="box"><div class="h"><span>📸 Zrzut wszystkich rejestrów (0–1099)${tip({ co: "Datalogger czyta wszystkie rejestry falownika blokami po 50 i zapisuje do /config/ems_logs/zrzut-….json. Tylko odczyt – nic nie zapisuje do falownika.", jak: "1) Pusto – nic nie ustawione. 2) Wyklikaj sprzedaż na LCD → Zrzut: sprzedaż. 3) Wyklikaj kupno na LCD → Zrzut: kupno. Tabela pokazuje rejestry, które się różnią.", czytaj: "Wymaga pakietu ems_zrzut.yaml w dataloggerze i zgody HA na zdarzenia z ESPHome." })}</span><button class="btn" data-dumpre>↻</button></div>
    <div class="ctrl">${btns}</div>${trwa}${d.err ? `<div class="box err">${esc(d.err)}</div>` : ""}<div style="margin:8px 0">${ost}</div>${tab}</div>`;
}
export function render(c) {
  if (!timer) { load(c); timer = setInterval(() => { if (c.tab === 4) load(c); }, 5000); }
  const lines = cache.lines.filter(l => !filter || l.toLowerCase().includes(filter));
  const col = l => / ERROR /.test(l) ? "#ff8c97" : / WARNING /.test(l) ? "#ffd58a" : /ZAPIS|SUROWY/.test(l) ? "#7fb3ff" : "";
  return `<div class="box"><div class="h"><span>🩺 Logi na żywo${tip(TIP)}</span>
      <span class="ctrl"><div class="inp wflt"><input placeholder="filtr: plan, pv, ZAPIS, blad…" data-filter value="${esc(filter)}"></div><button class="btn" data-copy title="Kopiuje widoczne linie (z filtrem) do schowka">📋 Kopiuj</button><button class="btn" data-reload>↻ Odśwież</button></span></div>
      <div class="log" id="log">${lines.map(l => `<span style="color:${col(l)}">${esc(l)}</span>`).join("\n") || "Brak logów."}</div></div>
    ${dumpBox(c)}
    <div class="box"><div class="h"><span>💾 Pobierz log z całego dnia</span><span class="lab">/config/ems_logs/ · 14 dni</span></div>
      ${cache.days.map(d => `<div class="row"><span>${d}</span><button class="btn" data-dl="${d}">Pobierz</button></div>`).join("") || `<p class="note">Brak plików.</p>`}</div>`;
}
async function load(c) { try { cache = await c.hass.callApi("GET", "ems/logs?tail=1000"); } catch (e) { cache.lines = ["Błąd pobierania logów: " + e.message]; } c.render(true); }
export function bind(c, r) {
  r.querySelectorAll("[data-dump]").forEach(b => b.onclick = () => { c.call("esphome", `${c.dev}_zrzut_rejestrow`, { etykieta: b.dataset.dump }); c.log(`Zrzut rejestrow: ${b.dataset.dump}`); c.toast("ok", `📸 Zrzut „${LAB[b.dataset.dump]}” – datalogger czyta ~35 s`, []); setTimeout(() => loadDump(c), 3000); });
  r.querySelector("[data-dumpre]")?.addEventListener("click", () => loadDump(c));
  const f = r.querySelector("[data-filter]");
  if (f) { f.onfocus = () => { c._hold = true; }; f.onblur = () => { c._hold = false; }; f.oninput = () => { filter = f.value.toLowerCase(); }; f.onchange = () => { c._hold = false; c.render(true); }; }
  r.querySelector("[data-reload]")?.addEventListener("click", () => load(c));
  r.querySelector("[data-copy]")?.addEventListener("click", async () => {
    const txt = cache.lines.filter(l => !filter || l.toLowerCase().includes(filter)).join("\n");
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {          // http bez TLS / stara przegladarka -> stara metoda
      const t = document.createElement("textarea"); t.value = txt; t.style.cssText = "position:fixed;opacity:0"; c.shadowRoot.appendChild(t); t.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } t.remove(); }
    const n = txt ? txt.split("\n").length : 0;
    c.toast(ok ? "ok" : "err", ok ? `📋 Skopiowano ${n} linii logu` : "❌ Nie udało się skopiować – zaznacz log ręcznie", []);
  });
  r.querySelectorAll("[data-dl]").forEach(b => b.onclick = async () => {
    const res = await c.hass.fetchWithAuth(`/api/ems/logs/download?day=${b.dataset.dl}`);
    const url = URL.createObjectURL(await res.blob()), a = document.createElement("a"); a.href = url; a.download = `ems-${b.dataset.dl}.log`; a.click(); URL.revokeObjectURL(url);
  });
  const log = r.querySelector("#log"); if (log && !c._hold) log.scrollTop = log.scrollHeight;
}
