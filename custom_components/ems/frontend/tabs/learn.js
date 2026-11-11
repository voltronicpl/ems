// Zakladka Nauka: czy algorytm sie uczy (blad prognozy w czasie), wspolczynniki "bylo -> jest", dni podobne,
// pompa ciepla, urzadzenia, profil dobowy, kalibracja PV per miesiac. Dane: GET /api/ems/nauka?dzien=
import { fmt, esc, tip } from "../core.js";
export const title = "🧠 Nauka";

const st = { dc: "kal_pv", okres: "tydz", end: null, d: null, busy: false, at: 0, key: "", wsp: "kal_pv" };
const OKR = { dzien: ["Dzień", 1], tydz: ["Tydzień", 7], mies: ["Miesiąc", 30], rok: ["Rok", 365] };
const iso = d => d.toLocaleDateString("sv-SE"), today = () => iso(new Date());
const C = { dom: "#1e9bff", pv: "#facc15", grey: "#8fa6bd", red: "#ff4d5e", green: "#22e07a", vio: "#a78bfa", cyan: "#22d3ee", or: "#ff9f1a" };
const MIES = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const WD = ["pn", "wt", "śr", "cz", "pt", "so", "nd"];

function load(c) {
  const end = st.end || today(), key = end;
  if (st.busy || (st.key === key && Date.now() - st.at < 300000)) return;
  st.busy = true;
  c.hass.callApi("GET", `ems/nauka?dzien=${end}`).then(r => { st.d = r; st.key = key; }).catch(e => { st.d = { err: e.message || String(e) }; })
    .finally(() => { st.busy = false; st.at = Date.now(); c.render(true); });
}
const avg = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
const errPct = (f, p) => f != null && p != null && f > 0.3 ? Math.abs(f - p) / f * 100 : null;

// prosty wykres liniowy / slupkowy: xs = etykiety, ser = [{ v: [], c, name, dash, bar, w, axis: "r" }]
function chart(xs, ser, { h = 220, unit = "", unitR = "", zero = true, every } = {}) {
  const W = 900, L = 46, R = ser.some(s => s.axis === "r") ? 46 : 12, T = 12, B = 26, n = xs.length;
  if (!n) return `<div class="lab">Brak danych w tym okresie.</div>`;
  const rng = ax => { const v = ser.filter(s => (s.axis === "r") === ax).flatMap(s => s.v).filter(x => x != null); if (!v.length) return [0, 1]; let lo = Math.min(...v), hi = Math.max(...v); if (zero) lo = Math.min(lo, 0); if (hi - lo < 1e-6) hi = lo + 1; return [lo, hi + (hi - lo) * 0.08]; };
  const [l0, l1] = rng(false), [r0, r1] = rng(true);
  const X = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), Yl = v => T + (l1 - v) / (l1 - l0) * (h - T - B), Yr = v => T + (r1 - v) / (r1 - r0) * (h - T - B);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = l0 + (l1 - l0) * k / 4, y = Yl(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ffffff12"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="xl">${fmt(v, Math.abs(l1) < 3 ? 2 : 0)}${unit}</text>`;
    if (R > 12) { const vr = r0 + (r1 - r0) * k / 4; g += `<text x="${W - R + 6}" y="${y + 4}" class="xl">${fmt(vr, Math.abs(r1) < 3 ? 2 : 0)}${unitR}</text>`; } }
  const ev = every || Math.max(1, Math.ceil(n / 10));
  xs.forEach((x, i) => { if (i % ev === 0) g += `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" class="xl">${esc(x)}</text>`; });
  const bars = ser.filter(s => s.bar), bw = Math.max(2, (W - L - R) / Math.max(n, 1) * 0.8 / Math.max(bars.length, 1));
  bars.forEach((s, j) => s.v.forEach((v, i) => { if (v == null) return; const y = (s.axis === "r" ? Yr : Yl)(v), y0 = (s.axis === "r" ? Yr : Yl)(0); g += `<rect x="${X(i) - bw * bars.length / 2 + j * bw}" y="${Math.min(y, y0)}" width="${bw - 1}" height="${Math.abs(y0 - y)}" fill="${s.c}" opacity="${s.op || .85}" rx="1.5"/>`; }));
  ser.filter(s => !s.bar).forEach(s => { const Y = s.axis === "r" ? Yr : Yl; let d = "", on = false;
    s.v.forEach((v, i) => { if (v == null) { on = false; return; } d += `${on ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; on = true; });
    if (d) g += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} opacity="${s.op || 1}"/>`;
    if (n <= 40 && !s.dash) s.v.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${s.c}"><title>${esc(xs[i])}: ${fmt(v, 2)}</title></circle>`; }); });
  const lg = ser.filter(s => s.name).map(s => `<span><i style="background:${s.c};${s.dash ? "opacity:.55" : ""}"></i>${esc(s.name)}</span>`).join("");
  return `<svg viewBox="0 0 ${W} ${h}" width="100%" class="nk-svg">${g}</svg><div class="nk-lg">${lg}</div>`;
}

// trend liniowy (nachylenie na punkt)
const trend = v => { const p = v.map((y, i) => [i, y]).filter(([, y]) => y != null); if (p.length < 3) return null; const mx = avg(p.map(q => q[0])), my = avg(p.map(q => q[1]));
  const b = p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / (p.reduce((s, [x]) => s + (x - mx) ** 2, 0) || 1); return { b, a: my - b * mx }; };

function period(d) {
  const end = new Date((st.end || today()) + "T12:00"), n = OKR[st.okres][1], t0 = new Date(end); t0.setDate(t0.getDate() - n + 1);
  const p0 = new Date(t0); p0.setDate(p0.getDate() - n);
  const s = iso(t0), e = iso(end), ps = iso(p0);
  return { s, e, ps, rows: (d.seria || []).filter(r => r.data >= s && r.data <= e), prev: (d.seria || []).filter(r => r.data >= ps && r.data < s) };
}

function tiles(d, P) {
  const ed = rows => avg(rows.map(r => errPct(r.dom, r.dom_p))), ep = rows => avg(rows.map(r => errPct(r.pv, r.pv_p)));
  const cur = ed(P.rows), prv = ed(P.prev), cpv = ep(P.rows), ppv = ep(P.prev);
  const arrow = (a, b) => a == null || b == null ? `<span class="lab">brak porównania</span>` : `<b style="color:${a <= b ? C.green : C.red}">${a <= b ? "↓" : "↑"} ${fmt(Math.abs(a - b), 1)} pp</b>`;
  const m = new Date().getMonth() + 1, km = (d.pv_kal_m || {})[m], pm = d.pompa, k = pm?.coef || [];
  const t = (ic, lab, val, sub) => `<div class="tile"><div class="ic">${ic}</div><div style="min-width:0"><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div></div>`;
  return `<div class="tiles" style="margin-bottom:14px">
    ${t("🏠", "Błąd prognozy domu (dobowo)", cur == null ? "–" : fmt(cur, 1, "%"), `${arrow(cur, prv)} vs poprzedni okres${prv != null ? ` (${fmt(prv, 1, "%")})` : ""}`)}
    ${t("☀", "Błąd prognozy PV (dobowo)", cpv == null ? "–" : fmt(cpv, 0, "%"), `${arrow(cpv, ppv)} vs poprzedni okres`)}
    ${t("📐", `Kalibracja PV – ${MIES[m - 1]}`, km != null ? "× " + fmt(km, 2) : d.kal_pv != null ? "× " + fmt(d.kal_pv, 2) : "–", km != null ? `roczna × ${fmt(d.kal_pv, 2)}` : "brak danych z tego miesiąca – roczna")}
    ${t("♨", "Model pompy ciepła", pm ? `${fmt(k[0], 2)} ${k[1] < 0 ? "−" : "+"} ${fmt(Math.abs(k[1]), 3)}·T` : "–", pm ? `${pm.pelny ? `wiatr ${k[2] >= 0 ? "+" : "−"}${fmt(Math.abs(k[2]), 3)} · słońce ${k[3] >= 0 ? "+" : "−"}${fmt(Math.abs(k[3]), 2)}` : "tylko T (pełny gorszy)"} · R² ${fmt(pm.r2, 2)}` : "brak encji pompy")}
    ${t("📚", "Historia do nauki", `${d.dni_hist || 0} dni`, `snapshotów współczynników: ${Object.keys(d.snapshoty || {}).length}`)}
    ${t("⟳", "Ostatnie przeliczenie", d.przeliczono ? new Date(d.przeliczono).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "–", "modele co 1 h · plan co 15 min")}</div>`;
}

function accBox(d, P) {
  let body;
  if (st.okres === "dzien") {
    const hs = d.godziny || [], xs = hs.map((_, i) => `${i}:00`);
    body = chart(xs, [{ v: hs.map(h => h.dom_f), c: C.dom, name: "Dom – fakt" }, { v: hs.map(h => h.dom_p), c: C.dom, dash: "6 5", name: "Dom – prognoza z początku dnia" }, { v: hs.map(h => h.dom_o), c: C.grey, dash: "3 4", name: "Dom – ostatnia prognoza" },
      { v: hs.map(h => h.pv_f), c: C.pv, name: "PV – fakt" }, { v: hs.map(h => h.pv_p), c: C.pv, dash: "6 5", name: "PV – prognoza" }], { unit: "", every: 3 });
    const sf = hs.reduce((a, h) => a + (h.dom_f || 0), 0), sp = hs.reduce((a, h) => a + (h.dom_p || 0), 0);
    body += `<div class="lab">Dom: fakt ${fmt(sf, 1, "kWh")} · prognoza z początku dnia ${fmt(sp, 1, "kWh")}${sp > 0 && sf > 0 ? ` (${sf >= sp ? "+" : "−"}${fmt(Math.abs(sf - sp) / sp * 100, 0)}%)` : ""}. Prognozy zapisywane są przez 15 dni – starsze dni mają tylko fakt.</div>`;
  } else {
    let rows = P.rows, xs;
    if (st.okres === "rok") {   // tygodniowo
      const wk = {}; rows.forEach(r => { const dt = new Date(r.data + "T12:00"); dt.setDate(dt.getDate() - (dt.getDay() + 6) % 7); const k = iso(dt); (wk[k] = wk[k] || []).push(r); });
      rows = Object.entries(wk).sort().map(([k, a]) => ({ data: k, dom: a.reduce((s, r) => s + (r.dom || 0), 0), pv: a.reduce((s, r) => s + (r.pv || 0), 0), dom_p: a.some(r => r.dom_p != null) ? a.reduce((s, r) => s + (r.dom_p || 0), 0) : null, pv_p: a.some(r => r.pv_p != null) ? a.reduce((s, r) => s + (r.pv_p || 0), 0) : null, t: avg(a.map(r => r.t)) }));
    }
    xs = rows.map(r => r.data.slice(5).split("-").reverse().join("."));
    const e = rows.map(r => errPct(r.dom, r.dom_p)), tr = trend(e);
    body = chart(xs, [{ v: rows.map(r => r.dom), c: C.dom, name: `Dom – fakt (kWh/${st.okres === "rok" ? "tydz." : "dzień"})` }, { v: rows.map(r => r.dom_p), c: C.dom, dash: "6 5", name: "Dom – prognoza z początku dnia" },
      { v: rows.map(r => r.pv), c: C.pv, name: "PV – fakt" }, { v: rows.map(r => r.pv_p), c: C.pv, dash: "6 5", name: "PV – prognoza" },
      { v: e, c: C.red, axis: "r", w: 1.4, op: .8, name: "błąd domu %" }], { unitR: "%" });
    body += `<div class="lab">${tr ? `Trend błędu domu: <b style="color:${tr.b <= 0 ? C.green : C.red}">${tr.b <= 0 ? "spada" : "rośnie"} ${fmt(Math.abs(tr.b), 2)} pp na ${st.okres === "rok" ? "tydzień" : "dzień"}</b> – ${tr.b <= 0 ? "uczy się" : "gorzej niż wcześniej (sprawdź pogodę / zmiany w domu)"}.` : "Za mało dni z zapisaną prognozą, żeby liczyć trend (prognozy trzymane 15 dni, snapshoty dzienne od wdrożenia v0.6.32)."}</div>`;
  }
  return `<div class="box"><div class="h"><span>📉 Prognoza vs fakt${tip({ co: "Ile się pomylił: prognoza z początku dnia (to, czym planował) vs to, co faktycznie było.", jak: "Dzień = godzinowo, Tydzień / Miesiąc = dziennie, Rok = tygodniowo. Czerwona linia = błąd dobowy domu w %.", czytaj: "Błąd spada z czasem = się uczy." })}</span></div>${body}</div>`;
}

function wxBox(P) {
  const rows = P.rows; if (!rows.length) return "";
  const xs = rows.map(r => r.data.slice(5).split("-").reverse().join("."));
  return `<div class="box"><div class="h"><span>🌦 Co wpływało na zużycie i PV <span class="lab" style="font-size:inherit">(dziennie)</span></span></div>${chart(xs, [
    { v: rows.map(r => r.dom), c: C.dom, bar: true, op: .35, name: "Dom (kWh)" }, { v: rows.map(r => r.pompa), c: C.or, bar: true, op: .6, name: "Pompa (kWh)" },
    { v: rows.map(r => r.t), c: C.red, axis: "r", name: "Temp. śr. (°C)" }, { v: rows.map(r => r.wiatr), c: C.cyan, axis: "r", dash: "5 4", name: "Wiatr śr. (m/s)" },
    { v: rows.map(r => r.nasl), c: C.pv, axis: "r", w: 1.4, name: "Nasłonecznienie (kWh/m²)" }], { h: 230, zero: true })}</div>`;
}

const WSP = { kal_pv: ["Kalibracja PV (rok)", s => s.kal_pv], wsp_temp: ["Wsp. temp. domu (kWh/°C)", s => s.wsp_temp], pa: ["Pompa a (kWh/h)", s => s.pompa?.[0]], pb: ["Pompa b (·T)", s => s.pompa?.[1]],
  pc: ["Pompa c (·wiatr)", s => s.pompa?.[2]], pd: ["Pompa d (·słońce)", s => s.pompa?.[3]], pr2: ["Pompa R²", s => s.pompa_r2], dom_e: ["Błąd domu wczoraj (%)", s => errPct(s.wczoraj?.dom_f, s.wczoraj?.dom_p)] };
function coefBox(d, P) {
  const sn = Object.entries(d.snapshoty || {}).sort(([a], [b]) => a < b ? -1 : 1), inP = sn.filter(([k]) => k >= P.s && k <= P.e);
  const devN = [...new Set(sn.flatMap(([, s]) => Object.keys(s.urz || {})))];
  const all = { ...WSP, ...Object.fromEntries(devN.flatMap(n => [[`u_${n}_c`, [`${n}: cykli/tydz.`, s => s.urz?.[n]?.cykle_tydz]], [`u_${n}_k`, [`${n}: kWh/cykl`, s => s.urz?.[n]?.kwh_cykl]]])) };
  if (!sn.length) return `<div class="box"><div class="h"><span>🧮 Współczynniki – było → jest</span></div><div class="lab">Historia współczynników zbiera się od wdrożenia v0.6.32 (snapshot raz na dobę, pierwszy po północy). Na razie brak.</div></div>`;
  const use = inP.length ? inP : sn.slice(-1), a = use[0][1], b = use[use.length - 1][1];
  const rows = Object.entries(all).map(([k, [lab, f]]) => { const x = f(a), y = f(b); if (x == null && y == null) return "";
    const ch = x != null && y != null ? y - x : null;
    return `<tr><td>${esc(lab)}</td><td class="r">${fmt(x, 3)}</td><td class="r">${fmt(y, 3)}</td><td class="r">${ch == null ? "–" : `<b>${ch >= 0 ? "+" : "−"}${fmt(Math.abs(ch), 3)}</b>`}</td><td><button class="btn" style="padding:2px 8px;font-size:11px" data-wsp="${k}">wykres</button></td></tr>`; }).join("");
  const [lab, f] = all[st.wsp] || WSP.kal_pv, xs = sn.map(([k]) => k.slice(5).split("-").reverse().join("."));
  return `<div class="box"><div class="h"><span>🧮 Współczynniki – było → jest${tip({ co: "Wartości, których algorytm używał. Snapshot raz na dobę.", czytaj: "„Było” = pierwszy dzień wybranego okresu, „jest” = ostatni." })}</span><span class="lab">${use[0][0]} → ${use[use.length - 1][0]}</span></div>
    <div class="g2"><div style="overflow:auto"><table class="tbl"><tr><th>Współczynnik</th><th class="r">było</th><th class="r">jest</th><th class="r">zmiana</th><th></th></tr>${rows}</table></div>
    <div><div class="lab" style="margin-bottom:4px">${esc(lab)} – cała historia</div>${chart(xs, [{ v: sn.map(([, s]) => f(s)), c: C.vio, name: lab }], { h: 200, zero: false })}</div></div></div>`;
}

const DAYC = { kal_pv: ["Kalibracja PV dnia (fakt / prognoza z pogody)", C.pv], dom_e: ["Błąd prognozy domu (%)", C.red], pv_e: ["Błąd prognozy PV (%)", C.or],
  pompa_e: ["Błąd modelu pompy (%)", C.vio], kwh_na_st: ["Pompa: kWh na °C chłodu (18 − T)", C.cyan], dom: ["Zużycie domu (kWh)", C.dom], pompa: ["Pompa (kWh)", C.or] };
const dayVal = (r, k) => k === "dom_e" ? errPct(r.dom, r.dom_p) : k === "pv_e" ? errPct(r.pv, r.pv_p) : k === "pompa_e" ? errPct(r.pompa, r.pompa_m) : r[k];
function dayCoefBox(P) {
  const rows = P.rows; if (!rows.length) return "";
  const xs = rows.map(r => r.data.slice(5).split("-").reverse().join(".")), k = DAYC[st.dc] ? st.dc : "kal_pv", v = rows.map(r => dayVal(r, k)), tr = trend(v);
  const third = Math.max(1, Math.floor(rows.length / 3)), a = avg(v.slice(0, third)), b = avg(v.slice(-third));
  const tab = Object.entries(DAYC).map(([kk, [lab]]) => { const vv = rows.map(r => dayVal(r, kk)), x = avg(vv.slice(0, third)), y = avg(vv.slice(-third));
    return `<tr><td><a href="#" data-dc="${kk}" style="color:${kk === k ? "#fff" : "#7fb3ff"}">${esc(lab)}</a></td><td class="r">${fmt(x, 2)}</td><td class="r">${fmt(y, 2)}</td><td class="r">${x != null && y != null ? `<b>${y >= x ? "+" : "−"}${fmt(Math.abs(y - x), 2)}</b>` : "–"}</td></tr>`; }).join("");
  return `<div class="box"><div class="h"><span>📅 Współczynniki dzień po dniu${tip({ co: "Każdy współczynnik policzony dla każdego dnia osobno. Algorytm korzysta ze wszystkich poziomów naraz: dni podobne, miesiąc, sezon, rok (wagi wg ilości danych).", czytaj: "„Początek” = średnia z pierwszej 1/3 okresu, „koniec” = z ostatniej 1/3." })}</span><span class="lab">${tr ? `trend: ${tr.b >= 0 ? "+" : "−"}${fmt(Math.abs(tr.b), 3)} / dzień` : ""}</span></div>
    <div class="g2"><div>${chart(xs, [{ v, c: DAYC[k][1], name: DAYC[k][0] }, ...(tr ? [{ v: v.map((_, i) => tr.a + tr.b * i), c: DAYC[k][1], dash: "6 5", op: .6, w: 1.4 }] : [])], { h: 220, zero: false })}</div>
    <div style="overflow:auto"><table class="tbl"><tr><th>Współczynnik (kliknij = wykres)</th><th class="r">początek</th><th class="r">koniec</th><th class="r">zmiana</th></tr>${tab}</table>
    <div class="lab" style="margin-top:6px">Teraz w prognozie PV: ${Object.entries(st.d?.pv_mnozniki || {}).map(([dd, [m, n]]) => `${dd.slice(5)} ×${fmt(m, 2)} (${n} dni podobnych)`).join(" · ") || "–"}<br>
    Pompa: ${st.d?.pompa_warstwy?.uzywa === "warstwy" ? "miesiąc + sezon + rok" : "tylko roczny"} (MAE 14 dni: warstwy ${fmt(st.d?.pompa_warstwy?.mae_warstwy, 3)} / roczny ${fmt(st.d?.pompa_warstwy?.mae_roczny, 3)}) · modele miesięczne: ${Object.keys(st.d?.pompa_warstwy?.mies || {}).map(m => MIES[m - 1]).join(", ") || "–"}</div></div></div></div>`;
}

function simBox(d) {
  const s = d.podobne || [], c0 = d.dzien_cechy || {};
  const dom = avg(s.map(x => x.dom)), pv = avg(s.map(x => x.pv));
  return `<div class="box"><div class="h"><span>🔎 Dni podobne do ${esc(d.dzien)}${tip({ co: "Dni z historii z podobną pogodą i porą roku: temperatura ±3 °C, wiatr ±2 m/s, nasłonecznienie ±30 %, ±30 dni od daty (każdy rok), ten sam typ dnia (roboczy / weekend).", czytaj: "Średnia z podobnych dni = czego się spodziewać w taki dzień." })}</span>
    <span class="lab">${fmt(c0.t, 1)} °C · wiatr ${fmt(c0.wiatr, 1)} m/s · nasł. ${fmt(c0.nasl, 2)} kWh/m² · ${esc(c0.typ || "")}${c0.dom != null ? ` · dom ${fmt(c0.dom, 1)} kWh` : ""}</span></div>
    ${s.length ? `<div class="lab" style="margin-bottom:6px">Średnio w podobne dni: dom <b>${fmt(dom, 1, "kWh")}</b>${pv != null ? ` · PV <b>${fmt(pv, 1, "kWh")}</b>` : ""} (${s.length} dni)</div>
    <div style="overflow:auto"><table class="tbl rt"><tr><th>Data</th><th class="r">Podob.</th><th class="r">Temp.</th><th class="r">Wiatr</th><th class="r">Nasł.</th><th class="r">Dom</th><th class="r">PV</th><th>Typ</th></tr>
    ${s.map(x => `<tr><td class="hd"><a href="#" data-simday="${x.data}" style="color:#7fb3ff">${x.data}</a></td><td class="r" data-l="Podobieństwo">${x.podobienstwo}%</td><td class="r" data-l="Temp.">${fmt(x.t, 1)} °C</td><td class="r" data-l="Wiatr">${fmt(x.wiatr, 1)} m/s</td><td class="r" data-l="Nasł.">${fmt(x.nasl, 2)}</td><td class="r" data-l="Dom">${fmt(x.dom, 1, "kWh")}</td><td class="r" data-l="PV">${fmt(x.pv, 1, "kWh")}</td><td data-l="Typ">${esc(x.typ)}</td></tr>`).join("")}</table></div>`
    : `<div class="lab">Brak podobnych dni w historii (albo brak pogody dla tego dnia).</div>`}</div>`;
}

function devBox(d) {
  const u = Object.entries(d.urzadzenia || {});
  if (!u.length) return `<div class="box"><div class="h"><span>🔌 Urządzenia</span></div><div class="lab">Dodaj urządzenia (zmywarka, pralka…) w Ustawienia → 📚 Historia do nauki → 🔌 Urządzenia.</div></div>`;
  const days = []; for (let i = 34; i >= 0; i--) { const t = new Date(); t.setDate(t.getDate() - i); days.push(iso(t)); }
  return `<div class="box"><div class="h"><span>🔌 Urządzenia – czego się nauczył</span></div><div class="g2">${u.map(([n, x]) => {
    const mx = Math.max(...x.dni_tyg || [1], 1), hmax = Math.max(...x.godz_startu || [1], 1), top = (x.godz_startu || []).map((v, h) => [v, h]).sort((a, b) => b[0] - a[0]).slice(0, 2).filter(q => q[0]).map(q => `${q[1]}:00`);
    return `<div class="box" style="margin:0"><div class="h" style="font-size:15px"><span>${esc(x.ikona || "🔌")} ${esc(n)}</span><span class="lab">dane od ${esc(x.od || "–")}</span></div>
      <div class="tiles" style="grid-template-columns:repeat(3,1fr)"><div><div class="lab">cykli / tydz.</div><b>${fmt(x.cykle_tydz, 1)}</b></div><div><div class="lab">kWh / cykl</div><b>${fmt(x.kwh_cykl, 2)}</b></div><div><div class="lab">co ile dni</div><b>${fmt(x.co_ile_dni, 1)}</b></div></div>
      <div class="lab" style="margin-top:6px">Rocznie ~${fmt(x.kwh_rok, 0, "kWh")} · najczęściej start: ${top.join(", ") || "–"}</div>
      <div style="display:flex;gap:4px;align-items:flex-end;height:46px;margin-top:6px">${(x.dni_tyg || []).map((v, i) => `<div style="flex:1;text-align:center"><div style="height:${v / mx * 30}px;background:${C.dom};border-radius:3px 3px 0 0;opacity:.8"></div><div class="lab" style="font-size:10px">${WD[i]}</div></div>`).join("")}</div>
      <div style="display:flex;gap:1px;align-items:flex-end;height:28px;margin-top:4px" title="godzina startu">${(x.godz_startu || []).map(v => `<div style="flex:1;height:${Math.max(v / hmax * 26, 1)}px;background:${C.or};opacity:.75"></div>`).join("")}</div>
      <div class="lab" style="font-size:10px;display:flex;justify-content:space-between"><span>0:00</span><span>12:00</span><span>23:00</span></div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:8px">${days.map(dd => { const v = (x.kalendarz || {})[dd]; return `<div title="${dd}${v ? `: ${v} kWh` : ""}" style="height:16px;border-radius:3px;background:${v ? C.green : "#ffffff10"};opacity:${v ? Math.min(.35 + v / (x.kwh_cykl || 1) * .5, 1) : 1}"></div>`; }).join("")}</div>
      <div class="lab" style="font-size:10px">ostatnie 35 dni (zielone = cykl)</div></div>`; }).join("")}</div></div>`;
}

function pumpBox(d) {
  const p = d.pompa_pkt || [], m = d.pompa; if (!p.length) return "";
  const W = 440, H = 230, L = 40, B = 26, T = 10, R = 10, t0 = Math.min(...p.map(q => q[0])), t1 = Math.max(...p.map(q => q[0])), y1 = Math.max(...p.map(q => q[2]), 0.5) * 1.05, w1 = Math.max(...p.map(q => q[1]), 1);
  const X = t => L + (t - t0) / ((t1 - t0) || 1) * (W - L - R), Y = v => T + (y1 - v) / y1 * (H - T - B);
  let g = ""; for (let k = 0; k <= 4; k++) { const v = y1 * k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff12"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="xl">${fmt(v, 1)}</text>`; }
  for (let t = Math.ceil(t0 / 5) * 5; t <= t1; t += 5) g += `<text x="${X(t)}" y="${H - 8}" text-anchor="middle" class="xl">${t}°</text>`;
  p.forEach(([t, w, v]) => { const k = Math.min(w / w1, 1); g += `<circle cx="${X(t).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.2" fill="hsl(${200 - k * 200},90%,60%)" opacity=".55"/>`; });
  if (m) { const [a, b] = m.coef; g += `<line x1="${X(t0)}" y1="${Y(Math.max(a + b * t0, 0))}" x2="${X(t1)}" y2="${Y(Math.max(a + b * t1, 0))}" stroke="${C.red}" stroke-width="2.6"/>`; }
  return `<div class="box"><div class="h"><span>♨ Pompa ciepła vs temperatura${tip({ co: "Każda kropka = godzina z roku: zużycie pompy vs temperatura. Kolor = wiatr (niebieski słaby → czerwony silny).", czytaj: "Czerwona linia = model przy bezwietrznej nocy. Wiatr i słońce przesuwają ją w górę / w dół." })}</span></div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" class="nk-svg">${g}</svg>${m ? `<div class="lab">kWh/h = ${fmt(m.coef[0], 3)} ${m.coef[1] < 0 ? "−" : "+"} ${fmt(Math.abs(m.coef[1]), 3)}·T ${m.pelny ? `${m.coef[2] < 0 ? "−" : "+"} ${fmt(Math.abs(m.coef[2]), 3)}·wiatr ${m.coef[3] < 0 ? "−" : "+"} ${fmt(Math.abs(m.coef[3]), 3)}·słońce` : ""} · R² ${fmt(m.r2, 2)} · ${m.n} h<br>
    Bezpiecznik (ostatnie 14 dni, MAE kWh/h): pełny ${fmt(m.mae_pelny, 3)} · prosty ${fmt(m.mae_prosty, 3)} → używa <b>${m.pelny ? "pełnego (T + wiatr + słońce)" : "prostego (tylko T)"}</b></div>` : ""}</div>`;
}

function profBox(d) {
  const pr = d.profil || {}, m = new Date().getMonth() + 1, sez = [11, 12, 1, 2, 3].includes(m) ? "zima" : [5, 6, 7, 8].includes(m) ? "lato" : "przejsciowy";
  const xs = [...Array(24).keys()].map(h => `${h}:00`), S = [];
  [["zima", "#60a5fa"], ["przejsciowy", C.green], ["lato", C.pv]].forEach(([z, col]) => { if (pr[`${z}|roboczy`]) S.push({ v: pr[`${z}|roboczy`], c: col, name: `${z} – roboczy`, w: z === sez ? 2.6 : 1.4, op: z === sez ? 1 : .55 });
    if (pr[`${z}|weekend`]) S.push({ v: pr[`${z}|weekend`], c: col, dash: "6 4", name: `${z} – weekend`, w: z === sez ? 2.2 : 1.2, op: z === sez ? 1 : .5 }); });
  return `<div class="box"><div class="h"><span>🕒 Profil dobowy domu wg pory roku <span class="lab" style="font-size:inherit">(kW, średnio)</span></span></div>${chart(xs, S, { h: 230, every: 3 })}</div>`;
}

function pvBox(d) {
  const k = d.pv_kal_m || {}; if (!Object.keys(k).length) return "";
  return `<div class="box"><div class="h"><span>☀ Kalibracja PV per miesiąc${tip({ co: "Fakt PV / prognoza z archiwum pogody, osobno dla każdego miesiąca (słońce w listopadzie ≠ w lipcu). Używane w prognozie PV.", czytaj: "1,0 = prognoza trafia; < 1 = panele dają mniej niż wynika z pogody (cień, kurz, śnieg, nachylenie)." })}</span><span class="lab">roczna × ${fmt(d.kal_pv, 2)}</span></div>
    ${chart(MIES, [{ v: MIES.map((_, i) => k[i + 1] ?? null), c: C.pv, bar: true, name: "mnożnik" }], { h: 200 })}</div>`;
}

export function render(c) {
  load(c);
  const d = st.d;
  const bar = `<div class="box" style="padding:10px 14px"><div class="ctrl" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    ${Object.entries(OKR).map(([k, [n]]) => `<button class="btn ${st.okres === k ? "pri" : ""}" data-okr="${k}">${n}</button>`).join("")}
    <span style="flex:1"></span><button class="btn" data-mv="-1">◀</button><input type="date" class="date" data-end value="${st.end || today()}" max="${today()}"><button class="btn" data-mv="1">▶</button><button class="btn" data-mv="0">Dziś</button></div></div>`;
  if (!d) return bar + `<div class="box"><div class="lab">Wczytuję naukę…</div></div>`;
  if (d.err) return bar + `<div class="box err">Błąd: ${esc(d.err)}</div>`;
  const P = period(d);
  return `<style>.nk-svg text.xl{fill:#8fa6bd;font-size:11px}.nk-lg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#9bb3c6;margin-top:4px}.nk-lg i{display:inline-block;width:16px;height:4px;border-radius:2px;vertical-align:middle;margin-right:5px}</style>
    ${bar}${tiles(d, P)}${accBox(d, P)}${st.okres !== "dzien" ? wxBox(P) : ""}${st.okres !== "dzien" ? dayCoefBox(P) : ""}${coefBox(d, P)}${simBox(d)}${devBox(d)}<div class="g2">${pumpBox(d)}${pvBox(d)}</div>${profBox(d)}`;
}

export function bind(c, r) {
  r.querySelectorAll("[data-okr]").forEach(b => b.onclick = () => { st.okres = b.dataset.okr; c.render(true); });
  r.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { const v = +b.dataset.mv; if (!v) st.end = null; else { const t = new Date((st.end || today()) + "T12:00"); t.setDate(t.getDate() + v * OKR[st.okres][1]); const s = iso(t); st.end = s >= today() ? null : s; } st.at = 0; c.render(true); });
  r.querySelector("[data-end]")?.addEventListener("change", e => { st.end = e.target.value && e.target.value < today() ? e.target.value : null; st.at = 0; c.render(true); });
  r.querySelectorAll("[data-dc]").forEach(a => a.onclick = e => { e.preventDefault(); st.dc = a.dataset.dc; c.render(true); });
  r.querySelectorAll("[data-wsp]").forEach(b => b.onclick = () => { st.wsp = b.dataset.wsp; c.render(true); });
  r.querySelectorAll("[data-simday]").forEach(a => a.onclick = e => { e.preventDefault(); st.end = a.dataset.simday; st.okres = "dzien"; st.at = 0; c.render(true); });
}
