import { S, num, fmt, tip, esc } from "../core.js";
import { T } from "../tips.js";
import { ic, icR } from "../icons.js";
import { flowSvg, lines, FLOW_CSS } from "../flow.js";
import { loadManual, recent, modal, bindManual, today, bands, line, MC, MANUAL_CSS } from "../manual.js";
export const title = "Przegląd";
export const ACT = { charge: "Ładowanie z sieci", sell: "Sprzedaż", self: "Autokonsumpcja", hold: "Trzymanie (dom z sieci)", block: "Blokada eksportu", wylaczony: "Algorytm wyłączony", brak_planu: "Brak planu", reczne_buy: "Ręczne kupno", reczne_sell: "Ręczna sprzedaż" };
const WX = { sunny: "sun", "clear-night": "moon", partlycloudy: "cloudSun", cloudy: "cloud", fog: "cloud", rainy: "rain", pouring: "rain", snowy: "snow", "snowy-rainy": "snow", lightning: "storm", "lightning-rainy": "storm", hail: "snow", windy: "cloud", "windy-variant": "cloudSun", exceptional: "cloudSun" };
const SCENE = new URL("../scene.jpg", import.meta.url).href;
// Scena = obrazek uzytkownika (bez linii przesylu); kafelki nakladane DOKLADNIE na miejsca kafelkow wpisanych w obrazek (procenty kadru 1671x400, grafika uzytkownika bez kafelkow).
const POS = { pv: [1.2, 5.0, 15.5, 30.0], bat: [1.2, 40.0, 17.0, 44.0], dom: [42.0, 50.0, 15.5, 27.0], grid: [84.5, 5.0, 14.3, 30.0], top: [37.0, 1.5, 26.0, 11.0] };
// Linie przesylu (od zrodla do domu) w ukladzie 1671x400
// v0.6.44: nowe tlo uzytkownika (1672x941), kadr y 60–460 -> 1672x400
const FLOW = {
  pv: "M440 182 C450 262 560 300 650 300",
  bat: "M466 322 C540 322 590 322 650 322",
  grid: "M1350 246 C1340 292 1180 300 1062 300",
  car: "M1062 330 L1290 330",
};
// magazyn (ekran) i slup w ukladzie kadru 1672x400
const BATSCR = [397, 247, 65, 113];
const PYLON = "1350,46 1356,80 1395,90 1395,98 1362,100 1366,128 1398,130 1398,138 1370,140 1376,180 1392,246 1316,246 1330,180 1336,140 1305,138 1305,130 1338,128 1341,100 1306,98 1306,90 1344,80";
function batBars(soc, bp) {
  const [x, y, w, hh] = BATSCR, chg = bp < -20, dis = bp > 20, n = soc == null ? 0 : [0, 1, 2, 3, 4, 5].filter(i => soc >= i * 100 / 6 + 100 / 12).length;
  const bars = [0, 1, 2, 3, 4, 5].map(i => `<div class="bb${i < n ? " on" : ""}${chg ? " ch" : ""}${chg && i === n ? " pl" : ""}${dis && i === n - 1 ? " dn" : ""}"></div>`).join("");
  return `<div class="sc-bat" style="left:${x / 16.72}%;top:${y / 4}%;width:${w / 16.72}%;height:${hh / 4}%"><div class="bbs">${bars}</div>
    <div class="sc-bl">${soc == null ? "–" : Math.round(soc) + " %"}${chg ? ' <i style="color:#ffa53a">↑</i>' : dis ? ' <i style="color:#3dff8f">↓</i>' : ""}</div></div>`;
}
function pylon(grid, max) {
  const a = Math.abs(grid || 0), pc = max > 0 ? a / max : 0, t = Math.min(pc, 1), h = 200 * t, exp = grid < -20;
  const mix = (p, q) => "#" + [1, 3, 5].map(i => Math.round(parseInt(p.substr(i, 2), 16) * (1 - t) + parseInt(q.substr(i, 2), 16) * t).toString(16).padStart(2, "0")).join("");
  const col = exp ? "#3aa0ff" : mix("#ff7a85", "#c4001a"), col0 = exp ? "#1e6fd9" : mix("#ff4d5e", "#8a0010");
  const lamp = pc >= 1 ? "#ff2238" : pc >= 0.8 ? "#facc15" : "#22e07a", ang = Math.PI * (1 - t);
  return `<svg class="sc-pyl" viewBox="0 0 1672 400" preserveAspectRatio="none"><defs><clipPath id="pylc"><polygon points="${PYLON}"/></clipPath>
    <linearGradient id="pylg" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stop-color="${col0}"/><stop offset="1" stop-color="${col}"/></linearGradient>
    <filter id="pylf"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g clip-path="url(#pylc)"><rect x="1300" y="${246 - h}" width="100" height="${h}" fill="url(#pylg)" opacity="${(0.55 + 0.4 * t).toFixed(2)}" style="mix-blend-mode:screen"/></g>
    ${h > 1 ? `<line x1="1300" x2="1400" y1="${246 - h}" y2="${246 - h}" stroke="${col}" stroke-width="1.5" opacity=".8" filter="url(#pylf)"/>` : ""}
    <circle cx="1350" cy="43" r="6" fill="${lamp}" filter="url(#pylf)" class="${pc >= 0.95 ? "pyl-bl" : ""}"/></svg>
    <div class="sc-pl">${exp ? "⬆" : "⬇"} <b>${(a / 1000).toFixed(1).replace(".", ",")} kW</b> · ${Math.round(pc * 100)} %<svg viewBox="0 0 60 34" class="sc-g"><path d="M5 30 A25 25 0 0 1 55 30" fill="none" stroke="#ffffff22" stroke-width="6"/><path d="M5 30 A25 25 0 0 1 55 30" fill="none" stroke="${col}" stroke-width="6" stroke-dasharray="${t * 100} 100" pathLength="100"/><line x1="30" y1="30" x2="${(30 + 22 * Math.cos(ang)).toFixed(1)}" y2="${(30 - 22 * Math.sin(ang)).toFixed(1)}" stroke="#fff" stroke-width="2"/></svg></div>`;
}
const SC_CSS = `.hlr{cursor:pointer;transition:background .15s}.hlr:hover,.hlr.on{background:#1e9bff26 !important;box-shadow:inset 3px 0 0 #1e9bff}
.sc-bat{position:absolute;pointer-events:none}.bbs{position:absolute;inset:9% 14% 7% 14%;display:flex;flex-direction:column-reverse;gap:5%}
.bb{flex:1;border-radius:.2cqw;background:#0f2a1c;border:1px solid #1d4a31;opacity:.55;transition:all .4s}
.bb.on{background:linear-gradient(90deg,#16c060,#3dff8f,#16c060);border-color:#5dffa3;opacity:.95;box-shadow:0 0 .4cqw #3dff8f,0 0 .9cqw #22e07a88}
.bb.ch.on{background:linear-gradient(90deg,#d0650a,#ffa53a,#d0650a);border-color:#ffc27a;box-shadow:0 0 .4cqw #ffa53a,0 0 .9cqw #ff9f1a88}
.bb.pl{animation:bbpl 1.2s ease-in-out infinite}@keyframes bbpl{0%,100%{opacity:.3}50%{opacity:1;background:#ffa53a;box-shadow:0 0 .7cqw #ffa53a}}
.bb.dn{animation:bbdn 1.6s ease-in-out infinite}@keyframes bbdn{0%,100%{opacity:.95}50%{opacity:.55}}
.sc-bl,.sc-pl{position:absolute;white-space:nowrap;color:#fff;font-weight:600;text-shadow:0 0 4px #000,0 0 10px #000,0 1px 2px #000;background:#0b182833;border-radius:.6cqw;padding:.1cqw .5cqw;pointer-events:none}
.sc-bl{left:50%;top:-30%;transform:translateX(-50%);font-size:1.5cqw}.sc-bl i{font-style:normal;font-weight:800}
.sc-pyl{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.pyl-bl{animation:pylbl .6s steps(2) infinite}@keyframes pylbl{50%{opacity:.15}}
.sc-pl{left:78.3%;top:1%;transform:translateX(-50%);font-size:1.15cqw;display:flex;align-items:center;gap:.4cqw;font-weight:500}.sc-pl b{font-size:1.25em}.sc-g{width:2.8cqw}`;
const sp = n => n == null || isNaN(n) ? "–" : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");   // 1 807 (z odstepem jak na wzorze)
const box = (k, html, cls = "") => { const [l, t, w, h] = POS[k]; return `<div class="sc-card ${cls}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%">${html}</div>`; };
const tile = (ic, cls, lab, val, sub, subc, t) => `<div class="ov-tile"><div class="ov-ic ${cls}">${ic}</div><div><div class="ov-lab">${lab}${tip(t)}</div><div class="ov-val">${val}</div><div class="ov-sub" ${subc ? `style="color:${subc}"` : ""}>${sub}</div></div></div>`;

import { profile, bindProfile, accuracyModal, PROFILE_CSS, HL } from "../profile.js";
import { pwChart } from "../core.js";
import { range, nowWindow, dayWindow } from "../minute.js";
import { slots, cmpHead } from "../forecast.js";
// Prognoza PV i zuzycia domu (teraz ±12 h): pomiar linia ciagla, prognoza przerywana – jak w Planie
function fcRow(c, w0, lab = "teraz ±12 h") {
  const w = w0 || nowWindow(12), meas = range(c, w.t0, w.t1), sm = slots(c, w.t0, w.t1), now = Date.now(), rows = [];
  for (let t = w.t0, i = 0; t < w.t1; t += 6e4, i++) { const x = sm.get(Math.floor(t / 9e5) * 9e5) || {}, m = t < now ? meas[i] : null;
    rows.push({ t: new Date(t), pv: x.pv ?? null, loadp: x.load ?? null, dzien: x.dzien, pv_m: m?.pv ?? null, dom_m: m?.dom ?? null }); }
  const DOTc = col => `<i class="d" style="background:${col}"></i>`;
  const ch = (key, mk, pk, col, nm) => pwChart({ key, rows, h: 230, order: "m", mName: nm, mUnit: "kW", mSub: "", socIn: false,
    tipf: r => `<div class="tt2">${r.t.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div><div><span>${DOTc(col)}Prognoza</span><b>${fmt((r[pk] || 0) * 4, 2, "kW")}</b></div><div><span>${DOTc(col)}Pomiar</span><b>${r[mk] == null ? "–" : fmt(r[mk], 2, "kW")}</b></div>`,
    lines: [{ k: mk, raw: true, c: col, name: `${nm} (pomiar)`, lg: nm, w: 2.2, fill: true }, { k: pk, c: col, name: `${nm} (prognoza)`, lg: nm, dash: "6 5", nofill: true, w: 2 }] });
  const sum = (k, raw) => rows.reduce((q, r) => q + (r[k] == null ? 0 : raw ? r[k] / 60 : r[k] / 15), 0);
  const hd = (pk, mk, cls) => cmpHead(rows, { pk, dk: pk === "pv" ? "pv" : "load", mk, cls, now });
  return `<div class="ov-fc" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;margin-top:14px">
    <div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span>☀ Produkcja PV – prognoza i pomiar <span class="ov-mut">(${lab})</span></span>${hd("pv", "pv_m", "t-o")}</div>${ch("ovpv", "pv_m", "pv", "#facc15", "PV")}</div>
    <div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span>🏠 Zużycie domu – prognoza i pomiar <span class="ov-mut">(${lab})</span></span>${hd("loadp", "dom_m", "t-b")}</div>${ch("ovdom", "dom_m", "loadp", "#1e9bff", "Dom")}</div></div>`;
}
// Rachunek za energie w biezacym miesiacu (/api/ems/rachunek), odswiezany co 10 min
const bill = { at: 0, busy: false, d: null };
function billBox(c) {
  if (!bill.busy && Date.now() - bill.at > 600000) { bill.busy = true; c.hass.callApi("GET", "ems/rachunek").then(r => { bill.d = r; }).catch(e => { bill.d = { err: e.message || String(e) }; }).finally(() => { bill.at = Date.now(); bill.busy = false; c.render(true); }); }
  const d = bill.d, mies = new Date().toLocaleDateString("pl-PL", { month: "long" });
  if (!d) return `<div class="ov-box"><div class="ov-h">${ic("coins", 20)} Rachunek – ${mies}</div><div class="ov-mut">Liczę…</div></div>`;
  if (d.err) return `<div class="ov-box"><div class="ov-h">${ic("coins", 20)} Rachunek – ${mies}</div><div class="ov-mut">Nie udało się policzyć: ${esc(d.err)}</div></div>`;
  const r = d.razem || {}, row = (a, b, cl = "") => `<div class="ov-row"><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
  return `<div class="ov-box"><div class="ov-h">${ic("coins", 20)} Rachunek – ${mies} <span class="ov-mut">(energia, od 1.)</span></div>
    ${row("Zakup z sieci", `${fmt(r.kup_kwh, 1, "kWh")} · ${fmt(r.kup_zl, 2, "zł")}`, "#ff6b6b")}${row("Sprzedaż (depozyt)", `${fmt(r.sprz_kwh, 1, "kWh")} · ${fmt(r.depozyt_zl, 2, "zł")}`, "#3ee07a")}
    ${row("Rachunek do teraz", fmt(d.rachunek_zl, 2, "zł"), d.rachunek_zl > 0 ? "#ff6b6b" : "#3ee07a")}${row("Prognoza na koniec miesiąca", d.prognoza_koniec_zl == null ? "–" : `~${fmt(d.prognoza_koniec_zl, 2, "zł")}`)}
    <div class="ov-mut" style="margin-top:6px">Zakup wg G12 godzinowo, depozyt = RCE × ${fmt(num(c.hass, "number.ems_depozyt_mnoznik", 1.23), 2)}, bilansowanie godzinowe. Bez opłat stałych i mocowej.</div></div>`;
}

// Rachunek PGE za ten miesiac – z encji rozliczenia PGE (dawna integracja PGE Net-Billing, teraz w EMS)
export function pgeIds(h) {
  const reg = Object.values(h?.entities || {}), o = {};
  for (const k of ["invoice_forecast", "deposit_estimate", "deposit_available", "import_s1", "import_s2", "export_kwh", "export_value", "variable_cost_gross", "fixed_monthly"])
    o[k] = reg.find(e => e.platform === "ems" && e.translation_key === "pge_" + k)?.entity_id;
  return o;
}
// Kafle PGE (rachunek, depozyt, bilans + depozyt miesiecznie) – ten sam element co zakladka PGE, w trybie "summary"
const PV_ = new URL(import.meta.url).search;
let pgeEl = null;
const pgeReady = import(`../pge.js${PV_}`).then(() => { pgeEl = document.createElement("ems-pge-dashboard"); pgeEl.setAttribute("embedded", ""); pgeEl.setAttribute("summary", ""); });
// Energia dzis / miesiac + handel (/api/ems/energia), odswiezane co 5 min
const EN = { okres: "dzis", d: {}, at: {}, busy: {} };
function loadEn(c, o) {
  if (EN.busy[o] || Date.now() - (EN.at[o] || 0) < 300000) return;
  EN.busy[o] = true;
  c.hass.callApi("GET", `ems/energia?okres=${o}`).then(r => { EN.d[o] = r; }).catch(e => { EN.d[o] = { err: e.message || String(e) }; }).finally(() => { EN.at[o] = Date.now(); EN.busy[o] = false; c.render(true); });
}

const HLK = { "Import z sieci": "imp", "Eksport do sieci": "exp", "Bateria ład. / rozł.": "bat", "Produkcja PV": "pv", "Ręcznie kupione": "man_k", "Ręcznie sprzedane": "man_s",
  "Sprzedane nie z PV": "nonpv", "Sprzedaż łącznie (depozyt)": "sell", "Zakup pod sprzedaż": "buy", "Zysk z handlu": "zysk" };
function enBox(c, x) {
  const o = EN.okres; loadEn(c, o); const d = EN.d[o] || null, mo = o === "miesiac";
  const row = (a, b, cl = "") => `<div class="ov-row${!mo && HLK[a] ? " hlr" : ""}${!mo && HL.k === HLK[a] ? " on" : ""}" ${!mo && HLK[a] ? `data-hl="${HLK[a]}"` : ""}><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
  const g = k => mo ? (d && !d.err ? d[k] : null) : null;
  const imp = mo ? g("imp") : x.imp, exp = mo ? g("exp") : x.exp, bl = mo ? g("bin") : x.bl, br = mo ? g("bout") : x.br, pvd = mo ? g("pv") : x.pvd;
  const tg = `<span class="en-tg">${[["dzis", "Dziś"], ["miesiac", "Miesiąc"]].map(([k, n]) => `<button class="btn ${o === k ? "on" : ""}" data-en="${k}">${n}</button>`).join("")}</span>`;
  const mk = mo ? null : x.mt;
  const han = !d ? `<div class="ov-mut">Liczę…</div>` : d.err ? `<div class="ov-mut">Nie udało się policzyć: ${esc(d.err)}</div>` :
    row("Sprzedane nie z PV", `${fmt(d.nonpv_kwh, 2, "kWh")} · ${fmt(d.nonpv_zl, 2, "zł")}`, "#3ee07a") + row("Sprzedaż łącznie (depozyt)", `${fmt(d.exp, 1, "kWh")} · ${fmt(d.sprz_zl, 2, "zł")}`, "#3ee07a")
    + row("Zakup pod sprzedaż", `${fmt(d.zakup_pod_sprzedaz_kwh, 2, "kWh")} · ${d.zakup_pod_sprzedaz_zl == null ? "–" : fmt(d.zakup_pod_sprzedaz_zl, 2, "zł")}${d.koszt_kwh_baterii != null ? ` <span class="ov-mut">(${fmt(d.koszt_kwh_baterii, 2, "zł/kWh")})</span>` : ""}`, "#ff6b6b")
    + row("Zysk z handlu", d.zysk_handel_zl == null ? "–" : fmt(d.zysk_handel_zl, 2, "zł"), d.zysk_handel_zl >= 0 ? "#3ee07a" : "#ff6b6b");
  return `<div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:8px">${ic("stack", 20)} Energia ${mo ? "w tym miesiącu" : "dziś"}</span>${tg}</div>
    ${row("Import z sieci", fmt(imp, 1, "kWh"), "#ff6b6b")}${row("Eksport do sieci", fmt(exp, 1, "kWh"), "#3ee07a")}${row("Bateria ład. / rozł.", `${fmt(bl, 1)} / ${fmt(br, 1, "kWh")}`)}${row("Produkcja PV", fmt(pvd, 1, "kWh"), "#facc15")}
    ${mk ? row("Ręcznie kupione", `${fmt(mk.kup.kwh, 2, "kWh")} · ${fmt(mk.kup.zl, 2, "zł")}`, MC.kup) + row("Ręcznie sprzedane", `${fmt(mk.sprzedaj.kwh, 2, "kWh")} · ${fmt(mk.sprzedaj.zl, 2, "zł")}`, MC.sprzedaj) : ""}
    <div class="ov-h" style="margin:10px 0 4px;font-size:14px">${ic("coins", 16)} Handel${tip({ co: "Liczone co godzinę: sprzedane nie z PV = eksport ponad bieżącą nadwyżkę PV (PV − dom). Wartość = kWh × RCE × mnożnik depozytu. Zakup pod sprzedaż = sprzedane nie z PV ÷ (sprawność ład. × rozł.) × średni koszt kWh kupionego do baterii (G12). Godziny sprzed dataloggera ze starych encji." })}</div>${han}</div>`;
}

// v0.6.54: wybór dnia w Przeglądzie (c.ovDay = "YYYY-MM-DD"; null = dziś na żywo; zakładka zawsze startuje od dziś)
const isoD = d => new Date(d).toLocaleDateString("sv-SE");
const ED = {};
function loadED(c, d) {
  const e = ED[d] = ED[d] || { at: 0, busy: false, d: null };
  if (!e.busy && !e.at) { e.busy = true; c.hass.callApi("GET", `ems/energia?dzien=${d}`).then(r => { e.d = r; }).catch(x => { e.d = { err: x.message || String(x) }; }).finally(() => { e.at = Date.now(); e.busy = false; c.render(true); }); }
  return e.d;
}
function dayBar(c) {
  const td = isoD(Date.now()), d = c.ovDay || td, mx = new Date(); mx.setDate(mx.getDate() + 2);
  const lbl = d === td ? "Dziś (na żywo)" : d > td ? "Prognoza / plan" : "Podsumowanie dnia";
  return `<div class="ov-box" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px">${icR("calendar", 22)}<b>Dzień:</b>
    <button class="btn" data-ovd="-1">◀</button><input type="date" data-ovdate value="${d}" max="${isoD(mx)}" style="background:#0b1622;color:#e2e8f0;border:1px solid #2a4560;border-radius:8px;padding:5px 8px;color-scheme:dark">
    <button class="btn" data-ovd="1" ${d >= isoD(mx) ? "disabled" : ""}>▶</button><button class="btn ${d === td ? "on" : ""}" data-ovtoday>Dziś</button>
    <b style="color:${d === td ? "#3ee07a" : d > td ? "#a78bfa" : "#facc15"}">${lbl}</b><span class="ov-mut">${new Date(d + "T00:00").toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div>`;
}
function dayView(c) {
  const d = c.ovDay, w = dayWindow(new Date(d + "T00:00")), fut = w.t0 > Date.now();
  let x, err = null;
  const sm = slots(c, w.t0, w.t1), sl = [...sm.entries()].filter(([t]) => t >= w.t0 && t < w.t1).map(([, v]) => v);
  if (fut) {
    const s = k => sl.reduce((q, v) => q + (v[k] || 0), 0); let bin = 0, bout = 0;
    for (const v of sl) { const b = (v.pv || 0) + (v.imp || 0) - (v.load || 0) - (v.exp || 0); if (b > 0) bin += b; else bout -= b; }
    x = { pv: s("pv"), dom: s("load"), imp: s("imp"), exp: s("exp"), bin, bout };
  } else { const r = loadED(c, d); if (r?.err) err = r.err; x = r && !r.err ? r : null; }
  const meas = fut ? [] : range(c, w.t0, w.t1), socs = (fut ? sl.map(v => v.soc) : meas.map(r => r.soc)).filter(v => v != null);
  const soc0 = socs[0], soc1 = socs[socs.length - 1], smin = socs.length ? Math.min(...socs) : null, smax = socs.length ? Math.max(...socs) : null;
  const pmax = k => meas.reduce((q, r) => Math.max(q, Math.abs(r[k] || 0)), 0);
  const g = k => x ? x[k] : null, auto = x && x.pv > 0 ? Math.round(Math.max(x.pv - x.exp, 0) / x.pv * 100) : null;
  const card = (icn, cls, lab, val, sub, sub2) => `<div class="sc-ic ${cls}">${icn}</div><div class="sc-tx"><div class="sc-lab">${lab}</div><div class="sc-val">${val}</div>${sub ? `<div class="sc-sub">${sub}</div>` : ""}${sub2 ? `<div class="sc-sm">${sub2}</div>` : ""}</div>`;
  const pre = fut ? "Prognoza: " : "";
  const scene = `<style>${FLOW_CSS}${MANUAL_CSS}${PROFILE_CSS}${SC_CSS}.ov-pp{position:relative}.ptip{position:absolute;top:4px;z-index:5;background:#0b1622f2;border:1px solid #2a4560;border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 0 12px #000a}.ptip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.ov-pp svg{touch-action:pan-y}</style><div class="sc"><img src="${SCENE}" alt="Dom, PV, bateria i sieć">
    ${batBars(soc1, 0)}
    ${box("top", `<span>${icR("calendar", 26)} ${new Date(d + "T00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</span><i></i><span>${fut ? "Prognoza dnia" : "Podsumowanie dnia"}</span>`, "sc-top")}
    ${box("pv", card(icR("sun", 34), "y", "PV", fmt(g("pv"), 1, "kWh"), fut ? "prognoza" : `szczyt ${fmt(pmax("pv"), 1, "kW")}`))}
    ${box("bat", card(icR("batteryBolt", 34), "g", "Bateria", soc1 == null ? "–" : `${fmt(soc0, 0)} → ${fmt(soc1, 0, "%")}`, `${fmt(g("bin"), 1)} / ${fmt(g("bout"), 1, "kWh")}`, smin == null ? "" : `SOC min ${fmt(smin, 0)} % · max ${fmt(smax, 0)} %`))}
    ${box("dom", card(icR("home", 34), "b", "Dom", fmt(g("dom"), 1, "kWh"), fut ? "prognoza" : `szczyt ${fmt(pmax("dom"), 1, "kW")}`), "sc-dom")}
    ${box("grid", card(icR("tower", 34), "r", "Sieć", `${fmt(g("imp"), 1)} / ${fmt(g("exp"), 1, "kWh")}`, "pobór / oddanie"))}
  </div>`;
  const tiles = `<div class="ov-tiles">
    ${tile(icR("sun", 32), "y", "PV", fmt(g("pv"), 1, "kWh"), pre + "produkcja", "", T.pv)}
    ${tile(icR("home", 32), "b", "Dom", fmt(g("dom"), 1, "kWh"), pre + "zużycie", "", T.dom)}
    ${tile(icR("tower", 32), "r", "Import z sieci", fmt(g("imp"), 1, "kWh"), pre + "pobór", "#ff6b6b", T.siec)}
    ${tile(icR("tower", 32), "g", "Eksport do sieci", fmt(g("exp"), 1, "kWh"), pre + "oddanie", "#3ee07a", T.siec)}
    ${tile(icR("batteryBolt", 32), "o", "Bateria", `${fmt(g("bin"), 1)} / ${fmt(g("bout"), 1)}`, "kWh ład. / rozł.", "", T.bmoc)}
    ${tile(icR("leaf", 32), "g", "Autokonsumpcja", auto == null ? "–" : `${auto} %`, "PV w domu", "", T.autokons)}</div>`;
  const row = (a, b, cl = "") => `<div class="ov-row"><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
  const han = fut ? `<div class="ov-mut">Dzień w przyszłości – handel będzie policzony po fakcie. Akcje z planu widać na Profilu mocy.</div>` : !x ? `<div class="ov-mut">${err ? "Nie udało się policzyć: " + esc(err) : "Liczę…"}</div>` :
    row("Sprzedane nie z PV", `${fmt(x.nonpv_kwh, 2, "kWh")} · ${fmt(x.nonpv_zl, 2, "zł")}`, "#3ee07a") + row("Sprzedaż łącznie (depozyt)", `${fmt(x.exp, 1, "kWh")} · ${fmt(x.sprz_zl, 2, "zł")}`, "#3ee07a")
    + row("Zakup pod sprzedaż", `${fmt(x.zakup_pod_sprzedaz_kwh, 2, "kWh")} · ${x.zakup_pod_sprzedaz_zl == null ? "–" : fmt(x.zakup_pod_sprzedaz_zl, 2, "zł")}`, "#ff6b6b")
    + row("Zysk z handlu", x.zysk_handel_zl == null ? "–" : fmt(x.zysk_handel_zl, 2, "zł"), x.zysk_handel_zl >= 0 ? "#3ee07a" : "#ff6b6b");
  const en = `<div class="ov-box"><div class="ov-h">${ic("stack", 20)} Energia ${fut ? "– prognoza dnia" : "w tym dniu"}</div>
    ${row("Import z sieci", fmt(g("imp"), 1, "kWh"), "#ff6b6b")}${row("Eksport do sieci", fmt(g("exp"), 1, "kWh"), "#3ee07a")}${row("Bateria ład. / rozł.", `${fmt(g("bin"), 1)} / ${fmt(g("bout"), 1, "kWh")}`)}${row("Produkcja PV", fmt(g("pv"), 1, "kWh"), "#facc15")}${row("Zużycie domu", fmt(g("dom"), 1, "kWh"), "#1e9bff")}
    <div class="ov-h" style="margin:10px 0 4px;font-size:14px">${ic("coins", 16)} Handel</div>${han}</div>`;
  const mid = `<div class="ov-mid">${en}
    <div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:8px">${icR("chart", 26)} Profil mocy <span class="ov-mut">(cały dzień)</span></span>${fut ? "" : `<button class="btn" data-pfopen style="font-size:12px;padding:4px 10px">Prognoza vs rzeczywistość ↗</button>`}</div>${profile(c, w)}</div></div>`;
  return `${dayBar(c)}${scene}${tiles}${mid}${fcRow(c, w, "cały dzień")}${modal()}${accuracyModal(c)}`;
}

const presPill = x => { const o = x?.obecnosc; return o && o.osob != null ? `<span class="pill ${o.osob ? "b" : "o"}" title="Obecność z telefonów. Prognoza zużycia domu (bez pompy) na najbliższe 2 h skorygowana wg liczby osób w domu, dalej typowa obecność.">🏠 ${o.osob === 0 ? "nikogo w domu" : o.osob === 1 ? "w domu: 1 osoba" : "w domu: 2 osoby"}${o.model ? (o.proc ? ` – prognoza zużycia ${o.proc > 0 ? "+" : "−"}${Math.abs(o.proc)} %` : "") : " – model się uczy"}</span>` : ""; };

export function render(c) {
  if (c.ovDay && c.ovDay !== isoD(Date.now())) return dayView(c);
  return dayBar(c) + renderLive(c);
}
function renderLive(c) {
  const h = c.hass, v = (k, d) => c.v(k, d);
  loadManual(c);
  const mt = today(h);
  const soc = v("bateria_soc"), bp = v("bateria_moc", 0), grid = v("siec_moc_suma", 0), pv = v("pv_moc_suma", 0), domW = v("obciazenie_moc_suma", 0);
  const dom = v("energia_zuzycie_dom_dzisiaj", 0), imp = v("energia_siec_import_dzisiaj", 0), exp = v("energia_siec_export_dzisiaj", 0), pvd = v("energia_pv_produkcja_dzisiaj", 0);
  const bl = v("energia_bateria_ladowanie_dzisiaj"), br = v("energia_bateria_rozladowanie_dzisiaj"), chg = Math.max(0, -bp);
  const on = S(h, "switch.ems_algorytm")?.state === "on", plan = S(h, "sensor.ems_plan"), pa = plan?.attributes || {}, man = pa.reczne;
  const cap = num(h, "number.ems_pojemnosc_wh", 15000), full = chg > 50 && soc != null ? (100 - soc) / 100 * cap / chg : null;
  const toFull = full != null ? `Do pełna: ~${Math.floor(full)} h ${Math.round((full % 1) * 60)} min` : bp > 50 ? "Rozładowanie" : "Postój";
  // autokonsumpcja chwilowa: PV -> dom / bateria / siec
  const pvH = Math.min(pv, domW), rest = Math.max(pv - pvH, 0), pvB = Math.min(rest, chg), pvG = Math.max(rest - pvB, 0), pc = x => pv > 0 ? Math.round(x / pv * 100) : 0;
  const auto = pvd > 0 ? Math.round(Math.max(pvd - exp, 0) / pvd * 100) : (pv > 0 ? pc(pvH + pvB) : 100);
  const wx = Object.values(h.states).find(s => s.entity_id.startsWith("weather.")), now = new Date();
  const nxt = (pa.plan || []).find(s => new Date(s.start) > now && s.action !== "self");
  const L3 = ["l1", "l2", "l3"], kw = w => `${sp(w)} W`;
  const card = (ic, cls, lab, val, sub, sub2, sub3) => `<div class="sc-ic ${cls}">${ic}</div><div class="sc-tx"><div class="sc-lab">${lab}</div><div class="sc-val">${val}</div>${sub ? `<div class="sc-sub">${sub}</div>` : ""}${sub2 || ""}${sub3 ? `<div class="sc-sm">${sub3}</div>` : ""}</div>`;
  const scene = `<style>${FLOW_CSS}${MANUAL_CSS}${PROFILE_CSS}${SC_CSS}.ov-pp{position:relative}.ptip{position:absolute;top:4px;z-index:5;background:#0b1622f2;border:1px solid #2a4560;border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 0 12px #000a}.ptip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.ov-pp svg{touch-action:pan-y}</style><div class="sc"><img src="${SCENE}" alt="Dom, PV, bateria i sieć">
    ${flowSvg("0 0 1672 400", FLOW, lines(pv, bp, grid), [13, 9, 3.5], "flov")}${pylon(grid, num(h, "number.ems_max_pobor_w", 12000))}${batBars(soc, bp)}
    ${box("top", `<span>${icR(WX[wx?.state] || "cloudSun", 30)}${wx ? ` ${fmt(wx.attributes.temperature, 1, wx.attributes.temperature_unit || "°C")}` : " –"}</span><i></i><span>${icR("calendar", 26)} ${now.toLocaleDateString("pl-PL", { weekday: "short" }).replace(/^./, x => x.toUpperCase())}, ${now.toLocaleDateString("pl-PL")}</span><i></i><span>${icR("clock", 26)} ${now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>`, "sc-top")}
    ${box("pv", card(icR("sun", 34), "y", "PV", kw(pv), `Dziś: ${fmt(pvd, 1, "kWh")}`))}
    ${box("bat", card(icR("batteryBolt", 34), "g", "Bateria", fmt(soc, 0, "%"), `${fmt(bl, 1)} / ${fmt(br, 1, "kWh")}`, `<div class="sc-sub" style="color:${chg > 0 ? "#3ee07a" : bp > 0 ? "#ffad2e" : "#9fb0c3"}">± ${kw(Math.abs(bp))} ${chg > 0 ? ic("arrowUR", 16) : bp > 0 ? ic("arrowDR", 16) : ""}</div>`, toFull))}
    ${box("dom", card(icR("home", 34), "b", "Dom", kw(domW), `Dziś: ${fmt(dom, 1, "kWh")}`), "sc-dom")}
    ${box("grid", card(icR("tower", 34), "r", "Sieć", kw(Math.abs(grid)), "", `<div class="sc-sub" style="color:${grid > 0 ? "#ff6b6b" : "#3aa0ff"}">${grid > 0 ? ic("arrowL", 16) + " Pobór" : grid < 0 ? ic("arrowR", 16) + " Oddawanie" : "–"}</div>`))}
  </div>`;
  const tiles = `<div class="ov-tiles">
    ${tile(icR("batteryBolt", 32), "g", "SOC", fmt(soc, 0, "%"), `${fmt(bp / 1000, 1, "kW")} · ${fmt(v("bateria_napiecie"), 1, "V")}`, "", T.soc)}
    ${tile(icR("bolt", 32), "o", "Moc baterii", kw(Math.abs(bp)), chg > 0 ? "Ładowanie" : bp > 0 ? "Rozładowanie" : "Postój", chg > 0 ? "#3ee07a" : bp > 0 ? "#ffad2e" : "", T.bmoc)}
    ${tile(icR("sun", 32), "y", "PV", kw(pv), `Dziś: ${fmt(pvd, 1, "kWh")}`, "", T.pv)}
    ${tile(icR("home", 32), "b", "Dom", kw(domW), `Dziś: ${fmt(dom, 1, "kWh")}`, "", T.dom)}
    ${tile(icR("tower", 32), "r", "Sieć", kw(Math.abs(grid)), grid > 0 ? "Pobór" : grid < 0 ? "Oddawanie" : "–", grid > 0 ? "#ff6b6b" : "#3ee07a", T.siec)}
    ${tile(icR("leaf", 32), "g", "Autokonsumpcja", `${auto} %`, "PV w domu", "", T.autokons)}</div>`;
  const ster = `<div class="ov-box ov-ster" style="margin-bottom:14px"><div class="ov-h">${ic("robot", 20)} Sterowanie${tip(T.algorytm)}</div>
    <div class="st-row"><div class="sw" data-svc="switch.toggle" data-ent="switch.ems_algorytm" style="cursor:pointer;margin:0"><div class="tg ${on ? "on" : ""}"></div><b style="color:${on ? (man ? "#ffad2e" : "#3ee07a") : "#ff6b6b"};font-size:16px">${on ? (man ? "Czuwa (ręczne ma pierwszeństwo)" : "Włączony") : "Wyłączony"}</b></div>${presPill(pa.podsumowanie)} <span class="ov-mut">Teraz: ${ACT[plan?.state] || plan?.state || "–"}${nxt ? ` · następnie ${new Date(nxt.start).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} ${(ACT[nxt.action] || nxt.action).toLowerCase()}` : ""}</span></div>
    ${pa.straznik?.ostrzezenie ? `<div style="color:#ff6b6b;margin:4px 0">🛡 ${esc(pa.straznik.ostrzezenie)}</div>` : ""}${pa.straznik?.interwencje ? `<div class="ov-mut" style="margin:2px 0">🛡 Strażnik: ${pa.straznik.interwencje} interwencji od startu</div>` : ""}
    ${pa.sprzedaz_ostrzezenie ? `<div style="color:#ff6b6b;margin:4px 0">⚠ ${esc(pa.sprzedaz_ostrzezenie)}</div>` : ""}
    <div class="st-row"><div class="ctrl"><div class="inp wbuy">${c.input("number.ems_kup_wh")}<span>Wh</span></div><button class="btn pri" data-svc="button.press" data-ent="button.ems_kup_teraz">Kup</button>
      <div class="inp wbuy">${c.input("number.ems_sprzedaj_wh")}<span>Wh</span></div><button class="btn pri" data-svc="button.press" data-ent="button.ems_sprzedaj_teraz">Sprzedaj</button></div><span class="ov-mut">Dziś: <span style="color:${MC.kup}">kupione ${fmt(mt.kup.kwh, 2, "kWh")} za ${fmt(mt.kup.zl, 2, "zł")}</span> · <span style="color:${MC.sprzedaj}">sprzedane ${fmt(mt.sprzedaj.kwh, 2, "kWh")} za ${fmt(mt.sprzedaj.zl, 2, "zł")}</span></span>${tip(T.kup)}</div>
    ${man ? `<div class="ov-mut" style="margin-top:8px">W toku: ${esc(man.typ)} ${fmt(man.zrobione_kwh, 2)} / ${fmt(man.kwh, 2, "kWh")}${man.zl != null ? ` · ${fmt(man.zl, 2, "zł")}` : ""}${man.ostrzezenie ? `<div style="color:#ffad2e;margin-top:4px">⚠ ${esc(man.ostrzezenie)}</div>` : ""} <button class="btn" data-svc="button.press" data-ent="button.ems_przerwij_reczne">Przerwij</button></div>` : ""}
    ${recent()}</div>`;
  const row = (a, b, cl = "") => `<div class="ov-row"><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
  const barr = (lab, p, col) => `<div class="ov-ac"><span>${lab}</span><div class="ov-bar"><i style="width:${p}%;background:${col}"></i></div><b>${p} %</b></div>`;
  const mid = `<div class="ov-mid">
    ${enBox(c, { imp, exp, bl, br, pvd, mt })}
    <div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span style="display:flex;align-items:center;gap:8px">${icR("chart", 26)} Profil mocy <span class="ov-mut">(teraz ±12 h)</span></span><button class="btn" data-pfopen style="font-size:12px;padding:4px 10px">Prognoza vs rzeczywistość ↗</button></div>${profile(c)}</div></div>`;
  const bot = `<div class="ov-bot">
    <div class="ov-box"><div class="ov-h">${ic("tower", 20)} Sieć (3F, ${fmt(v("siec_czestotliwosc"), 1, "Hz")})</div>${L3.map(l => row(l.toUpperCase(), `${fmt(v("siec_napiecie_" + l), 1, "V")} · ${kw(v("siec_moc_" + l))}`)).join("")}</div>
    <div class="ov-box"><div class="ov-h">${ic("cpu", 20)} Przetwornica</div>${L3.map(l => row(l.toUpperCase(), `${fmt(v("przetwornica_napiecie_" + l), 1, "V")} · ${kw(v("przetwornica_moc_" + l))}`)).join("")}${row("Temp. radiatora", `${fmt(v("temperatura_przetwornicy"), 1)} °C / ${fmt(v("temperatura_radiatora"), 1, "°C")}`)}</div>
    <div class="ov-box"><div class="ov-h">${ic("panel", 20)} PV (stringi)</div>${[1, 2, 3, 4].map(i => row("PV" + i, kw(v("pv" + i + "_moc")))).join("")}</div></div>`;
  return `${S(h, c.e("bateria_soc")) ? "" : `<div class="box err">Brak danych z dataloggera <b>${c.dev}</b>. Sprawdź, czy ESPHome jest online.</div>`}${scene}${tiles}<div data-pge-ov style="margin-bottom:14px">${pgeEl ? "" : `<div class="ov-box ov-mut" style="min-height:420px">Ładuję rozliczenie PGE…</div>`}</div>${mid}${fcRow(c)}<div style="margin-top:14px">${ster}</div><div style="margin-bottom:14px">${billBox(c)}</div>${bot}${modal()}${accuracyModal(c)}`;
}
export function bind(c, r) {
  const setD = d => { const td = isoD(Date.now()); c.ovDay = !d || d === td ? null : d; c._hold = false; c.render(true); };
  r.querySelectorAll("[data-ovd]").forEach(b => b.onclick = () => { const d = new Date((c.ovDay || isoD(Date.now())) + "T12:00"); d.setDate(d.getDate() + +b.dataset.ovd); setD(isoD(d)); });
  r.querySelector("[data-ovtoday]")?.addEventListener("click", () => setD(null));
  const di = r.querySelector("[data-ovdate]"); if (di) { di.onchange = () => setD(di.value); di.onfocus = () => { c._hold = true; }; di.onblur = () => { c._hold = false; }; di.onclick = () => { try { di.showPicker(); } catch (e) {} }; }
  r.querySelectorAll("[data-hl]").forEach(el => {
    const set = k => { if (HL.k === k) return; HL.k = k; c._hold = !!k; c.render(true); };
    el.addEventListener("mouseenter", () => set(el.dataset.hl));
    el.addEventListener("mouseleave", () => set(null));
    el.addEventListener("click", e => { if (e.pointerType === "touch" || e.sourceCapabilities?.firesTouchEvents) set(HL.k === el.dataset.hl ? null : el.dataset.hl); });
  });
  const host = r.querySelector("[data-pge-ov]");
  if (host) { if (pgeEl) { pgeEl.hass = c.hass; host.appendChild(pgeEl); } else pgeReady.then(() => c.render(true)); }
  r.querySelectorAll("[data-en]").forEach(b => b.onclick = () => { EN.okres = b.dataset.en; c.render(true); });
  r.querySelector("[data-go-pge]")?.addEventListener("click", () => { c.tab = 1; c.render(); });
  bindManual(c, r);
  bindProfile(c, r);
  r.querySelectorAll("[data-odczyt]").forEach(b => b.onclick = () => c.odczyt([c.rid(c.e("ostatni_odczyt_ustawien"), "Ostatni odczyt ustawien")]));
}
