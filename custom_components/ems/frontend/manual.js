// Historia recznych kupna/sprzedazy: /api/ems/reczne, lista (3 ostatnie), modal z pelna lista, pasy na wykresach.
import { fmt, esc, S } from "./core.js";

export const MC = { kup: "#ff9f1a", sprzedaj: "#3aa0ff" };
const st = { rows: [], at: 0, sig: "", busy: false, open: false, days: 1 };

// odswiez, gdy zmienia sie sensory recznych (lub co 5 min)
export function loadManual(c) {
  const h = c.hass, sig = ["sensor.ems_reczne_kupione_dzis", "sensor.ems_reczne_sprzedane_dzis", "sensor.ems_plan"].map(i => S(h, i)?.last_updated || "").join("|")
    + "|" + JSON.stringify(S(h, "sensor.ems_plan")?.attributes?.reczne || null);
  if (st.busy || (sig === st.sig && Date.now() - st.at < 300000)) return;
  st.busy = true; st.sig = sig;
  c.hass.callApi("GET", "ems/reczne?dni=14").then(r => { st.rows = r.wpisy || []; }).catch(() => {}).finally(() => { st.at = Date.now(); st.busy = false; c.render(true); });
}
export const manualRows = () => st.rows;

const day0 = (d = 0) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - d); return x; };
const when = r => { const a = new Date(r.od), b = r.do ? new Date(r.do) : null, hm = d => d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return `${a.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })} ${hm(a)}–${b ? hm(b) : "teraz"}`; };
const verb = r => r.typ === "kup" ? (r.do ? "Kupiono" : "Kupuję") : (r.do ? "Sprzedano" : "Sprzedaję");
export const line = r => `<span style="color:${MC[r.typ]}">●</span> ${when(r)} · ${verb(r)} <b>${fmt(r.zrobione_kwh, 2, "kWh")}</b> za <b>${fmt(r.zl, 2, "zł")}</b>`;

// suma dzis z sensorow (kWh, zl, n)
export function today(h) {
  const g = id => { const s = S(h, id); return { kwh: s ? parseFloat(s.state) || 0 : 0, zl: s?.attributes?.zl || 0, n: s?.attributes?.ile_razy || 0 }; };
  return { kup: g("sensor.ems_reczne_kupione_dzis"), sprzedaj: g("sensor.ems_reczne_sprzedane_dzis") };
}

// 3 ostatnie wpisy (dzis) + klik -> modal
export function recent() {
  const d0 = day0().toISOString(), rows = st.rows.filter(r => r.od >= d0).slice(-4).reverse();
  if (!rows.length) return `<div class="ov-mut mr-l">Dziś brak ręcznych kupna / sprzedaży. <a class="mr-lnk" data-mopen>Historia (14 dni) →</a></div>`;
  // wpisy z 0 kWh (przerwane / nic nie przeszlo) wyszarzone
  return `<div class="mr-list mr-2" data-mopen title="Pokaż wszystkie">${rows.map(r => `<div class="mr-r${(r.zrobione_kwh || 0) < 0.005 ? " mr-0" : ""}">${line(r)}${(r.zrobione_kwh || 0) < 0.005 && r.do ? " <span>(nic nie przeszło)</span>" : ""}</div>`).join("")}</div><a class="mr-lnk" data-mopen>Wszystkie (${st.rows.length}) →</a>`;
}

const REASON = { cel: "cel osiągnięty", SOC: "granica SOC", "4 h": "limit 4 h", przerwane: "przerwane", zastapione: "zastąpione nowym", "w toku": "w toku" };
export function modal() {
  if (!st.open) return "";
  const d0 = day0(st.days === 1 ? 0 : st.days - 1).toISOString(), rows = st.rows.filter(r => r.od >= d0).slice().reverse();
  const sum = t => rows.filter(r => r.typ === t).reduce((a, r) => [a[0] + r.zrobione_kwh, a[1] + r.zl, a[2] + 1], [0, 0, 0]);
  const k = sum("kup"), s = sum("sprzedaj");
  const tb = rows.map(r => `<tr><td data-l="Czas" class="hd">${when(r)}</td><td data-l="Typ" style="color:${MC[r.typ]}">${verb(r)}</td><td data-l="Zadane">${fmt(r.kwh, 2, "kWh")}</td><td data-l="Zrobione"><b>${fmt(r.zrobione_kwh, 2, "kWh")}</b></td><td data-l="Kwota"><b>${fmt(r.zl, 2, "zł")}</b></td><td data-l="Koniec">${esc(REASON[r.powod] || r.powod)}</td></tr>`).join("");
  return `<div class="mr-ov" data-mclose><div class="mr-md" data-mstop><div class="mr-hd"><b>Ręczne kupno / sprzedaż</b><span>${[1, 7, 14].map(d => `<button class="btn ${st.days === d ? "on" : ""}" data-mdays="${d}">${d === 1 ? "Dziś" : d + " dni"}</button>`).join("")}<button class="btn" data-mclose>✕</button></span></div>
    <div class="mr-body">${rows.length ? `<table class="tbl rt"><thead><tr><th>Czas</th><th>Typ</th><th>Zadane</th><th>Zrobione</th><th>Kwota</th><th>Koniec</th></tr></thead><tbody>${tb}</tbody></table>` : `<div class="ov-mut">Brak wpisów w tym okresie.</div>`}</div>
    <div class="mr-ft"><span style="color:${MC.kup}">Kupiono ${fmt(k[0], 2, "kWh")} za ${fmt(k[1], 2, "zł")} (${k[2]}×)</span><span style="color:${MC.sprzedaj}">Sprzedano ${fmt(s[0], 2, "kWh")} za ${fmt(s[1], 2, "zł")} (${s[2]}×)</span></div></div></div>`;
}
export function bindManual(c, r) {
  r.querySelectorAll("[data-mopen]").forEach(b => b.onclick = e => { e.stopPropagation(); st.open = true; c.render(true); c._hold = true; });
  r.querySelectorAll("[data-mclose]").forEach(b => b.onclick = e => { if (e.target !== b) return; st.open = false; c._hold = false; c.render(true); });
  r.querySelectorAll("[data-mdays]").forEach(b => b.onclick = () => { st.days = +b.dataset.mdays; c.render(true); });
}
export const isOpen = () => st.open;

// pasy recznych na osi czasu: t0..t1 (ms) -> [{a, b, typ, txt}]
export function bands(t0, t1) {
  return st.rows.map(r => ({ a: Date.parse(r.od), b: r.do ? Date.parse(r.do) : Date.now(), typ: r.typ, r }))
    .filter(x => x.b > t0 && x.a < t1).map(x => ({ ...x, txt: `${x.typ === "kup" ? "Kup" : "Sprzedaj"} ${fmt(x.r.zrobione_kwh, 2)} kWh` }));
}

export const MANUAL_CSS = `
.mr-list{cursor:pointer;margin-top:8px;display:grid;gap:4px;font-size:13px}.mr-r{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mr-l{margin-top:8px}
.mr-all{margin-top:8px;font-size:12px;padding:4px 10px}.mr-2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));column-gap:18px}.mr-0{opacity:.45}.mr-0 span{font-size:11px}.mr-lnk{display:inline-block;margin-top:6px;font-size:12px;color:#60a5fa;cursor:pointer}.mr-lnk:hover{text-decoration:underline}
.mr-ov{position:fixed;inset:0;z-index:50;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px}
.mr-md{background:#0b1622;border:1px solid #2a4560;border-radius:14px;max-width:820px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 0 40px #000}
.mr-hd{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid #1d3a55}.mr-hd span{display:flex;gap:6px}
.mr-body{overflow:auto;padding:8px 16px}.mr-body .tbl{width:100%}
.mr-ft{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid #1d3a55;font-weight:600;font-size:13px}`;
