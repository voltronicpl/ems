import { S, num, fmt, tip, chart, pwChart, PINK, CYAN, g12Price, hm, esc } from "../core.js";
import { T } from "../tips.js";
export const title = "Plan";
const NAME = { charge: "Ładowanie z sieci", sell: "Sprzedaż", self: "Autokonsumpcja", block: "Blokada eksportu" };
const COL = { charge: "#3d8dff", sell: "#1fe090", self: "#4a6378", block: "#ff4757" };
const st = { mode: "fwd", day: null, d0: null, d1: null, data: null, fakt: null, loading: false, first: null, err: null };
const iso = d => d.toLocaleDateString("sv-SE");
const tipRow = r => `<div class="tt2">${r.t.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
  ${r.action ? `<div><span>Akcja</span><b>${NAME[r.action] || r.action}</b></div>` : ""}${r.price != null ? `<div><span>RCE</span><b>${fmt(r.price, 2, "zł")}</b></div>` : ""}
  ${r.soc != null ? `<div><span>SOC</span><b>${fmt(r.soc, 0, "%")}</b></div>` : ""}<div><span>PV / dom</span><b>${fmt(r.pv, 2)} / ${fmt(r.loadp ?? r.load, 2, "kWh")}</b></div>
  ${r.imp != null ? `<div><span>Pobór / oddanie</span><b>${fmt(r.imp, 2)} / ${fmt(r.exp, 2, "kWh")}</b></div>` : ""}${r.why ? `<div style="display:block;margin-top:6px;color:#9bb3c6;max-width:280px;white-space:normal">${esc(r.why)}</div>` : ""}`;

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

function tou(c) {
  const d = c.dev, n = k => `number.${d}_${k}`, alg = S(c.hass, "switch.ems_algorytm")?.state === "on";
  const ids = []; for (let p = 1; p <= 6; p++) ids.push(n(`tou_${p}_start_hhmm`), n(`tou_${p}_moc`), n(`tou_${p}_soc`), n(`tou_${p}_autokonsumpcja_do`), n(`tou_${p}_sprzedaj_do`));
  const rows = [1, 2, 3, 4, 5, 6].map(p => `<tr><td data-l="Punkt ${p}">${c.sw(`switch.${d}_tou_${p}_ladowanie_z_sieci`, `Z sieci ${p}`, alg)}</td>
    <td data-l="Start">${c.field(n(`tou_${p}_start_hhmm`), "HHMM", { ro: alg })}</td><td data-l="Moc">${c.field(n(`tou_${p}_moc`), "W", { ro: alg })}</td><td data-l="SOC">${c.field(n(`tou_${p}_soc`), "%", { ro: alg })}</td>
    <td data-l="Autokons. do">${c.range(n(`tou_${p}_autokonsumpcja_do`), "", alg)}</td><td data-l="Sprzedaj do">${c.range(n(`tou_${p}_sprzedaj_do`), "", alg)}</td></tr>`).join("");
  return c.group(`🗓 Harmonogram w falowniku (TOU)${tip(T.tou)}`, `${alg ? `<div class="note" style="margin:0 0 8px">Ustawia EMS (algorytm włączony) – tylko do odczytu.</div>` : ""}
    <div style="overflow:auto"><table class="tbl rt"><tr><th>Ładowanie</th><th>Start</th><th>Moc</th><th>SOC</th><th>Autokonsumpcja do</th><th>Sprzedaj do</th></tr>${rows}</table></div>`, alg ? [] : ids);
}

function fwd(c) {
  const p = S(c.hass, "sensor.ems_plan"); if (!p) return `<div class="box">Brak sensora planu.</div>`;
  loadFwd(c);
  const a = p.attributes, s = a.podsumowanie || {}, sez = c.zone.summer ? "lato" : "zima";
  const rows = (a.plan || []).map(x => ({ ...x, t: new Date(x.start), ch: x.action === "charge" ? x.grid_kwh : 0, sl: x.action === "sell" ? x.grid_kwh : 0, loadp: x.load }));
  const thr = [["prog_tania", "#ffaa22", "tania"], ["prog_droga", "#ff4757", "droga"], ["prog_bezcen", "#9bb3c6", "za bezcen"]].map(([k, col, nm]) => ({ v: num(c.hass, `number.ems_${k}_${sez}`, 0), c: col, name: `${nm} ${fmt(num(c.hass, `number.ems_${k}_${sez}`), 2)}` }));
  const main = pwChart({ key: "fwd", rows, h: 420, tipf: tipRow, hlines: thr,
    prices: [{ k: "price", c: CYAN, name: "Cena sprzedaży (RCE)", act: r => r.sl > 0 }, { f: r => g12Price(r.t), c: PINK, name: "Cena kupna (G12)", act: r => r.ch > 0 }],
    socs: [{ k: "soc", c: "#a78bfa", name: "SOC (plan)", fill: true }],
    areas: [{ k: "ch", c: "#3d8dff", name: "Ładowanie z sieci" }, { k: "sl", sign: -1, c: "#1fe090", name: "Sprzedaż" }],
    lines: [{ k: "pv", c: "#ffad2e", name: "PV (prognoza)" }, { k: "loadp", c: "#ff4757", name: "Dom (prognoza)" }] });
  const fk = (st.fakt || []).map(f => ({ t: new Date(f.start), pva: f.pv / 1000, loada: f.load != null ? f.load / 1000 : null }));
  const hourly = (key, fkey) => { const m = {}; rows.forEach(r => { const k = new Date(r.t).setMinutes(0, 0, 0); m[k] = (m[k] || 0) + r[key]; }); const ks = Object.keys(m).map(Number).sort(); fk.forEach(f => { const k = f.t.getTime(); if (!(k in m)) { m[k] = null; ks.push(k); } }); return [...new Set(ks)].sort().map(k => ({ t: new Date(k), [key]: m[k], [fkey]: fk.find(f => f.t.getTime() === k)?.[fkey] ?? null })); };
  const pvc = chart({ key: "pv", rows: hourly("pv", "pva"), bars: [{ k: "pv", c: "#ffaa22", name: "Prognoza PV" }], lines: [{ k: "pva", c: "#fff", name: "Faktyczna produkcja" }], unit: "kWh/h", h: 200, tipf: r => `<div class="tt2">${hm(r.t)}</div><div><span>Prognoza</span><b>${fmt(r.pv, 2, "kWh")}</b></div><div><span>Fakt</span><b>${fmt(r.pva, 2, "kWh")}</b></div>` });
  const ldc = chart({ key: "dom", rows: hourly("loadp", "loada"), bars: [{ k: "loadp", c: "#3d8dff", name: "Prognoza zużycia" }], lines: [{ k: "loada", c: "#fff", name: "Faktyczne zużycie" }], unit: "kWh/h", h: 200, tipf: r => `<div class="tt2">${hm(r.t)}</div><div><span>Prognoza</span><b>${fmt(r.loadp, 2, "kWh")}</b></div><div><span>Fakt</span><b>${fmt(r.loada, 2, "kWh")}</b></div>` });
  const acts = []; rows.forEach(r => { if (r.action === "self") return; const l = acts[acts.length - 1]; if (l && l.action === r.action && l.end === r.t.getTime()) { l.kwh += r.grid_kwh; l.end += 9e5; l.pr.push(r.price); } else acts.push({ action: r.action, start: r.t, end: r.t.getTime() + 9e5, kwh: r.grid_kwh, pr: [r.price], why: r.why }); });
  const tile = (ic, cls, lab, val, sub) => `<div class="tile"><div class="ic ${cls}">${ic}</div><div><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div></div>`;
  return `${a.blad ? `<div class="box err">Błąd planu: ${esc(a.blad)}</div>` : ""}
  <div class="box"><div class="h"><span>📈 Plan dziś + jutro (15 min)${tip(T.wykres)}</span><span class="ctrl"><span class="lab">przeliczono ${a.przeliczono ? hm(a.przeliczono) : "–"} · do ${s.horyzont_do || "–"}</span><button class="btn" data-svc="button.press" data-ent="button.ems_przelicz">↻ Przelicz</button></span></div>${main}</div>
  <div class="tiles">${tile("🔵", "ic-b", "Ładowanie z sieci", fmt(s.ladowanie_kwh, 1, "kWh"), `pobór razem ${fmt(s.import_kwh, 1, "kWh")}`)}${tile("💰", "ic-g", "Sprzedaż", fmt(s.sprzedaz_kwh, 1, "kWh"), `~${fmt(s.przychod_zl, 2, "zł")}`)}
    ${tile("☀", "ic-o", "Prognoza PV", fmt(s.pv_kwh, 1, "kWh"), `korekta dnia ×${fmt(s.korekta_pv, 2)}`)}${tile("🏠", "ic-b", "Prognoza zużycia", fmt(s.zuzycie_kwh, 1, "kWh"), `wsp. temp. ${fmt(s.wsp_temp, 2)} kWh/°C`)}${tile("⚡", s.burza ? "ic-r" : "ic-g", "Burza", s.burza ? "TAK" : "nie", s.burza ? `zapas ${num(c.hass, "number.ems_soc_burza", 50)}%` : "brak w prognozie")}</div>
  <div class="box" style="margin-top:14px"><div class="h"><span>📋 Zaplanowane akcje</span></div><div style="overflow:auto"><table class="tbl rt"><tr><th>Od–do</th><th>Co</th><th class="r">Ile</th><th class="r">Śr. cena</th><th>Dlaczego</th></tr>
    ${acts.slice(0, 30).map(x => `<tr><td class="hd">${x.start.toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}–${hm(x.end)}</td><td data-l="Co"><b style="color:${COL[x.action]}">${NAME[x.action]}</b></td><td class="r" data-l="Ile">${fmt(x.kwh, 2, "kWh")}</td><td class="r" data-l="Śr. cena">${fmt(x.pr.filter(v => v != null).reduce((a, b) => a + b, 0) / Math.max(1, x.pr.filter(v => v != null).length), 2, "zł")}</td><td class="lab wide" data-l="Dlaczego">${esc(x.why)}</td></tr>`).join("") || `<tr><td colspan="5" class="lab">Tylko autokonsumpcja.</td></tr>`}</table></div></div>
  <div class="g2"><div class="box"><div class="h"><span>☀ Prognoza PV${tip(T.pvwyk)}</span><b class="t-o">${fmt(s.pv_kwh, 1, "kWh")}</b></div>${pvc}</div>
    <div class="box"><div class="h"><span>🏠 Prognoza zużycia domu${tip(T.domwyk)}</span><b class="t-b">${fmt(s.zuzycie_kwh, 1, "kWh")}</b></div>${ldc}</div></div>
  ${tou(c)}`;
}

function money(m, cls = "") { return m ? `<td class="r">${fmt(m.kup_tanio_kwh, 1)} / ${fmt(m.kup_drogo_kwh, 1)}</td><td class="r t-r">${fmt(m.koszt_zl, 2)}</td><td class="r">${fmt(m.sprzedaz_kwh, 1)}</td><td class="r t-g">${fmt(m.przychod_zl, 2)}</td><td class="r" title="SOC ${fmt(m.soc_start, 0)}% → ${fmt(m.soc_koniec, 0)}%"><span class="lab">${fmt(m.soc_start, 0)}→${fmt(m.soc_koniec, 0)}%</span> ${m.bateria_zl >= 0 ? "+" : ""}${fmt(m.bateria_zl, 2)}</td><td class="r"><b class="${cls}">${fmt(m.bilans_zl, 2, "zł")}</b></td>` : ""; }
function back(c) {
  if (!st.first) { st.first = "…"; api(c, "").then(r => { st.first = r.pierwszy_dzien || "brak"; c.render(true); }).catch(() => { st.first = "brak"; }); }
  if (!st.d0) { const y = new Date(Date.now() - 864e5); st.d0 = st.d1 = iso(y); }
  const d = st.data, tot = d?.razem, single = st.d0 === st.d1;
  let det = "";
  if (d && single && d.szczegoly) {
    const sim = d.szczegoly.sim.map(x => ({ ...x, t: new Date(x.start), ch: x.action === "charge" ? x.grid_kwh : 0, sl: x.action === "sell" ? x.grid_kwh : 0, loadp: x.load }));
    const fk = Object.fromEntries(d.szczegoly.fakt.map(f => [new Date(f.start).getTime(), f]));
    sim.forEach(r => { const f = fk[new Date(r.t).setMinutes(0, 0, 0)]; r.soc_f = f?.soc ?? null; r.imp_f = f ? f.imp / 4 : 0; r.exp_f = f ? f.exp / 4 : 0; });
    const tipB = r => tipRow(r) + `<div style="border-top:1px solid #1d3a55;margin-top:5px;padding-top:4px"><span>Stary: pobór / oddanie</span><b>${fmt(r.imp_f, 2)} / ${fmt(r.exp_f, 2, "kWh")}</b></div><div><span>SOC stary</span><b>${fmt(r.soc_f, 0, "%")}</b></div>`;
    det = `<div class="box"><div class="h"><span>📈 ${st.d0}: nasz EMS (symulacja) vs stary (fakt)</span></div>${pwChart({ key: "back", rows: sim, now: false, h: 420, tipf: tipB,
      prices: [{ k: "price", c: CYAN, name: "Cena sprzedaży (RCE)", act: r => r.sl > 0 }, { f: r => g12Price(r.t), c: PINK, name: "Cena kupna (G12)", act: r => r.ch > 0 }],
      socs: [{ k: "soc", c: "#a78bfa", name: "SOC nasz", fill: true }, { k: "soc_f", c: "#ffffff", name: "SOC stary (fakt)", w: 2 }],
      areas: [{ k: "ch", c: "#3d8dff", name: "Ładowanie (nasz)" }, { k: "sl", sign: -1, c: "#1fe090", name: "Sprzedaż (nasz)" }],
      lines: [{ f: r => r.imp_f - r.exp_f, c: "#ffad2e", name: "Sieć stary (pobór − oddanie)" }] })}
      <div class="note">Gruba neonowa linia = wtedy nasz EMS kupuje (róż) albo sprzedaje (turkus). Kliknij pigułkę, żeby ukryć serię. Stary EMS: godzinowe liczniki rozłożone na 15 min.</div></div>`;
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

export function render(c) {
  return `<div class="ctrl" style="margin-bottom:14px"><button class="btn ${st.mode === "fwd" ? "on" : ""}" data-mode="fwd">▶ Teraz + 24 h</button><button class="btn ${st.mode === "back" ? "on" : ""}" data-mode="back">⏪ Wstecz (historia)</button></div>` + (st.mode === "fwd" ? fwd(c) : back(c));
}
export function bind(c, r) {
  r.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { st.mode = b.dataset.mode; c.render(true); });
  const d0 = r.querySelector("[data-d0]"), d1 = r.querySelector("[data-d1]");
  if (d0) d0.onchange = () => { st.d0 = d0.value; if (st.d1 < st.d0) st.d1 = st.d0; };
  if (d1) d1.onchange = () => { st.d1 = d1.value; };
  r.querySelectorAll("[data-shift]").forEach(b => b.onclick = () => { const k = +b.dataset.shift; const sh = s => iso(new Date(new Date(s).getTime() + k * 864e5)); st.d0 = sh(st.d0); st.d1 = sh(st.d1); loadBack(c); });
  r.querySelectorAll("[data-range]").forEach(b => b.onclick = () => { const y = new Date(Date.now() - 864e5); st.d1 = iso(y); st.d0 = b.dataset.range === "all" ? (st.first && st.first !== "brak" && st.first !== "…" ? st.first : iso(new Date(Date.now() - 365 * 864e5))) : iso(new Date(y.getTime() - (+b.dataset.range - 1) * 864e5)); loadBack(c); });
  r.querySelector("[data-run]")?.addEventListener("click", () => loadBack(c));
  r.querySelectorAll("[data-day]").forEach(a => a.onclick = e => { e.preventDefault(); st.d0 = st.d1 = a.dataset.day; loadBack(c); });
}
