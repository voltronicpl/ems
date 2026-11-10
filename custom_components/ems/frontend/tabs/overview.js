import { S, num, fmt, tip, esc } from "../core.js";
import { T } from "../tips.js";
import { ic, icR } from "../icons.js";
export const title = "Przegląd";
export const ACT = { charge: "Ładowanie z sieci", sell: "Sprzedaż", self: "Autokonsumpcja", block: "Blokada eksportu", wylaczony: "Algorytm wyłączony", brak_planu: "Brak planu", reczne_buy: "Ręczne kupno", reczne_sell: "Ręczna sprzedaż" };
const WX = { sunny: "sun", "clear-night": "moon", partlycloudy: "cloudSun", cloudy: "cloud", fog: "cloud", rainy: "rain", pouring: "rain", snowy: "snow", "snowy-rainy": "snow", lightning: "storm", "lightning-rainy": "storm", hail: "snow", windy: "cloud", "windy-variant": "cloudSun", exceptional: "cloudSun" };
const SCENE = new URL("../scene.jpg", import.meta.url).href;
// Scena = obrazek uzytkownika; kafelki nakladane DOKLADNIE na miejsca liczb wpisanych w obrazek (procenty kadru 1672x367).
const POS = { pv: [1.8, 8.2, 15.8, 35.6], bat: [2.0, 49.0, 15.8, 48.8], dom: [41.2, 45.6, 16.2, 33.2], grid: [84.0, 8.2, 15.2, 35.6], top: [35.2, 0.6, 32.6, 12.6] };
const sp = n => n == null || isNaN(n) ? "–" : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");   // 1 807 (z odstepem jak na wzorze)
const box = (k, html, cls = "") => { const [l, t, w, h] = POS[k]; return `<div class="sc-card ${cls}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%">${html}</div>`; };
const tile = (ic, cls, lab, val, sub, subc, t) => `<div class="ov-tile"><div class="ov-ic ${cls}">${ic}</div><div><div class="ov-lab">${lab}${tip(t)}</div><div class="ov-val">${val}</div><div class="ov-sub" ${subc ? `style="color:${subc}"` : ""}>${sub}</div></div></div>`;

// Profil mocy z historii HA (co 15 min), odswiezany co 5 min
let hist = { at: 0, rows: [], busy: false };
async function loadHist(c) {
  if (hist.busy || Date.now() - hist.at < 300000) return;
  hist.busy = true;
  const keys = { pv: "pv_moc_suma", bat: "bateria_moc", grid: "siec_moc_suma", dom: "obciazenie_moc_suma" }, d0 = new Date(); d0.setHours(0, 0, 0, 0);
  try {
    const ids = Object.values(keys).map(k => c.e(k)), res = await c.hass.callApi("GET", `history/period/${d0.toISOString()}?filter_entity_id=${ids.join(",")}&minimal_response&no_attributes`);
    const slots = {}; res.forEach(ser => { const k = Object.keys(keys).find(x => c.e(keys[x]) === ser[0]?.entity_id); if (!k) return;
      ser.forEach(p => { const v = parseFloat(p.state); if (isNaN(v)) return; const t = new Date(p.last_changed || p.lu * 1000); const s = Math.floor((t - d0) / 9e5); const o = slots[s] = slots[s] || {}; (o[k] = o[k] || []).push(v); }); });
    hist.rows = Object.entries(slots).map(([s, o]) => ({ s: +s, ...Object.fromEntries(Object.entries(o).map(([k, a]) => [k, a.reduce((x, y) => x + y, 0) / a.length / 1000])) })).sort((a, b) => a.s - b.s);
    hist.at = Date.now();
  } catch (e) { hist.at = Date.now(); }
  hist.busy = false; c.render(true);
}
function profile() {
  const W = 640, H = 170, L = 30, B = 22, n = 96, bw = (W - L - 6) / n, rows = hist.rows;
  if (!rows.length) return `<div class="nohist">Ładuję historię…</div>`;
  const mx = Math.max(2, ...rows.flatMap(r => [r.dom || 0, r.pv || 0, Math.abs(r.bat || 0), Math.abs(r.grid || 0)])), top = Math.ceil(mx / 5) * 5 || 5, y = v => 8 + (top - v) / (2 * top) * (H - B - 8);
  let g = "";
  for (const v of [top, top / 2, 0, -top / 2, -top]) g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? "#1a3246" : "#3b5a73"}"/><text x="${L - 5}" y="${y(v) + 4}" text-anchor="end" class="ov-ax">${String(+v.toFixed(1)).replace(".", ",")}</text>`;
  for (let hh = 0; hh <= 24; hh += 3) if (hh % 3 === 0 && hh) g += `<text x="${L + hh * 4 * bw}" y="${H - 5}" text-anchor="middle" class="ov-ax">${String(hh).padStart(2, "0")}:00</text>`;
  const bar = (i, v, c, o = 1) => { if (!v || Math.abs(v) < 0.005) return ""; const a = y(0), b = y(v); return `<rect x="${(L + i * bw + 0.6).toFixed(1)}" y="${Math.min(a, b).toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${Math.abs(b - a).toFixed(1)}" rx="1" fill="${c}" opacity="${o}"/>`; };
  rows.forEach(r => { g += bar(r.s, r.dom, "#2f8cff", .85) + bar(r.s, -Math.max(0, -(r.bat || 0)), "#22e07a", .9) + bar(r.s, Math.max(0, r.bat || 0) * 0, "#22e07a") + bar(r.s, r.pv, "#facc15", .9) + bar(r.s, Math.min(0, r.grid || 0), "#ff4d5e", .9); });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="ov-prof">${g}</svg><div class="ov-leg"><span><i style="background:#facc15"></i>PV</span><span><i style="background:#22e07a"></i>Bateria</span><span><i style="background:#ff4d5e"></i>Sieć</span><span><i style="background:#2f8cff"></i>Dom</span></div>`;
}

export function render(c) {
  const h = c.hass, v = (k, d) => c.v(k, d);
  loadHist(c);
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
  const scene = `<div class="sc"><img src="${SCENE}" alt="Dom, PV, bateria i sieć">
    ${box("top", `<span>${icR(WX[wx?.state] || "cloudSun", 30)}${wx ? ` ${fmt(wx.attributes.temperature, 1, wx.attributes.temperature_unit || "°C")}` : " –"}</span><i></i><span>${icR("calendar", 26)} ${now.toLocaleDateString("pl-PL", { weekday: "short" }).replace(/^./, x => x.toUpperCase())}, ${now.toLocaleDateString("pl-PL")}</span><i></i><span>${icR("clock", 26)} ${now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>`, "sc-top")}
    ${box("pv", card(icR("sun", 34), "y", "PV", kw(pv), `Dziś: ${fmt(pvd, 1, "kWh")}`))}
    ${box("bat", card(icR("batteryBolt", 34), "g", "Bateria", fmt(soc, 0, "%"), `${fmt(bl, 1)} / ${fmt(br, 1, "kWh")}`, `<div class="sc-sub" style="color:${chg > 0 ? "#3ee07a" : bp > 0 ? "#ffad2e" : "#9fb0c3"}">± ${kw(Math.abs(bp))} ${chg > 0 ? ic("arrowUR", 16) : bp > 0 ? ic("arrowDR", 16) : ""}</div>`, toFull))}
    ${box("dom", card(icR("home", 34), "b", "Dom", kw(domW), `Dziś: ${fmt(dom, 1, "kWh")}`), "sc-dom")}
    ${box("grid", card(icR("tower", 34), "r", "Sieć", kw(Math.abs(grid)), "", `<div class="sc-sub" style="color:${grid > 0 ? "#ff6b6b" : "#3ee07a"}">${grid > 0 ? ic("arrowR", 16) + " Pobór" : grid < 0 ? ic("arrowL", 16) + " Oddawanie" : "–"}</div>`))}
  </div>`;
  const tiles = `<div class="ov-tiles">
    ${tile(icR("batteryBolt", 32), "g", "SOC", fmt(soc, 0, "%"), `${fmt(bp / 1000, 1, "kW")} · ${fmt(v("bateria_napiecie"), 1, "V")}`, "", T.soc)}
    ${tile(icR("bolt", 32), "o", "Moc baterii", kw(Math.abs(bp)), chg > 0 ? "Ładowanie" : bp > 0 ? "Rozładowanie" : "Postój", chg > 0 ? "#3ee07a" : bp > 0 ? "#ffad2e" : "", T.bmoc)}
    ${tile(icR("sun", 32), "y", "PV", kw(pv), `Dziś: ${fmt(pvd, 1, "kWh")}`, "", T.pv)}
    ${tile(icR("home", 32), "b", "Dom", kw(domW), `Dziś: ${fmt(dom, 1, "kWh")}`, "", T.dom)}
    ${tile(icR("tower", 32), "r", "Sieć", kw(Math.abs(grid)), grid > 0 ? "Pobór" : grid < 0 ? "Oddawanie" : "–", grid > 0 ? "#ff6b6b" : "#3ee07a", T.siec)}
    ${tile(icR("leaf", 32), "g", "Autokonsumpcja", `${auto} %`, "PV w domu", "", T.autokons)}</div>`;
  const ster = `<div class="ov-3 ov-ster">
    <div class="ov-box"><div class="ov-h">${ic("robot", 20)} Algorytm EMS${tip(T.algorytm)}</div>
      <div class="sw" data-svc="switch.toggle" data-ent="switch.ems_algorytm" style="cursor:pointer;margin:8px 0"><div class="tg ${on ? "on" : ""}"></div><b style="color:${on ? "#3ee07a" : "#ff6b6b"};font-size:16px">${on ? "Włączony" : "Wyłączony"}</b></div>
      <div class="ov-mut">Teraz: ${ACT[plan?.state] || plan?.state || "–"}${nxt ? ` · następnie ${new Date(nxt.start).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} ${(ACT[nxt.action] || nxt.action).toLowerCase()}` : ""}</div></div>
    <div class="ov-box"><div class="ov-h">${ic("cart", 20)} Ręcznie teraz${tip(T.kup)}</div><div class="ctrl" style="margin-top:8px">
      <div class="inp wbuy">${c.input("number.ems_kup_wh")}<span>Wh</span></div><button class="btn pri" data-svc="button.press" data-ent="button.ems_kup_teraz">Kup</button>
      <div class="inp wbuy">${c.input("number.ems_sprzedaj_wh")}<span>Wh</span></div><button class="btn pri" data-svc="button.press" data-ent="button.ems_sprzedaj_teraz">Sprzedaj</button></div>
      ${man ? `<div class="ov-mut" style="margin-top:8px">W toku: ${esc(man.typ)} ${fmt(man.zrobione_kwh, 2)} / ${fmt(man.kwh, 2, "kWh")} <button class="btn" data-svc="button.press" data-ent="button.ems_przerwij_reczne">Przerwij</button></div>` : ""}</div>
    <div class="ov-box"><div class="ov-h">${ic("settings", 20)} Szybkie akcje</div><div class="ctrl" style="margin-top:8px">
      <button class="btn" data-svc="button.press" data-ent="button.ems_przelicz">${ic("refresh", 16)} Przelicz plan</button><button class="btn" data-odczyt>${ic("download", 16)} Odczytaj falownik</button>
      <button class="btn" data-svc="button.press" data-ent="${c.rid(`button.${c.dev}_ustaw_czas_z_ha`, "Ustaw czas z HA")}">${ic("clock", 16)} Ustaw czas</button></div>
      <div class="ov-mut" style="margin-top:8px">${ic("download", 14)} ${esc(S(h, c.rid(c.e("ostatni_odczyt_ustawien"), "Ostatni odczyt ustawien"))?.state || "–")} · ${ic("upload", 14)} ${esc(S(h, c.rid(c.e("ostatni_zapis"), "Ostatni zapis"))?.state || "–")}</div></div></div>`;
  const row = (a, b, cl = "") => `<div class="ov-row"><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
  const barr = (lab, p, col) => `<div class="ov-ac"><span>${lab}</span><div class="ov-bar"><i style="width:${p}%;background:${col}"></i></div><b>${p} %</b></div>`;
  const mid = `<div class="ov-mid">
    <div class="ov-box"><div class="ov-h">${ic("stack", 20)} Energia dziś</div>${row("Import z sieci", fmt(imp, 1, "kWh"), "#ff6b6b")}${row("Eksport do sieci", fmt(exp, 1, "kWh"), "#3ee07a")}${row("Bateria ład. / rozł.", `${fmt(bl, 1)} / ${fmt(br, 1, "kWh")}`)}${row("Produkcja PV", fmt(pvd, 1, "kWh"), "#facc15")}</div>
    <div class="ov-box"><div class="ov-h">${ic("chart", 20)} Profil mocy <span class="ov-mut">(dziś)</span></div>${profile()}</div>
    <div class="ov-box"><div class="ov-h">${ic("gauge", 20)} Autokonsumpcja${tip(T.autokons)}</div>${barr("PV → dom", pc(pvH), "#3ee07a")}${barr("PV → bateria", pc(pvB), "#3ee07a")}${barr("PV → sieć", pc(pvG), "#3ee07a")}</div></div>`;
  const bot = `<div class="ov-bot">
    <div class="ov-box"><div class="ov-h">${ic("tower", 20)} Sieć (3F, ${fmt(v("siec_czestotliwosc"), 1, "Hz")})</div>${L3.map(l => row(l.toUpperCase(), `${fmt(v("siec_napiecie_" + l), 1, "V")} · ${kw(v("siec_moc_" + l))}`)).join("")}</div>
    <div class="ov-box"><div class="ov-h">${ic("cpu", 20)} Przetwornica</div>${L3.map(l => row(l.toUpperCase(), `${fmt(v("przetwornica_napiecie_" + l), 1, "V")} · ${kw(v("przetwornica_moc_" + l))}`)).join("")}${row("Temp. radiatora", `${fmt(v("temperatura_przetwornicy"), 1)} °C / ${fmt(v("temperatura_radiatora"), 1, "°C")}`)}</div>
    <div class="ov-box"><div class="ov-h">${ic("panel", 20)} PV (stringi)</div>${[1, 2, 3, 4].map(i => row("PV" + i, kw(v("pv" + i + "_moc")))).join("")}</div></div>`;
  return `${S(h, c.e("bateria_soc")) ? "" : `<div class="box err">Brak danych z dataloggera <b>${c.dev}</b>. Sprawdź, czy ESPHome jest online.</div>`}${scene}${tiles}${ster}${mid}${bot}`;
}
export function bind(c, r) {
  r.querySelectorAll("[data-odczyt]").forEach(b => b.onclick = () => c.odczyt([c.rid(c.e("ostatni_odczyt_ustawien"), "Ostatni odczyt ustawien")]));
}
