import { S, num, fmt, tip, esc } from "../core.js";
import { T } from "../tips.js";
import { ic, icR } from "../icons.js";
import { flowSvg, lines, FLOW_CSS } from "../flow.js";
import { loadManual, recent, modal, bindManual, today, bands, line, MC, MANUAL_CSS } from "../manual.js";
export const title = "Przegląd";
export const ACT = { charge: "Ładowanie z sieci", sell: "Sprzedaż", self: "Autokonsumpcja", block: "Blokada eksportu", wylaczony: "Algorytm wyłączony", brak_planu: "Brak planu", reczne_buy: "Ręczne kupno", reczne_sell: "Ręczna sprzedaż" };
const WX = { sunny: "sun", "clear-night": "moon", partlycloudy: "cloudSun", cloudy: "cloud", fog: "cloud", rainy: "rain", pouring: "rain", snowy: "snow", "snowy-rainy": "snow", lightning: "storm", "lightning-rainy": "storm", hail: "snow", windy: "cloud", "windy-variant": "cloudSun", exceptional: "cloudSun" };
const SCENE = new URL("../scene.jpg", import.meta.url).href;
// Scena = obrazek uzytkownika (bez linii przesylu); kafelki nakladane DOKLADNIE na miejsca kafelkow wpisanych w obrazek (procenty kadru 1672x367).
const POS = { pv: [1.7, 8.0, 15.7, 36.5], bat: [1.8, 46.8, 15.6, 52.0], dom: [41.5, 48.2, 16.8, 32.5], grid: [84.1, 8.0, 15.9, 37.0], top: [35.5, 0.4, 32.2, 12.6] };
// Linie przesylu (od zrodla do domu) w ukladzie 1672x367
const FLOW = {
  pv: "M300 162 L440 162 C500 162 500 245 560 250 L700 252",
  bat: "M470 300 L560 298 C610 296 610 266 650 264 L700 263",
  grid: "M1345 172 L1180 172 C1120 172 1110 238 1060 240 L972 240",
  car: "M972 268 L1080 268 C1130 268 1150 298 1200 299 L1258 299",
};
const sp = n => n == null || isNaN(n) ? "–" : Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");   // 1 807 (z odstepem jak na wzorze)
const box = (k, html, cls = "") => { const [l, t, w, h] = POS[k]; return `<div class="sc-card ${cls}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%">${html}</div>`; };
const tile = (ic, cls, lab, val, sub, subc, t) => `<div class="ov-tile"><div class="ov-ic ${cls}">${ic}</div><div><div class="ov-lab">${lab}${tip(t)}</div><div class="ov-val">${val}</div><div class="ov-sub" ${subc ? `style="color:${subc}"` : ""}>${sub}</div></div></div>`;

import { hist, loadHist, minutes } from "../minute.js";
const PW = 640, PH = 190, PL = 30, PB = 22, PT = 16;
const PS = [["pv", "#facc15", "PV"], ["bat", "#22e07a", "Bateria"], ["grid", "#ff4d5e", "Sieć"], ["dom", "#2f8cff", "Dom"]];
let prof = null;
function profile() {
  const { t0, rows } = minutes(); prof = null;
  if (!rows.some(r => r.dom != null || r.pv != null)) return `<div class="nohist">Ładuję historię…</div>`;
  const mx = Math.max(2, ...rows.flatMap(r => PS.map(([k]) => Math.abs(r[k] || 0)))), top = Math.ceil(mx / 2.5) * 2.5,
    X = m => PL + m / 1440 * (PW - PL - 4), Y = v => PT + (top - v) / (2 * top) * (PH - PB - PT);
  let g = "";
  for (const v of [top, top / 2, 0, -top / 2, -top]) g += `<line x1="${PL}" x2="${PW}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v ? "#1a3246" : "#3b5a73"}"/><text x="${PL - 5}" y="${Y(v) + 4}" text-anchor="end" class="ov-ax">${String(+v.toFixed(1)).replace(".", ",")}</text>`;
  for (let hh = 3; hh < 24; hh += 3) g += `<text x="${X(hh * 60)}" y="${PH - 5}" text-anchor="middle" class="ov-ax">${String(hh).padStart(2, "0")}:00</text>`;
  // reczne kupno / sprzedaz – pasy
  for (const b of bands(t0, t0 + 864e5)) { const a = X(Math.max(0, (b.a - t0) / 6e4)), e = X(Math.min(1440, (b.b - t0) / 6e4)), w = Math.max(e - a, 2);
    g += `<rect x="${a}" y="${PT - 2}" width="${w}" height="${PH - PB - PT + 4}" fill="${MC[b.typ]}" opacity=".13"/><rect x="${a}" y="${PT - 2}" width="${w}" height="3" fill="${MC[b.typ]}"/>`
      + `<text x="${a + 3}" y="${PT - 5}" style="fill:${MC[b.typ]};font-size:10px;font-weight:600">${b.txt}</text>`; }
  // linie z wypelnieniem (bateria: + rozladowanie w gore, sieć: pobor w dol jak dawniej)
  const sgn = { pv: 1, bat: 1, grid: -1, dom: 1 };
  for (const [k, c] of [["dom", "#2f8cff"], ["pv", "#facc15"], ["bat", "#22e07a"], ["grid", "#ff4d5e"]]) {
    let d = "", on = false; rows.forEach(r => { const v = r[k]; if (v == null) { on = false; return; } const y = Y(sgn[k] * v).toFixed(1); d += on ? `V${y}H${X(r.m + 1).toFixed(1)}` : `M${X(r.m).toFixed(1)} ${y}H${X(r.m + 1).toFixed(1)}`; on = true; });
    if (!d) continue;
    g += d.split("M").filter(Boolean).map(q => `<path d="M${q}V${Y(0).toFixed(1)}H${q.split(" ")[0]}Z" fill="${c}" opacity="${k === "dom" ? .22 : .3}"/>`).join("") + `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  prof = { t0, rows, X, PW };
  return `<div class="ov-pp" data-prof><svg viewBox="0 0 ${PW} ${PH}" width="100%" class="ov-prof">${g}<line class="pcl" x1="0" x2="0" y1="${PT}" y2="${PH - PB}" stroke="#e2e8f0" stroke-width="1" style="display:none"/></svg><div class="ptip" style="display:none"></div></div>
    <div class="ov-leg">${PS.map(([, c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}<span><i style="background:${MC.kup}"></i>Ręczne kupno</span><span><i style="background:${MC.sprzedaj}"></i>Ręczna sprzedaż</span></div>`;
}
function profTip(box, m) {
  const svgl = box.querySelector(".pcl"), tip = box.querySelector(".ptip"); if (!prof || m == null || m < 0 || m >= prof.rows.length) { svgl.style.display = tip.style.display = "none"; return; }
  const r = prof.rows[m], x = prof.X(m + 0.5), t = new Date(prof.t0 + m * 6e4), kv = v => v == null ? "–" : `${fmt(v, 2)} kW`;
  svgl.setAttribute("x1", x); svgl.setAttribute("x2", x); svgl.style.display = "";
  const man = bands(prof.t0 + m * 6e4, prof.t0 + (m + 1) * 6e4).map(b => `<div style="color:${MC[b.typ]}">${line(b.r)}</div>`).join("");
  tip.innerHTML = `<b>${t.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</b>`
    + `<div><i style="background:#facc15"></i>PV ${kv(r.pv)}</div><div><i style="background:#22e07a"></i>Bateria ${r.bat == null ? "–" : `${fmt(Math.abs(r.bat), 2)} kW ${r.bat < -0.02 ? "ładowanie" : r.bat > 0.02 ? "rozładowanie" : ""}`}</div>`
    + `<div><i style="background:#ff4d5e"></i>Sieć ${r.grid == null ? "–" : `${fmt(Math.abs(r.grid), 2)} kW ${r.grid > 0.02 ? "pobór" : r.grid < -0.02 ? "oddawanie" : ""}`}</div><div><i style="background:#2f8cff"></i>Dom ${kv(r.dom)}</div><div><i style="background:#d8b4fe"></i>SOC ${fmt(r.soc, 0, "%")}</div>${man}`;
  tip.style.display = ""; const pw = box.clientWidth, px = x / prof.PW * pw; tip.style.left = Math.min(Math.max(px + 12, 0), pw - tip.offsetWidth - 4) + "px";
  if (px + 12 + tip.offsetWidth > pw) tip.style.left = Math.max(px - tip.offsetWidth - 12, 0) + "px";
}

export function render(c) {
  const h = c.hass, v = (k, d) => c.v(k, d);
  loadHist(c); loadManual(c);
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
  const scene = `<style>${FLOW_CSS}${MANUAL_CSS}.ov-pp{position:relative}.ptip{position:absolute;top:4px;z-index:5;background:#0b1622f2;border:1px solid #2a4560;border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 0 12px #000a}.ptip i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.ov-pp svg{touch-action:pan-y}</style><div class="sc"><img src="${SCENE}" alt="Dom, PV, bateria i sieć">
    ${flowSvg("0 -2.4 1672 367", FLOW, lines(pv, bp, grid), [13, 9, 3.5], "flov")}
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
      ${man ? `<div class="ov-mut" style="margin-top:8px">W toku: ${esc(man.typ)} ${fmt(man.zrobione_kwh, 2)} / ${fmt(man.kwh, 2, "kWh")}${man.zl != null ? ` · ${fmt(man.zl, 2, "zł")}` : ""}${man.ostrzezenie ? `<div style="color:#ffad2e;margin-top:4px">⚠ ${esc(man.ostrzezenie)}</div>` : ""} <button class="btn" data-svc="button.press" data-ent="button.ems_przerwij_reczne">Przerwij</button></div>` : ""}
      <div class="ov-mut" style="margin-top:8px">Dziś: <span style="color:${MC.kup}">kupione ${fmt(mt.kup.kwh, 2, "kWh")} za ${fmt(mt.kup.zl, 2, "zł")}</span> · <span style="color:${MC.sprzedaj}">sprzedane ${fmt(mt.sprzedaj.kwh, 2, "kWh")} za ${fmt(mt.sprzedaj.zl, 2, "zł")}</span></div>${recent()}</div>
    <div class="ov-box"><div class="ov-h">${ic("settings", 20)} Szybkie akcje</div><div class="ctrl" style="margin-top:8px">
      <button class="btn" data-svc="button.press" data-ent="button.ems_przelicz">${ic("refresh", 16)} Przelicz plan</button><button class="btn" data-odczyt>${ic("download", 16)} Odczytaj falownik</button>
      <button class="btn" data-svc="button.press" data-ent="${c.rid(`button.${c.dev}_ustaw_czas_z_ha`, "Ustaw czas z HA")}">${ic("clock", 16)} Ustaw czas</button></div>
      <div class="ov-mut" style="margin-top:8px">${ic("download", 14)} ${esc(S(h, c.rid(c.e("ostatni_odczyt_ustawien"), "Ostatni odczyt ustawien"))?.state || "–")} · ${ic("upload", 14)} ${esc(S(h, c.rid(c.e("ostatni_zapis"), "Ostatni zapis"))?.state || "–")}</div></div></div>`;
  const row = (a, b, cl = "") => `<div class="ov-row"><span>${a}</span><b ${cl ? `style="color:${cl}"` : ""}>${b}</b></div>`;
  const barr = (lab, p, col) => `<div class="ov-ac"><span>${lab}</span><div class="ov-bar"><i style="width:${p}%;background:${col}"></i></div><b>${p} %</b></div>`;
  const mid = `<div class="ov-mid">
    <div class="ov-box"><div class="ov-h">${ic("stack", 20)} Energia dziś</div>${row("Import z sieci", fmt(imp, 1, "kWh"), "#ff6b6b")}${row("Eksport do sieci", fmt(exp, 1, "kWh"), "#3ee07a")}${row("Bateria ład. / rozł.", `${fmt(bl, 1)} / ${fmt(br, 1, "kWh")}`)}${row("Produkcja PV", fmt(pvd, 1, "kWh"), "#facc15")}${row("Ręcznie kupione", `${fmt(mt.kup.kwh, 2, "kWh")} · ${fmt(mt.kup.zl, 2, "zł")}`, MC.kup)}${row("Ręcznie sprzedane", `${fmt(mt.sprzedaj.kwh, 2, "kWh")} · ${fmt(mt.sprzedaj.zl, 2, "zł")}`, MC.sprzedaj)}</div>
    <div class="ov-box"><div class="ov-h">${ic("chart", 20)} Profil mocy <span class="ov-mut">(dziś)</span></div>${profile()}</div>
    <div class="ov-box"><div class="ov-h">${ic("gauge", 20)} Autokonsumpcja${tip(T.autokons)}</div>${barr("PV → dom", pc(pvH), "#3ee07a")}${barr("PV → bateria", pc(pvB), "#3ee07a")}${barr("PV → sieć", pc(pvG), "#3ee07a")}</div></div>`;
  const bot = `<div class="ov-bot">
    <div class="ov-box"><div class="ov-h">${ic("tower", 20)} Sieć (3F, ${fmt(v("siec_czestotliwosc"), 1, "Hz")})</div>${L3.map(l => row(l.toUpperCase(), `${fmt(v("siec_napiecie_" + l), 1, "V")} · ${kw(v("siec_moc_" + l))}`)).join("")}</div>
    <div class="ov-box"><div class="ov-h">${ic("cpu", 20)} Przetwornica</div>${L3.map(l => row(l.toUpperCase(), `${fmt(v("przetwornica_napiecie_" + l), 1, "V")} · ${kw(v("przetwornica_moc_" + l))}`)).join("")}${row("Temp. radiatora", `${fmt(v("temperatura_przetwornicy"), 1)} °C / ${fmt(v("temperatura_radiatora"), 1, "°C")}`)}</div>
    <div class="ov-box"><div class="ov-h">${ic("panel", 20)} PV (stringi)</div>${[1, 2, 3, 4].map(i => row("PV" + i, kw(v("pv" + i + "_moc")))).join("")}</div></div>`;
  return `${S(h, c.e("bateria_soc")) ? "" : `<div class="box err">Brak danych z dataloggera <b>${c.dev}</b>. Sprawdź, czy ESPHome jest online.</div>`}${scene}${tiles}${ster}${mid}${bot}${modal()}`;
}
export function bind(c, r) {
  bindManual(c, r);
  r.querySelectorAll("[data-prof]").forEach(box => {
    const svg = box.querySelector("svg"), at = ev => { const p = ev.touches ? ev.touches[0] : ev, b = svg.getBoundingClientRect(), x = (p.clientX - b.left) / b.width * PW;
      return Math.floor((x - PL) / (PW - PL - 4) * 1440); };
    const mv = ev => { hist.hover = at(ev); c._hold = true; profTip(box, hist.hover); };
    svg.addEventListener("mousemove", mv); svg.addEventListener("touchstart", mv, { passive: true }); svg.addEventListener("touchmove", mv, { passive: true });
    svg.addEventListener("mouseleave", () => { hist.hover = null; c._hold = false; profTip(box, null); });
    svg.addEventListener("touchend", () => { c._hold = false; });   // na telefonie dymek zostaje po puszczeniu palca
    if (hist.hover != null) profTip(box, hist.hover);
  });
  r.querySelectorAll("[data-odczyt]").forEach(b => b.onclick = () => c.odczyt([c.rid(c.e("ostatni_odczyt_ustawien"), "Ostatni odczyt ustawien")]));
}
