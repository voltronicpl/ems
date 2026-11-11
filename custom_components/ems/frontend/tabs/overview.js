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
const FLOW = {
  pv: "M430 168 C440 250 540 252 600 255 L700 255",
  bat: "M466 300 C540 300 560 282 610 282 L700 282",
  grid: "M1350 232 C1340 268 1150 265 1060 265 L962 265",
  car: "M962 292 L1060 292 C1120 292 1150 302 1200 302 L1252 302",
};
const sp = n => n == null || isNaN(n) ? "–" : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");   // 1 807 (z odstepem jak na wzorze)
const box = (k, html, cls = "") => { const [l, t, w, h] = POS[k]; return `<div class="sc-card ${cls}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%">${html}</div>`; };
const tile = (ic, cls, lab, val, sub, subc, t) => `<div class="ov-tile"><div class="ov-ic ${cls}">${ic}</div><div><div class="ov-lab">${lab}${tip(t)}</div><div class="ov-val">${val}</div><div class="ov-sub" ${subc ? `style="color:${subc}"` : ""}>${sub}</div></div></div>`;

import { profile, bindProfile, accuracyModal, PROFILE_CSS } from "../profile.js";
import { pwChart } from "../core.js";
import { range, nowWindow } from "../minute.js";
import { slots, cmpHead } from "../forecast.js";
// Prognoza PV i zuzycia domu (teraz ±12 h): pomiar linia ciagla, prognoza przerywana – jak w Planie
function fcRow(c) {
  const w = nowWindow(12), meas = range(c, w.t0, w.t1), sm = slots(c, w.t0, w.t1), now = Date.now(), rows = [];
  for (let t = w.t0, i = 0; t < w.t1; t += 6e4, i++) { const x = sm.get(Math.floor(t / 9e5) * 9e5) || {}, m = t < now ? meas[i] : null;
    rows.push({ t: new Date(t), pv: x.pv ?? null, loadp: x.load ?? null, dzien: x.dzien, pv_m: m?.pv ?? null, dom_m: m?.dom ?? null }); }
  const DOTc = col => `<i class="d" style="background:${col}"></i>`;
  const ch = (key, mk, pk, col, nm) => pwChart({ key, rows, h: 230, order: "m", mName: nm, mUnit: "kW", mSub: "", socIn: false,
    tipf: r => `<div class="tt2">${r.t.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div><div><span>${DOTc(col)}Prognoza</span><b>${fmt((r[pk] || 0) * 4, 2, "kW")}</b></div><div><span>${DOTc(col)}Pomiar</span><b>${r[mk] == null ? "–" : fmt(r[mk], 2, "kW")}</b></div>`,
    lines: [{ k: mk, raw: true, c: col, name: `${nm} (pomiar)`, lg: nm, w: 2.2, fill: true }, { k: pk, c: col, name: `${nm} (prognoza)`, lg: nm, dash: "6 5", nofill: true, w: 2 }] });
  const sum = (k, raw) => rows.reduce((q, r) => q + (r[k] == null ? 0 : raw ? r[k] / 60 : r[k] / 15), 0);
  const hd = (pk, mk, cls) => cmpHead(rows, { pk, dk: pk === "pv" ? "pv" : "load", mk, cls, now });
  return `<div class="ov-fc" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;margin-top:14px">
    <div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span>☀ Produkcja PV – prognoza i pomiar <span class="ov-mut">(teraz ±12 h)</span></span>${hd("pv", "pv_m", "t-o")}</div>${ch("ovpv", "pv_m", "pv", "#facc15", "PV")}</div>
    <div class="ov-box"><div class="ov-h" style="justify-content:space-between"><span>🏠 Zużycie domu – prognoza i pomiar <span class="ov-mut">(teraz ±12 h)</span></span>${hd("loadp", "dom_m", "t-b")}</div>${ch("ovdom", "dom_m", "loadp", "#1e9bff", "Dom")}</div></div>`;
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

function enBox(c, x) {
  const o = EN.okres; loadEn(c, o); const d = EN.d[o] || null, mo = o === "miesiac";
  const row = (a, b, cl = "") => `<div class="ov-row"><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
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

export function render(c) {
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
  const scene = `<style>${FLOW_CSS}${MANUAL_CSS}${PROFILE_CSS}.ov-pp{position:relative}.ptip{position:absolute;top:4px;z-index:5;background:#0b1622f2;border:1px solid #2a4560;border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 0 12px #000a}.ptip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.ov-pp svg{touch-action:pan-y}</style><div class="sc"><img src="${SCENE}" alt="Dom, PV, bateria i sieć">
    ${flowSvg("0 0 1671 400", FLOW, lines(pv, bp, grid), [13, 9, 3.5], "flov")}
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
    <div class="st-row"><div class="sw" data-svc="switch.toggle" data-ent="switch.ems_algorytm" style="cursor:pointer;margin:0"><div class="tg ${on ? "on" : ""}"></div><b style="color:${on ? (man ? "#ffad2e" : "#3ee07a") : "#ff6b6b"};font-size:16px">${on ? (man ? "Czuwa (ręczne ma pierwszeństwo)" : "Włączony") : "Wyłączony"}</b></div><span class="ov-mut">Teraz: ${ACT[plan?.state] || plan?.state || "–"}${nxt ? ` · następnie ${new Date(nxt.start).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} ${(ACT[nxt.action] || nxt.action).toLowerCase()}` : ""}</span></div>
    ${pa.straznik?.ostrzezenie ? `<div style="color:#ff6b6b;margin:4px 0">🛡 ${esc(pa.straznik.ostrzezenie)}</div>` : ""}${pa.straznik?.interwencje ? `<div class="ov-mut" style="margin:2px 0">🛡 Strażnik: ${pa.straznik.interwencje} interwencji od startu</div>` : ""}
    ${pa.pmax_zakupu?.ostrzezenie ? `<div style="color:#ffad2e;margin:4px 0">⚠ ${esc(pa.pmax_zakupu.ostrzezenie)}</div>` : ""}${pa.sprzedaz_ostrzezenie ? `<div style="color:#ff6b6b;margin:4px 0">⚠ ${esc(pa.sprzedaz_ostrzezenie)}</div>` : ""}
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
  const host = r.querySelector("[data-pge-ov]");
  if (host) { if (pgeEl) { pgeEl.hass = c.hass; host.appendChild(pgeEl); } else pgeReady.then(() => c.render(true)); }
  r.querySelectorAll("[data-en]").forEach(b => b.onclick = () => { EN.okres = b.dataset.en; c.render(true); });
  r.querySelector("[data-go-pge]")?.addEventListener("click", () => { c.tab = 1; c.render(); });
  bindManual(c, r);
  bindProfile(c, r);
  r.querySelectorAll("[data-odczyt]").forEach(b => b.onclick = () => c.odczyt([c.rid(c.e("ostatni_odczyt_ustawien"), "Ostatni odczyt ustawien")]));
}
