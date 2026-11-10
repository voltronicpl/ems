import { S, num, fmt, tip, chart, pwChart, setSocMin, PINK, CYAN, g12Price, hm, esc } from "../core.js";
import { T } from "../tips.js";
import { loadManual, bands as mBands, MC, line as mLine } from "../manual.js";
import { range, nowWindow, dayWindow, stats, weekWindow, monthWindow } from "../minute.js";
import { slots } from "../forecast.js";
import { tou } from "../tou.js";
import { accuracyModal, bindProfile } from "../profile.js";
export const title = "Plan";
const NAME = { charge: "Ładowanie z sieci", sell: "Sprzedaż", self: "Autokonsumpcja", block: "Blokada eksportu" };
const COL = { charge: "#3d8dff", sell: "#1fe090", self: "#4a6378", block: "#ff4757" };
const st = { sel: null, mode: "fwd", day: null, d0: null, d1: null, data: null, fakt: null, loading: false, first: null, err: null };
const iso = d => d.toLocaleDateString("sv-SE");
const MB = () => mBands(0, 9e15).map(b => ({ a: b.a, b: b.b, c: MC[b.typ], txt: b.txt }));
const DOT = c => `<i class="d" style="background:${c}"></i>`;
const tipRow = r => `<div class="tt2">${r.t.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
  <div><span>${DOT(CYAN)}Cena sprzedaży (RCE)</span><b>${fmt(r.price, 2, "zł/kWh")}</b></div>
  <div><span>${DOT(PINK)}Cena kupna (G12)</span><b>${fmt(g12Price(r.t), 2, "zł/kWh")}</b></div>
  <div><span>${DOT("#3d8dff")}Ładowanie z sieci</span><b>${fmt((r.ch || 0) * 4, 1, "kW")}</b></div>
  <div><span>${DOT("#1fe090")}Sprzedaż do sieci</span><b>${fmt((r.sl || 0) * 4, 1, "kW")}</b></div>
  <div><span>${DOT("#ffad2e")}PV / dom</span><b>${fmt((r.pv || 0) * 4, 2)} / ${fmt((r.loadp ?? r.load ?? 0) * 4, 2, "kW")}</b></div>
  ${r.soc != null ? `<div><span>${DOT("#a78bfa")}SOC baterii</span><b>${fmt(r.soc, 0, "%")}</b></div>` : ""}
  ${r.pv_m != null ? `<div style="border-top:1px solid #1d3a55;margin-top:5px;padding-top:4px;color:#9bb3c6">Pomiar (ta minuta)</div>
  <div><span>${DOT("#ffe066")}PV / dom</span><b>${fmt(r.pv_m, 2)} / ${fmt(r.dom_m, 2, "kW")}</b></div>
  <div><span>${DOT("#7CFC4A")}Bateria</span><b>${r.bat_m == null ? "–" : `${fmt(Math.abs(r.bat_m), 2, "kW")} ${r.bat_m > 0.02 ? "ładowanie" : r.bat_m < -0.02 ? "rozładowanie" : ""}`}</b></div>
  <div><span>${DOT("#ff6b8a")}Sieć</span><b>${r.grid_m == null ? "–" : `${fmt(Math.abs(r.grid_m), 2, "kW")} ${r.grid_m > 0.02 ? "pobór" : r.grid_m < -0.02 ? "oddawanie" : ""}`}</b></div>` : ""}
  ${mBands(r.t.getTime(), r.t.getTime() + 6e4).map(b => `<div style="display:block;color:${MC[b.typ]};white-space:normal">${mLine(b.r)}</div>`).join("")}
  ${r.why ? `<div style="display:block;margin-top:6px;color:#9bb3c6;max-width:300px;white-space:normal">${esc(r.why)}</div>` : ""}`;

async function api(c, q) { return c.hass.callApi("GET", "ems/backtest" + q); }
async function loadFwd(c) {
  if (st.fakt && Date.now() - st.faktAt < 300000) return;
  try { const r = await api(c, `?start=${iso(new Date())}`); st.fakt = r.szczegoly?.fakt || []; st.faktAt = Date.now(); c.render(true); } catch (e) { st.fakt = []; }
}
async function loadBack(c) {
  st.loading = true; st.err = null; c.render(true);
  try { st.data = await api(c, `?start=${st.d0}&end=${st.d1}`); } catch (e) { st.err = e.message || String(e); st.data = null; }
  st.loading = false; c.render(true);
}

// Okienka Kup / Sprzedaj teraz (te same co w Przegladzie)
function manual(c, a) {
  const man = a.reczne;
  return `<div class="box"><div class="h"><span>🛒 Ręcznie teraz${tip(T.kup)}</span>${man ? `<span class="pill b">${man.typ}: ${fmt(man.zrobione_kwh, 2)} / ${fmt(man.kwh, 2, "kWh")}</span>` : ""}</div>${man?.ostrzezenie ? `<div class="box err" style="margin:0 0 8px">⚠ ${esc(man.ostrzezenie)}</div>` : ""}<div class="ctrl">
    <div class="ms"><div><label class="f">Kup energię teraz${tip(T.kup)}</label><div class="inp wbuy">${c.input("number.ems_kup_wh")}<span>Wh</span></div></div>
    <button class="btn pri" data-svc="button.press" data-ent="button.ems_kup_teraz">Kup</button></div>
    <div class="ms"><div><label class="f">Sprzedaj teraz${tip(T.sprzedaj)}</label><div class="inp wbuy">${c.input("number.ems_sprzedaj_wh")}<span>Wh</span></div></div>
    <button class="btn pri" data-svc="button.press" data-ent="button.ems_sprzedaj_teraz">Sprzedaj</button></div>
    ${man ? `<button class="btn" data-svc="button.press" data-ent="button.ems_przerwij_reczne">Przerwij</button>` : ""}</div></div>`;
}

function fwd(c) {
  const p = S(c.hass, "sensor.ems_plan"); if (!p) return `<div class="box">Brak sensora planu.</div>`;
  loadFwd(c); loadManual(c);
  const a = p.attributes, s = a.podsumowanie || {}, sez = c.zone.summer ? "lato" : "zima";
  const rows = (a.plan || []).map(x => ({ ...x, t: new Date(x.start), ch: x.action === "charge" ? x.grid_kwh : 0, sl: x.action === "sell" ? x.grid_kwh : 0, loadp: x.load }));
  // okno: "Teraz" = teraz ±12 h (teraz na srodku), dzien = 00–24 (co 1 min), tydzien (co 15 min), miesiac (co 1 h).
  // Przeszlosc = pomiar (linia ciagla) + prognoza, jaka EMS wtedy mial (przerywana); przyszlosc = plan.
  const w = st.sel === "week" ? weekWindow() : st.sel === "month" ? monthWindow() : st.sel ? dayWindow(new Date(st.sel + "T00:00")) : nowWindow(12), now = Date.now();
  const step = st.sel === "week" ? 15 : st.sel === "month" ? 60 : 1, sm = slots(c, w.t0, w.t1), mrows = [];
  const meas = step === 1 ? range(c, w.t0, w.t1) : null, mst = step > 1 ? stats(c, w.t0, w.t1, step === 15 ? "5minute" : "hour") : null;
  const avg = (arr, k) => { const v = arr.map(o => o && o[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const nowSlot = Math.floor(now / 9e5) * 9e5;
  for (let t = w.t0, i = 0; t < w.t1; t += step * 6e4, i++) {
    const ss = []; for (let q = Math.floor(t / 9e5) * 9e5; q < t + step * 6e4; q += 9e5) ss.push(sm.get(q));
    const x = step === 1 ? (ss[0] || {}) : { pv: avg(ss, "pv"), load: avg(ss, "load"), soc: avg(ss, "soc"), price: avg(ss, "price"), grid_kwh: avg(ss, "grid_kwh"), action: (ss.find(o => o && o.action !== "self") || ss[0] || {}).action, why: null };
    let m = null;
    if (t < now) { if (step === 1) m = meas[i]; else { const pts = []; for (let q = t; q < t + step * 6e4; q += 3e5) pts.push(mst.get(q)); m = { pv: avg(pts, "pv"), dom: avg(pts, "dom"), bat: avg(pts, "bat"), grid: avg(pts, "grid"), soc: avg(pts, "soc") }; } }
    const fut = t >= nowSlot;
    mrows.push({ ...x, t: new Date(t), loadp: x.load, ch: fut && x.action === "charge" ? x.grid_kwh : 0, sl: fut && x.action === "sell" ? x.grid_kwh : 0,
      pv_m: m?.pv ?? null, dom_m: m?.dom ?? null, bat_m: m?.bat == null ? null : -m.bat, grid_m: m?.grid ?? null,
      soc_m: m ? (m.soc ?? null) : null, soc_p: x.soc ?? null, soc: m ? (m.soc ?? null) : (x.soc ?? null), grid_p: x.imp != null ? (x.imp || 0) - (x.exp || 0) : null });
  }
  const thr = [["prog_tania", "#facc15", "tania"], ["prog_droga", "#ff4757", "droga"], ["prog_bezcen", "#cbd5e1", "za bezcen"]].map(([k, col, nm]) => ({ v: num(c.hass, `number.ems_${k}_${sez}`, 0), c: col, name: `${nm} ${fmt(num(c.hass, `number.ems_${k}_${sez}`), 2)}` }));
  setSocMin(num(c.hass, "number.ems_soc_min", null));
  const main = pwChart({ key: "fwd", rows: mrows, h: 420, order: "msp", tipf: tipRow, hlines: thr, bands: MB(),
    prices: [{ k: "price", c: CYAN, name: "Cena sprzedaży (RCE)", act: r => r.sl > 0 }, { f: r => g12Price(r.t), c: PINK, name: "Cena kupna (G12)", act: r => r.ch > 0 }],
    socs: [{ k: "soc_m", c: "#a78bfa", name: "SOC (pomiar)", fill: true }, { k: "soc_p", c: "#a78bfa", name: "SOC (prognoza)", dash: "6 5", w: 2 }],
    areas: [{ k: "ch", c: "#3d8dff", name: "Ładowanie z sieci" }, { k: "sl", sign: -1, c: "#1fe090", name: "Sprzedaż" }],
    lines: [{ k: "dom_m", raw: true, c: "#1e9bff", name: "Dom (pomiar)", w: 2.2, fill: true }, { k: "loadp", c: "#1e9bff", name: "Dom (prognoza)", nofill: true, dash: "6 5" },
      { k: "pv_m", raw: true, c: "#facc15", name: "PV (pomiar)", w: 2, fill: true }, { k: "pv", c: "#facc15", name: "PV (prognoza)", dash: "6 5", nofill: true },
      { k: "grid_m", raw: true, c: "#ff4d5e", name: "Sieć (pomiar, + pobór)", w: 1.8 }, { k: "grid_p", c: "#ff4d5e", name: "Sieć (prognoza, + pobór)", dash: "6 5", nofill: true },
      { k: "bat_m", raw: true, c: "#22e07a", name: "Bateria (pomiar, + ładowanie)", w: 1.4 }] });
  const fk = (st.fakt || []).map(f => ({ t: new Date(f.start), pva: f.pv / 1000, loada: f.load != null ? f.load / 1000 : null }));
  const hourly = (key, fkey) => { const m = {}; rows.forEach(r => { const k = new Date(r.t).setMinutes(0, 0, 0); m[k] = (m[k] || 0) + r[key]; }); const ks = Object.keys(m).map(Number).sort(); fk.forEach(f => { const k = f.t.getTime(); if (!(k in m)) { m[k] = null; ks.push(k); } }); return [...new Set(ks)].sort().map(k => ({ t: new Date(k), [key]: m[k], [fkey]: fk.find(f => f.t.getTime() === k)?.[fkey] ?? null })); };
  const pvc = chart({ key: "pv", rows: hourly("pv", "pva"), bars: [{ k: "pv", c: "#ffaa22", name: "Prognoza PV" }], lines: [{ k: "pva", c: "#fff", name: "Faktyczna produkcja" }], unit: "kWh/h", h: 200, tipf: r => `<div class="tt2">${hm(r.t)}</div><div><span>Prognoza</span><b>${fmt(r.pv, 2, "kWh")}</b></div><div><span>Fakt</span><b>${fmt(r.pva, 2, "kWh")}</b></div>` });
  const ldc = chart({ key: "dom", rows: hourly("loadp", "loada"), bars: [{ k: "loadp", c: "#3d8dff", name: "Prognoza zużycia" }], lines: [{ k: "loada", c: "#fff", name: "Faktyczne zużycie" }], unit: "kWh/h", h: 200, tipf: r => `<div class="tt2">${hm(r.t)}</div><div><span>Prognoza</span><b>${fmt(r.loadp, 2, "kWh")}</b></div><div><span>Fakt</span><b>${fmt(r.loada, 2, "kWh")}</b></div>` });
  const acts = []; rows.forEach(r => { if (r.action === "self") return; const l = acts[acts.length - 1]; if (l && l.action === r.action && l.end === r.t.getTime()) { l.kwh += r.grid_kwh; l.end += 9e5; l.pr.push(r.price); } else acts.push({ action: r.action, start: r.t, end: r.t.getTime() + 9e5, kwh: r.grid_kwh, pr: [r.price], why: r.why }); });
  const tile = (ic, cls, lab, val, sub) => `<div class="tile"><div class="ic ${cls}">${ic}</div><div><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div></div>`;
  return `${a.blad ? `<div class="box err">Błąd planu: ${esc(a.blad)}</div>` : ""}
  <div class="box"><div class="h"><span>📅 ${st.sel === "week" ? "Bieżący tydzień" : st.sel === "month" ? "Bieżący miesiąc" : st.sel ? new Date(st.sel + "T00:00").toLocaleDateString("pl-PL", { weekday: "long", day: "2-digit", month: "2-digit" }) : "Teraz ±12 h"} <span class="lab" style="font-size:inherit">(${step === 1 ? "co 1 min" : step === 15 ? "co 15 min" : "co 1 h"}; pomiar linią ciągłą, prognoza przerywaną)</span>${tip(T.wykres)}</span><span style="display:flex;gap:8px;align-items:center"><button class="btn" data-pfopen style="font-size:12px;padding:4px 10px">Prognoza vs rzeczywistość ↗</button><span class="pill b">🗼 taryfa: G12</span></span></div>${main}</div>
  ${st.sel ? "" : `${manual(c, a)}
  <div class="tiles">${tile("🔵", "ic-b", "Ładowanie z sieci", fmt(s.ladowanie_kwh, 1, "kWh"), `pobór razem ${fmt(s.import_kwh, 1, "kWh")}`)}${tile("💰", "ic-g", "Sprzedaż", fmt(s.sprzedaz_kwh, 1, "kWh"), `~${fmt(s.przychod_zl, 2, "zł")}`)}
    ${tile("☀", "ic-o", "Prognoza PV", fmt(s.pv_kwh, 1, "kWh"), `korekta dnia ×${fmt(s.korekta_pv, 2)}`)}${tile("🏠", "ic-b", "Prognoza zużycia", fmt(s.zuzycie_kwh, 1, "kWh"), `wsp. temp. ${fmt(s.wsp_temp, 2)} kWh/°C`)}${tile("⚡", s.burza ? "ic-r" : "ic-g", "Burza", s.burza ? "TAK" : "nie", s.burza ? `zapas ${num(c.hass, "number.ems_soc_burza", 50)}%` : "brak w prognozie")}</div>
  <div class="box" style="margin-top:14px"><div class="h"><span>📋 Zaplanowane akcje</span></div><div style="overflow:auto"><table class="tbl rt"><tr><th>Od–do</th><th>Co</th><th class="r">Ile</th><th class="r">Śr. cena</th><th>Dlaczego</th></tr>
    ${acts.slice(0, 30).map(x => `<tr><td class="hd">${x.start.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}–${hm(x.end)}</td><td data-l="Co"><b style="color:${COL[x.action]}">${NAME[x.action]}</b></td><td class="r" data-l="Ile">${fmt(x.kwh, 2, "kWh")}</td><td class="r" data-l="Śr. cena">${fmt(x.pr.filter(v => v != null).reduce((a, b) => a + b, 0) / Math.max(1, x.pr.filter(v => v != null).length), 2, "zł")}</td><td class="lab wide" data-l="Dlaczego">${esc(x.why)}</td></tr>`).join("") || `<tr><td colspan="5" class="lab">Tylko autokonsumpcja.</td></tr>`}</table></div></div>
  <div class="g2"><div class="box"><div class="h"><span>☀ Prognoza PV${tip(T.pvwyk)}</span><b class="t-o">${fmt(s.pv_kwh, 1, "kWh")}</b></div>${pvc}</div>
    <div class="box"><div class="h"><span>🏠 Prognoza zużycia domu${tip(T.domwyk)}</span><b class="t-b">${fmt(s.zuzycie_kwh, 1, "kWh")}</b></div>${ldc}</div></div>`}`;
}

function money(m, cls = "") { return m ? `<td class="r">${fmt(m.kup_tanio_kwh, 1)} / ${fmt(m.kup_drogo_kwh, 1)}</td><td class="r t-r">${fmt(m.koszt_zl, 2)}</td><td class="r">${fmt(m.sprzedaz_kwh, 1)}</td><td class="r t-g">${fmt(m.przychod_zl, 2)}</td><td class="r" title="SOC ${fmt(m.soc_start, 0)}% → ${fmt(m.soc_koniec, 0)}%"><span class="lab">${fmt(m.soc_start, 0)}→${fmt(m.soc_koniec, 0)}%</span> ${m.bateria_zl >= 0 ? "+" : ""}${fmt(m.bateria_zl, 2)}</td><td class="r"><b class="${cls}">${fmt(m.bilans_zl, 2, "zł")}</b></td>` : ""; }
function back(c) {
  loadManual(c);
  if (!st.first) { st.first = "…"; api(c, "").then(r => { st.first = r.pierwszy_dzien || "brak"; c.render(true); }).catch(() => { st.first = "brak"; }); }
  if (!st.d0) { const y = new Date(Date.now() - 864e5); st.d0 = st.d1 = iso(y); }
  const d = st.data, tot = d?.razem, single = st.d0 === st.d1;
  let det = "";
  if (d && single && d.szczegoly) {
    const sim = d.szczegoly.sim.map(x => ({ ...x, t: new Date(x.start), ch: x.action === "charge" ? x.grid_kwh : 0, sl: x.action === "sell" ? x.grid_kwh : 0, loadp: x.load }));
    const fk = Object.fromEntries(d.szczegoly.fakt.map(f => [new Date(f.start).getTime(), f]));
    sim.forEach(r => { const f = fk[new Date(r.t).setMinutes(0, 0, 0)]; r.soc_f = f?.soc ?? null; r.imp_f = f ? f.imp / 4 : 0; r.exp_f = f ? f.exp / 4 : 0; });
    const tipB = r => tipRow(r) + `<div style="border-top:1px solid #1d3a55;margin-top:5px;padding-top:4px"><span>Stary: pobór / oddanie</span><b>${fmt(r.imp_f, 2)} / ${fmt(r.exp_f, 2, "kWh")}</b></div><div><span>SOC stary</span><b>${fmt(r.soc_f, 0, "%")}</b></div>`;
    det = `<div class="box"><div class="h"><span>📈 ${st.d0}: nasz EMS (symulacja) vs stary (fakt)</span></div>${pwChart({ key: "back", rows: sim, now: false, h: 560, tipf: tipB, bands: MB(),
      prices: [{ k: "price", c: CYAN, name: "Cena sprzedaży (RCE)", act: r => r.sl > 0 }, { f: r => g12Price(r.t), c: PINK, name: "Cena kupna (G12)", act: r => r.ch > 0 }],
      socs: [{ k: "soc", c: "#a78bfa", name: "SOC nasz", fill: true }, { k: "soc_f", c: "#ffffff", name: "SOC stary (fakt)", w: 2 }],
      areas: [{ k: "ch", c: "#3d8dff", name: "Ładowanie (nasz)" }, { k: "sl", sign: -1, c: "#1fe090", name: "Sprzedaż (nasz)" }],
      lines: [{ f: r => r.imp_f - r.exp_f, c: "#ffad2e", name: "Sieć stary (pobór − oddanie)", nofill: true }] })}
      <div class="note">Trzy pasy: ceny, moc i SOC na wspólnej osi czasu. Gruba neonowa linia = wtedy nasz EMS kupuje (róż) albo sprzedaje (turkus). Kliknij pigułkę, żeby ukryć serię. Stary EMS: godzinowe liczniki rozłożone na 15 min.</div></div>`;
  }
  const months = {}; (d?.dni || []).forEach(x => { const m = x.dzien.slice(0, 7); months[m] = months[m] || { s: 0, n: 0, r: 0, d: 0 }; months[m].s += x.stary.bilans_zl; months[m].n += x.nowy.bilans_zl; months[m].r += x.roznica_zl; months[m].d++; });
  return `<div class="box"><div class="h"><span>⏪ Symulacja wstecz – nasz EMS vs poprzedni${tip(T.wstecz)}</span><span class="lab">dane od: ${st.first || "…"}</span></div>
    <div class="ctrl"><button class="btn" data-shift="-1">◀</button><div class="date">od <input type="date" data-d0 value="${st.d0}"></div><div class="date">do <input type="date" data-d1 value="${st.d1}"></div><button class="btn" data-shift="1">▶</button>
      <button class="btn" data-range="1">Wczoraj</button><button class="btn" data-range="7">7 dni</button><button class="btn" data-range="30">30 dni</button><button class="btn" data-range="all">Cała historia</button>
      <button class="btn pri" data-run>${st.loading ? "Liczę…" : "Policz"}</button></div>
    ${st.err ? `<div class="box err" style="margin-top:10px">${esc(st.err)}</div>` : ""}</div>
  ${tot ? `<div class="tiles"><div class="tile"><div class="ic ic-b">🕰</div><div><div class="lab">Stary EMS – bilans</div><div class="val ${tot.stary.bilans_zl >= 0 ? "t-g" : "t-r"}">${fmt(tot.stary.bilans_zl, 2, "zł")}</div><div class="sub">kupno ${fmt(tot.stary.koszt_zl, 2, "zł")} · sprzedaż ${fmt(tot.stary.przychod_zl, 2, "zł")} · bateria ${tot.stary.bateria_zl >= 0 ? "+" : ""}${fmt(tot.stary.bateria_zl, 2, "zł")}</div></div></div>
    <div class="tile"><div class="ic ic-v">🤖</div><div><div class="lab">Nasz EMS – bilans</div><div class="val ${tot.nowy.bilans_zl >= 0 ? "t-g" : "t-r"}">${fmt(tot.nowy.bilans_zl, 2, "zł")}</div><div class="sub">kupno ${fmt(tot.nowy.koszt_zl, 2, "zł")} · sprzedaż ${fmt(tot.nowy.przychod_zl, 2, "zł")} · bateria ${tot.nowy.bateria_zl >= 0 ? "+" : ""}${fmt(tot.nowy.bateria_zl, 2, "zł")}</div></div></div>
    <div class="tile"><div class="ic ${tot.roznica_zl >= 0 ? "ic-g" : "ic-r"}">${tot.roznica_zl >= 0 ? "▲" : "▼"}</div><div><div class="lab">Różnica (nasz − stary)</div><div class="val ${tot.roznica_zl >= 0 ? "t-g" : "t-r"}">${tot.roznica_zl >= 0 ? "+" : ""}${fmt(tot.roznica_zl, 2, "zł")}</div><div class="sub">${tot.dni} dni z danymi</div></div></div></div>` : ""}
  ${det}
  ${d && !single ? `<div class="box"><div class="h"><span>🗓 Miesiące</span></div><table class="tbl rt"><tr><th>Miesiąc</th><th class="r">Dni</th><th class="r">Stary</th><th class="r">Nasz</th><th class="r">Różnica</th></tr>${Object.entries(months).map(([m, x]) => `<tr><td class="hd">${m}</td><td class="r" data-l="Dni">${x.d}</td><td class="r" data-l="Stary">${fmt(x.s, 2, "zł")}</td><td class="r" data-l="Nasz">${fmt(x.n, 2, "zł")}</td><td class="r" data-l="Różnica"><b class="${x.r >= 0 ? "t-g" : "t-r"}">${x.r >= 0 ? "+" : ""}${fmt(x.r, 2, "zł")}</b></td></tr>`).join("")}</table></div>` : ""}
  ${d ? `<div class="box"><div class="h"><span>📋 Dzień po dniu</span></div><div class="scroll-hint">↔ tabela szeroka – przesuń palcem w bok</div><div style="overflow:auto"><table class="tbl"><tr><th>Dzień</th><th></th><th class="r">Kup tanio/drogo kWh</th><th class="r">Koszt zł</th><th class="r">Sprzedaż kWh</th><th class="r">Przychód zł</th><th class="r">Bateria${tip(T.wstecz_bat)}</th><th class="r">Bilans</th><th class="r">Różnica</th></tr>
    ${d.dni.map(x => `<tr><td rowspan="2"><a href="#" data-day="${x.dzien}" style="color:#7fb3ff">${x.dzien}</a>${x.rce_brak ? ' <span class="pill r">brak RCE</span>' : ""}</td><td class="lab">stary</td>${money(x.stary)}<td class="r" rowspan="2"><b class="${x.roznica_zl >= 0 ? "t-g" : "t-r"}">${x.roznica_zl >= 0 ? "+" : ""}${fmt(x.roznica_zl, 2, "zł")}</b></td></tr><tr><td class="lab">nasz</td>${money(x.nowy, "t-b")}</tr>`).join("")}</table></div></div>` : ""}`;
}

// Kafelki pieniedzy dzis: do teraz (pomiar) i na koniec dnia (pomiar + plan). Bilansowanie godzinowe, zakup G12, sprzedaz RCE x depozyt.
// "Bez EMS" = dom z sieci po G12, PV zuzyte na biezaco, nadwyzka PV sprzedana (bez magazynu).
function moneyTiles(c) {
  const dw = dayWindow(new Date()), now = Date.now(), meas = range(c, dw.t0, dw.t1), sm = slots(c, dw.t0, dw.t1);
  const dep = num(c.hass, "number.ems_depozyt_mnoznik", 1.23), cap = num(c.hass, "number.ems_pojemnosc_wh", 15000) / 1000;
  const z = () => ({ kup: 0, kupZl: 0, spr: 0, sprZl: 0, kupB: 0, kupBZl: 0, sprB: 0, sprBZl: 0 }), A = z(), E = z();
  for (let h = 0; h < 24; h++) {
    const a = dw.t0 + h * 36e5, b = a + 36e5, ss = [0, 1, 2, 3].map(i => sm.get(a + i * 9e5));
    const pr = ss.map(x => x?.price).filter(v => v != null), rce = pr.length ? pr.reduce((x, y) => x + y, 0) / pr.length : 0, g12 = g12Price(new Date(a + 18e5));
    // pomiar (do teraz) + plan (reszta godziny / dnia)
    let imp = 0, exp = 0, dom = 0, pv = 0, impN = 0, expN = 0, domN = 0, pvN = 0;
    meas.forEach(r => { if (r.t < a || r.t >= b) return; const gr = r.grid || 0; imp += Math.max(gr, 0) / 60; exp += Math.max(-gr, 0) / 60; dom += (r.dom || 0) / 60; pv += (r.pv || 0) / 60; });
    impN = imp; expN = exp; domN = dom; pvN = pv;
    ss.forEach((x, i) => { const t = a + i * 9e5; if (!x || t + 9e5 <= now) return; const f = t < now ? (t + 9e5 - now) / 9e5 : 1;
      impN += (x.imp || 0) * f; expN += (x.exp || 0) * f; domN += (x.load || 0) * f; pvN += (x.pv || 0) * f; });
    const add = (o, i, e, d, p) => { const n = i - e, nb = d - p;
      if (n > 0) { o.kup += n; o.kupZl += n * g12; } else { o.spr -= n; o.sprZl += -n * Math.max(rce, 0) * dep; }
      if (nb > 0) { o.kupB += nb; o.kupBZl += nb * g12; } else { o.sprB -= nb; o.sprBZl += -nb * Math.max(rce, 0) * dep; } };
    if (a < now) add(A, imp, exp, dom, pv);
    add(E, impN, expN, domN, pvN);
  }
  const soc0 = meas.find(r => r.soc != null)?.soc, socN = [...meas].reverse().find(r => r.soc != null)?.soc;
  const lastSlot = [...sm.entries()].filter(([t, x]) => t < dw.t1 && x?.soc != null).sort((x, y) => x[0] - y[0]).pop()?.[1]?.soc;
  const batA = soc0 != null && socN != null ? (socN - soc0) / 100 * cap * 0.61 : 0, batE = soc0 != null && lastSlot != null ? (lastSlot - soc0) / 100 * cap * 0.61 : batA;
  const bil = (o, bat) => o.sprZl - o.kupZl + bat, bilB = o => o.sprBZl - o.kupBZl;
  const pvA = meas.reduce((q, r) => q + (r.pv || 0), 0) / 60;
  let pvE = pvA, chPlan = 0; for (const [tt, x] of sm) { if (!x || tt >= dw.t1 || tt + 9e5 <= now) continue; const f = tt < now ? (tt + 9e5 - now) / 9e5 : 1; pvE += (x.pv || 0) * f; if (x.action === "charge") chPlan += (x.grid_kwh || 0) * f; }
  const zA = bil(A, batA) - bilB(A), zE = bil(E, batE) - bilB(E), col = v => v >= 0 ? "t-g" : "t-r", sg = v => (v >= 0 ? "+" : "") + fmt(v, 2, "zł");
  const t = (icn, cls, lab, val, sub) => `<div class="tile"><div class="ic ${cls}">${icn}</div><div><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div></div>`;
  return `<div class="tiles" style="margin-bottom:14px">
    ${t("🔌", "ic-r", "Zakup prądu dziś", `<span class="t-r">${fmt(A.kupZl, 2, "zł")}</span>`, `${fmt(A.kup, 1, "kWh")} do teraz · koniec dnia ~${fmt(E.kupZl, 2, "zł")} (${fmt(E.kup, 1, "kWh")})<br>algorytm planuje dziś jeszcze dokupić do baterii <b>${fmt(chPlan, 1, "kWh")}</b>`)}
    ${t("💰", "ic-g", "Sprzedaż dziś", `<span class="t-g">${fmt(A.sprZl, 2, "zł")}</span>`, `${fmt(A.spr, 1, "kWh")} do teraz · koniec dnia ~${fmt(E.sprZl, 2, "zł")} (${fmt(E.spr, 1, "kWh")})`)}
    ${t("⚖", bil(A, batA) >= 0 ? "ic-g" : "ic-r", "Bilans dnia", `<span class="${col(bil(A, batA))}">${sg(bil(A, batA))}</span>`, `w tym bateria ${sg(batA)} · koniec dnia ~${sg(bil(E, batE))}`)}
    ${t("⚡", "ic-b", "Bilans energii dziś (kWh)", `PV ${fmt(pvA, 1)} <span class="lab">/ ~${fmt(pvE, 1)}</span>`, `zakup ${fmt(A.kup, 1)} / ~${fmt(E.kup, 1)} · sprzedaż ${fmt(A.spr, 1)} / ~${fmt(E.spr, 1)} kWh<br><span class="lab">do teraz / prognoza na koniec dnia</span>`)}
    ${t("🤖", zA >= 0 ? "ic-g" : "ic-r", "Zysk dzięki EMS dziś", `<span class="${col(zA)}">${sg(zA)}</span>`, `vs dom bez magazynu na G12 (${sg(bilB(A))}) · koniec dnia ~${sg(zE)}`)}</div>`;
}

export function render(c) {
  const a = S(c.hass, "sensor.ems_plan")?.attributes || {}, hz = a.podsumowanie?.horyzont_do;
  if ((c.tabAt || 0) > (st.seen || 0)) st.sel = null;     // wejscie w zakladke -> zawsze "Teraz"
  st.seen = Date.now();
  const days = []; for (let i = -3; i <= 1; i++) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); days.push(d); }
  const bar = days.map((d, i) => { const id = iso(d), on = i === 3 ? !st.sel : st.sel === id, lab = i === 3 ? "Teraz" : `${d.toLocaleDateString("pl-PL", { weekday: "short" })} ${d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}${i === 4 ? " (jutro)" : ""}`;
    return `<button class="btn ${on ? "on" : ""}" data-pday="${i === 3 ? "" : id}">${lab}</button>`; }).join("")
    + `<label class="btn ${st.sel && /^\d/.test(st.sel) && !days.some(d => iso(d) === st.sel) ? "on" : ""}" style="position:relative">📅 ${st.sel && /^\d/.test(st.sel) && !days.some(d => iso(d) === st.sel) ? st.sel : "Kalendarz"}<input type="date" data-pcal max="${iso(days[4])}" value="${/^\d/.test(st.sel || "") ? st.sel : ""}" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>`
    + `<button class="btn ${st.sel === "week" ? "on" : ""}" data-pday="week">Tydzień</button><button class="btn ${st.sel === "month" ? "on" : ""}" data-pday="month">Miesiąc</button>`;
  return `<div class="ctrl" style="margin-bottom:14px;flex-wrap:nowrap"><div class="pday" data-pdays>${bar}</div><span class="ctrl" style="margin-left:auto;flex:none"><span class="lab">przeliczono ${a.przeliczono ? hm(a.przeliczono) : "–"} · do ${hz || "–"}</span><button class="btn" data-svc="button.press" data-ent="button.ems_przelicz">↻ Przelicz</button></span></div>
  <style>.pday{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;padding-bottom:4px;min-width:0;flex:1}.pday .btn{flex:none;white-space:nowrap}</style>`
    + moneyTiles(c) + fwd(c) + back(c) + tou(c) + accuracyModal(c);
}
export function bind(c, r) {
  bindProfile(c, r);
  r.querySelectorAll("[data-pday]").forEach(b => b.onclick = () => { st.sel = b.dataset.pday || null; c.render(true); });
  const cal = r.querySelector("[data-pcal]"); if (cal) cal.onchange = () => { if (cal.value) { st.sel = cal.value; c.render(true); } };
  const pd = r.querySelector("[data-pdays] .on"); if (pd && !st.scrolled) { pd.scrollIntoView({ inline: "center", block: "nearest" }); st.scrolled = true; }
  const d0 = r.querySelector("[data-d0]"), d1 = r.querySelector("[data-d1]");
  if (d0) d0.onchange = () => { st.d0 = d0.value; if (st.d1 < st.d0) st.d1 = st.d0; };
  if (d1) d1.onchange = () => { st.d1 = d1.value; };
  r.querySelectorAll("[data-shift]").forEach(b => b.onclick = () => { const k = +b.dataset.shift; const sh = s => iso(new Date(new Date(s).getTime() + k * 864e5)); st.d0 = sh(st.d0); st.d1 = sh(st.d1); loadBack(c); });
  r.querySelectorAll("[data-range]").forEach(b => b.onclick = () => { const y = new Date(Date.now() - 864e5); st.d1 = iso(y); st.d0 = b.dataset.range === "all" ? (st.first && st.first !== "brak" && st.first !== "…" ? st.first : iso(new Date(Date.now() - 365 * 864e5))) : iso(new Date(y.getTime() - (+b.dataset.range - 1) * 864e5)); loadBack(c); });
  r.querySelector("[data-run]")?.addEventListener("click", () => loadBack(c));
  r.querySelectorAll("[data-day]").forEach(a => a.onclick = e => { e.preventDefault(); st.d0 = st.d1 = a.dataset.day; loadBack(c); });
}
