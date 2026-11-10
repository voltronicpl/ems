import { icP, icRP } from "./icons.js";
// EMS – wspolne narzedzia panelu: styl PGE, dymki (i), wykresy SVG z kursorem.
export const S = (h, id) => h && h.states[id];
export const num = (h, id, d = null) => { const s = S(h, id); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? d : v; };
export const fmt = (v, d = 1, u = "") => v === null || v === undefined || isNaN(v) ? "–" : `${Number(v).toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d })}${u ? " " + u : ""}`;
export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
export const hm = iso => new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
export function g12(now = new Date()) {
  const m = now.getMonth() + 1, summer = m >= 4 && m <= 9;
  const dst = now.getTimezoneOffset() < new Date(now.getFullYear(), 0, 1).getTimezoneOffset() ? 1 : 0;
  const h = (now.getHours() - dst + 24) % 24 + now.getMinutes() / 60, day = summer ? [15, 17] : [13, 15];
  const p = x => `${(x + dst) % 24}:00`;
  return { cheap: h >= 22 || h < 6 || (h >= day[0] && h < day[1]), summer, label: `${p(day[0])}–${p(day[1])}, ${p(22)}–${p(6)}` };
}
export function cheapAt(d) { const z = g12(d); return z.cheap; }

// Dymek (i): t = {co, jak, plus, minus, czytaj}
export function tip(t) {
  if (!t) return "";
  const x = typeof t === "string" ? { co: t } : t;
  const body = [x.co && `<b>Co to:</b> ${x.co}`, x.jak && `<b>Jak działa:</b> ${x.jak}`, x.plus && `<b>➕ Więcej:</b> ${x.plus}`, x.minus && `<b>➖ Mniej:</b> ${x.minus}`, x.czytaj && `<b>Jak czytać:</b> ${x.czytaj}`].filter(Boolean).join("<br>");
  return `<span class="ti" tabindex="0">i<span class="tt">${body}</span></span>`;
}

// Stan ekranu: ustawiany przez panel przed kazdym renderem (w = szerokosc panelu w px, mob = telefon).
export const ui = { w: 1200, mob: false };
// Szerokosc viewBox wykresu: na waskim ekranie mniejsza, zeby tekst 13 j. dawal ~10 px zamiast mrowek.
const vbW = () => Math.max(420, Math.min(1000, Math.round(ui.w * 1.3)));
// Co ile godzin podpis osi X, zeby sie nie nakladaly (~45 j. na podpis).
const xEvery = (hours, room) => [1, 2, 3, 4, 6, 12, 24].find(e => hours / e <= room / 45) || 24;

// Wykres w stylu PGE. rows: [{t: Date, ...}], bars/lines: [{k, c, name, unit, axis:"r"}]
let CH = 0;
export function chart({ key, rows, bars = [], lines = [], hlines = [], zones = true, now = true, h = 260, unit = "kWh", runit = "", tipf }) {
  if (!rows.length) return `<div class="nohist">Brak danych</div>`;
  const id = "c" + (++CH), W = vbW(), P = { l: 52, r: runit ? 52 : 14, t: 14, b: 26 }, iw = W - P.l - P.r, ih = h - P.t - P.b, n = rows.length, bw = iw / n;
  const vals = rows.flatMap(r => bars.map(b => (b.sign || 1) * (r[b.k] || 0))).concat(lines.filter(l => l.axis !== "r").flatMap(l => rows.map(r => r[l.k] || 0)));
  let mx = Math.max(0.1, ...vals), mn = Math.min(0, ...vals); const span = mx - mn || 1; mx += span * 0.08; if (mn < 0) mn -= span * 0.08;
  const y = v => P.t + ih - (v - mn) / (mx - mn) * ih;
  const rv = lines.filter(l => l.axis === "r").flatMap(l => rows.map(r => r[l.k]).filter(v => v != null)).concat(hlines.map(x => x.v));
  const rmx = Math.max(0.1, ...rv) * 1.08, rmn = Math.min(0, ...rv), ry = v => P.t + ih - (v - rmn) / (rmx - rmn || 1) * ih;
  const x = i => P.l + i * bw;
  let g = "";
  if (zones) rows.forEach((r, i) => { if (cheapAt(r.t)) g += `<rect x="${x(i)}" y="${P.t}" width="${bw + 0.5}" height="${ih}" fill="#14d98212"/>`; });
  for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 1)}</text>`; if (runit) { const w = rmn + (rmx - rmn) * k / 4; g += `<text x="${W - P.r + 6}" y="${ry(w) + 4}">${fmt(w, 2)}</text>`; } }
  g += `<text x="${P.l - 6}" y="${P.t - 2}" text-anchor="end" class="unit">${unit}</text>${runit ? `<text x="${W - P.r + 6}" y="${P.t - 2}" class="unit">${runit}</text>` : ""}`;
  if (mn < 0) g += `<line class="zero" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  const ev = Math.max(3, xEvery((rows[n - 1].t - rows[0].t) / 36e5, iw * 1.6));
  rows.forEach((r, i) => { const d = r.t; if (d.getMinutes() === 0 && d.getHours() % ev === 0) g += `<line class="vgrid" x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${P.t + ih}"/><text x="${x(i)}" y="${h - 8}" text-anchor="middle">${d.getHours() === 0 ? d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" }) : String(d.getHours()).padStart(2, "0")}</text>`; });
  const nb = bars.length || 1, gap = bw > 6 ? bw * 0.12 : 0, sw = (bw - gap) / nb;
  rows.forEach((r, i) => bars.forEach((b, j) => { const v = (b.sign || 1) * (r[b.k] || 0); if (!v) return; const y0 = y(0), y1 = y(v); g += `<rect x="${x(i) + gap / 2 + j * sw}" y="${Math.min(y0, y1)}" width="${Math.max(sw, 0.8)}" height="${Math.max(Math.abs(y1 - y0), 0.5)}" rx="1.5" fill="${typeof b.c === "function" ? b.c(r) : b.c}"/>`; }));
  hlines.forEach(l => g += `<line x1="${P.l}" x2="${W - P.r}" y1="${ry(l.v)}" y2="${ry(l.v)}" stroke="${l.c}" stroke-dasharray="6 5" stroke-width="1.3"/><text x="${W - P.r - 4}" y="${ry(l.v) - 4}" text-anchor="end" fill="${l.c}" style="fill:${l.c}">${l.name}</text>`);
  lines.forEach(l => { const f = l.axis === "r" ? ry : y; const pts = rows.map((r, i) => r[l.k] == null ? null : `${x(i) + bw / 2},${f(r[l.k])}`); let d = "", on = false; pts.forEach(p => { if (!p) { on = false; return; } d += (on ? "L" : "M") + p; on = true; }); g += `<path d="${d}" fill="none" stroke="${l.c}" stroke-width="${l.w || 2.2}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ""}/>`; });
  if (now) { const t = Date.now(), i = rows.findIndex(r => r.t.getTime() > t); if (i > 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${P.t + ih}" stroke="#fff" stroke-width="1.5"/><text x="${x(i) + 4}" y="${P.t + 12}" style="fill:#fff">teraz</text>`; }
  const legend = [...bars, ...lines].map(s => `<span><b style="background:${typeof s.c === "function" ? s.lc || "#888" : s.c}"></b>${s.name}</span>`).join("");
  CHARTS[id] = { key, rows, P, bw, W, tipf };
  return `<div class="fc-plot" data-chart="${id}"><svg class="fc-svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none">${g}<line class="cl" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="display:none"/></svg>${tipBox()}</div><div class="legend">${legend}</div>`;
}
const CHARTS = {};

// ---------- Wykres "Moc i bateria" 1:1 jak w PGE Net-Billing (pwSvg) ----------
// rows: sloty 15 min [{t: Date, ...}]; wartosci energii w kWh/slot -> rysowane jako srednia moc kW (×4).
// v0.5.5: trzy pasy (ceny | moc | SOC) na wspolnej osi czasu; areas = slupki, lines[0] = schodki z wypelnieniem (PV).
// areas: schodki z wypelnieniem do zera, lines: schodki bez wypelnienia ({k, c, name, sign, f: r => wartosc}),
// prices: neonowe schodki na prawej osi zl/kWh ({k|f, c, name, act: r => bool} – gruba swiecaca linia gdy act),
// socs: linie na osi % ({k, c, name, w, fill}), hlines: progi cenowe ({v, c, name}). key: stan pigulek legendy.
export const PINK = "#ff2bd6", CYAN = "#00f5ff";
export const G12_ZL = { cheap: 0.61, expensive: 1.25 };   // jak tariff.py (brutto energia + dystrybucja)
export const g12Price = t => cheapAt(t) ? G12_ZL.cheap : G12_ZL.expensive;
const OFF = {};
const niceStep = (span, n) => [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find(s => span / s <= n) || 200;
const ICC = { coins: "#facc15", bolt: "#facc15", batteryBolt: "#3ee07a" };
export function pwChart({ key, rows, areas = [], lines = [], prices = [], socs = [], hlines = [], now = true, h = 400, tipf, bands = [], order = "pms" }) {
  if (!rows.length) return `<div class="nohist">Brak danych</div>`;
  // Trzy pasy na wspolnej osi czasu (kazdy z jedna osia): ceny zl/kWh | moc kW | SOC %. Na komputerze opis pasa z ikona po lewej.
  const off = OFF[key] = OFF[key] || {}, mob = ui.mob;
  const id = "c" + (++CH), W = vbW(), L = mob ? 44 : 150, R = mob ? 10 : 18, T = mob ? 22 : 14, B = 30, GAP = mob ? 30 : 18, n = rows.length, bw = (W - L - R) / n;
  const hasP = prices.some(p => !off[p.name]) || hlines.length, hasS = socs.some(s => !off[s.name]);
  const free = h - T - B - GAP * 2, hP = hasP ? free * 0.36 : 0, hS = hasS ? free * 0.24 : 0, hM = free - hP - hS;
  // kolejnosc pasow od gory: order = "pms" (ceny, moc, SOC) albo np. "msp" (moc, SOC, ceny)
  const HB = { p: hasP ? hP : 0, m: hM, s: hasS ? hS : 0 }, TB = {}; let yy = T, last = "m";
  for (const b of order) { if (!HB[b]) continue; TB[b] = yy; yy += HB[b] + GAP; last = b; }
  const tP = TB.p ?? T, tM = TB.m, tS = TB.s ?? T, bot = TB[last] + HB[last];
  const x = i => L + i * bw, val = (s, r) => { const v = s.f ? s.f(r) : r[s.k]; return v == null || isNaN(v) ? null : (s.sign || 1) * v * (s.raw ? 1 : 4); };
  const kw = [...areas, ...lines].filter(s => !off[s.name]).flatMap(s => rows.map(r => val(s, r))).filter(v => v != null);
  let mag = Math.max(1, ...kw.map(Math.abs)); const st = [0.25, 0.5, 1, 2.5, 5, 10, 25].find(q => mag / q <= (mob ? 2 : 4)) || 50; mag = Math.ceil(mag / st) * st;
  const lo = Math.min(0, ...kw) < 0 ? -mag : 0, hi = mag;
  const Y = v => tM + (hi - v) / (hi - lo) * hM, YS = p => tS + (100 - Math.min(100, Math.max(0, p))) / 100 * hS;
  const pv = prices.filter(p => !off[p.name]).flatMap(p => rows.map(r => p.f ? p.f(r) : r[p.k])).concat(hlines.map(l => l.v)).filter(v => v != null && !isNaN(v));
  const pTop = Math.max(1, Math.ceil(Math.max(0, ...pv) * 2) / 2), YP = v => tP + (pTop - Math.max(0, v)) / pTop * hP;
  const nf = v => String(+v.toFixed(2)).replace(".", ",");
  let g = `<defs><filter id="gl${id}" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  // tlo pasow + opis z ikona po lewej
  const pane = (t, hh, ic, name, unit, sub) => { g += `<rect x="2" y="${t - 7}" width="${W - 4}" height="${hh + 14}" rx="10" class="pw-pane"/>`;
    if (mob) { g += `<text x="${L}" y="${t - 11}" class="pw-pn">${name}${unit ? " " + unit : ""}</text>`; return; }
    const cy = t + hh / 2, lines2 = name.split("|"), y0 = cy - (lines2.length - 1) * 9 - (unit ? 8 : 0);
    g += `<rect x="12" y="${cy - 17}" width="34" height="34" rx="8" class="pw-ic"/><svg x="16" y="${cy - 13}" width="26" height="26" viewBox="0 0 32 32" style="filter:drop-shadow(0 0 3px ${ICC[ic]})">${icRP(ic)}</svg>`;
    lines2.forEach((l, k) => g += `<text x="54" y="${y0 + k * 15}" class="pw-pt">${l}</text>`);
    if (unit) g += `<text x="54" y="${y0 + lines2.length * 15}" class="pw-pu">${unit}</text>`;
    if (sub) g += `<text x="12" y="${y0 + lines2.length * 15 + 16}" class="pw-pu">${sub}</text>`; };
  // tanie strefy G12
  let z0 = -1; rows.forEach((r, i) => { const c = cheapAt(r.t); if (c && z0 < 0) z0 = i; if ((!c || i === n - 1) && z0 >= 0) { const e = c ? i + 1 : i;
    g += `<rect x="${x(z0)}" y="${T - 7}" width="${x(e) - x(z0)}" height="${bot - T + 14}" class="pw-night"/>`; z0 = -1; } });
  // pasy recznego kupna / sprzedazy (bands: [{a, b (ms), c, txt}])
  if (n > 1) { const t0 = rows[0].t.getTime(), dt = rows[1].t - rows[0].t, xt = t => L + (t - t0) / dt * bw;
    for (const b of bands) { const a = Math.max(L, xt(b.a)), e = Math.min(W - R, xt(b.b)); if (e <= a) continue;
      g += `<rect x="${a.toFixed(1)}" y="${T - 7}" width="${Math.max(e - a, 2).toFixed(1)}" height="${bot - T + 14}" fill="${b.c}" opacity=".12"/><rect x="${a.toFixed(1)}" y="${T - 7}" width="${Math.max(e - a, 2).toFixed(1)}" height="3" fill="${b.c}"/><text x="${(a + 3).toFixed(1)}" y="${bot + 4}" style="fill:${b.c};font-size:11px;font-weight:600">${b.txt}</text>`; } }
  const pill = (y, c, txt) => { const w = txt.length * 6.6 + 16, x0 = W - R - w - 4; return `<rect x="${x0}" y="${y - 11}" width="${w}" height="22" rx="11" fill="#0b1828"/><rect x="${x0}" y="${y - 11}" width="${w}" height="22" rx="11" fill="${c}" fill-opacity=".2" stroke="${c}" stroke-opacity=".85"/><text x="${x0 + w / 2}" y="${y + 4}" text-anchor="middle" style="fill:${c};font-size:12px;font-weight:600">${txt}</text>`; };
  if (hasP) { pane(tP, hP, "coins", "Ceny|energii", "zł/kWh"); const pst = pTop > 3 ? 0.5 : 0.25;
    for (let v = 0; v <= pTop + 1e-9; v += pst) g += `<line x1="${L}" x2="${W - R}" y1="${YP(v)}" y2="${YP(v)}" class="grid"/><text x="${L - 8}" y="${YP(v) + 4}" text-anchor="end" class="ax">${fmt(v, 2)}</text>`; }
  pane(tM, hM, "bolt", "Moc", "kW", lo < 0 ? "(± sieć / bateria)" : "");
  for (let v = lo; v <= hi + st / 1e6; v += st) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="${Math.abs(v) < st / 1e6 ? "zero" : "grid"}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="ax">${(v > 0 ? "+" : "") + nf(v)}</text>`;
  if (hasS) { pane(tS, hS, "batteryBolt", "SOC|baterii", ""); for (const p of [0, 25, 50, 75, 100]) g += `<line x1="${L}" x2="${W - R}" y1="${YS(p)}" y2="${YS(p)}" class="grid"/><text x="${L - 8}" y="${YS(p) + 4}" text-anchor="end" class="ax">${p}%</text>`; }
  const span = rows[n - 1].t - rows[0].t, every = Math.max(span > 26 * 36e5 ? 3 : 2, xEvery(span / 36e5, W - L - R));
  rows.forEach((r, i) => { const d = r.t; if (d.getMinutes() === 0 && d.getHours() % every === 0) g += `${d.getHours() === 0 ? `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${bot}" class="vgrid"/>` : ""}<text x="${x(i)}" y="${bot + 22}" text-anchor="middle" class="xl">${d.getHours() === 0 && span > 26 * 36e5 ? d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" }) : String(d.getHours()).padStart(2, "0") + ":00"}</text>`; });
  const steps = (f, y) => { let d = "", on = false; rows.forEach((r, i) => { const v = f(r); if (v == null) { on = false; return; } d += on ? `V${y(v).toFixed(1)}H${x(i + 1).toFixed(1)}` : `M${x(i).toFixed(1)} ${y(v).toFixed(1)}H${x(i + 1).toFixed(1)}`; on = true; }); return d; };
  const gp = bw > 5 ? 1.5 : 0;
  for (const s of areas) { if (off[s.name]) continue; rows.forEach((r, i) => { const v = val(s, r); if (!v) return; const y0 = Y(0), y1 = Y(v);
    g += `<rect x="${(x(i) + gp / 2).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${Math.max(bw - gp, 0.6).toFixed(1)}" height="${Math.max(Math.abs(y1 - y0), 0.5).toFixed(1)}" rx="1.5" fill="${s.c}" opacity=".9"/>`; }); }
  lines.forEach((s, j) => { if (off[s.name]) return; const d = steps(r => val(s, r), Y); if (!d) return;
    if ((j === 0 && !s.nofill) || s.fill) g += d.split("M").filter(Boolean).map(p => `<path d="M${p}V${Y(0).toFixed(1)}H${p.split(" ")[0]}Z" fill="${s.c}" opacity=".16"/>`).join("");
    g += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.2}" stroke-linejoin="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/>`; });
  if (hasP) {
    hlines.forEach(l => { if (l.v > pTop) return; g += `<line x1="${L}" x2="${W - R}" y1="${YP(l.v)}" y2="${YP(l.v)}" stroke="${l.c}" stroke-dasharray="7 6" stroke-width="1.6" opacity=".85"/>`; });
    prices.forEach((p, j) => { if (off[p.name]) return; const f = r => { const v = p.f ? p.f(r) : r[p.k]; return v == null || isNaN(v) ? null : v; }; const d = steps(f, YP); let hh = "";
      rows.forEach((r, i) => { const v = f(r); if (v != null && p.act && p.act(r)) hh += `M${x(i).toFixed(1)} ${YP(v).toFixed(1)}H${x(i + 1).toFixed(1)}`; });
      if (j === 0 && d) g += d.split("M").filter(Boolean).map(q => `<path d="M${q}V${YP(0).toFixed(1)}H${q.split(" ")[0]}Z" fill="${p.c}" opacity=".07"/>`).join("");
      g += (d ? `<path d="${d}" fill="none" stroke="${p.c}" stroke-width="2.6" stroke-linejoin="round"/>` : "") + (hh ? `<path d="${hh}" fill="none" stroke="${p.c}" stroke-width="5" stroke-linecap="round" filter="url(#gl${id})"/>` : ""); });
    hlines.forEach(l => { if (l.v <= pTop) g += pill(YP(l.v), l.c, l.name); }); }
  if (hasS) { for (const s of socs) { if (off[s.name]) continue; const d = steps(r => r[s.k] == null ? null : r[s.k], YS); if (!d) continue;
      if (s.fill) g += d.split("M").filter(Boolean).map(p => `<path d="M${p}V${YS(0).toFixed(1)}H${p.split(" ")[0]}Z" fill="${s.c}" opacity=".22"/>`).join("");
      g += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.6}" stroke-linejoin="round"/>`; }
    const mn = OFF.socMin; if (mn != null) g += `<line x1="${L}" x2="${W - R}" y1="${YS(mn)}" y2="${YS(mn)}" stroke="#d8b4fe" stroke-dasharray="7 6" stroke-width="1.4" opacity=".8"/>` + pill(YS(mn), "#d8b4fe", `min ${mn}%`); }
  if (now) { const t = Date.now(), i = rows.findIndex(r => r.t.getTime() > t); if (i > 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${bot}" class="nowl"/><text x="${x(i) + 5}" y="${T + 12}" class="nowt">teraz</text>`; }
  // kropki na liniach w miejscu kursora
  const dots = rows.map(r => [...prices.filter(p => !off[p.name]).map(p => { const v = p.f ? p.f(r) : r[p.k]; return v == null || isNaN(v) ? null : { y: YP(v), c: p.c }; }),
    ...socs.filter(s => !off[s.name]).map(s => r[s.k] == null ? null : { y: YS(r[s.k]), c: s.c })].filter(Boolean));
  CHARTS[id] = { key, rows, P: { l: L }, bw, W, tipf, dots };
  const legend = [...prices, ...areas, ...lines, ...socs].map(s => `<button class="pw-lg${off[s.name] ? " off" : ""}" data-lg="${esc(key)}|${esc(s.name)}"><i style="background:${s.c}"></i>${s.name}</button>`).join("");
  return `<div class="pw-legend">${legend}</div><div class="fc-plot pw-plot" data-chart="${id}"><svg class="fc-svg pw-svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid meet">${g}<line class="cl" x1="0" x2="0" y1="${T - 7}" y2="${bot + 7}" style="display:none"/><g class="cd"></g></svg>${tipBox()}</div>`;
}
export const setSocMin = v => { OFF.socMin = v; };

// Dymek wykresu: na komputerze plywa nad wykresem, na telefonie stoi pod wykresem (nie zaslania danych).
const tipBox = () => ui.mob ? `<div class="fc-tip">👆 Dotknij albo przesuń palcem po wykresie</div>` : `<div class="fc-tip" style="display:none"></div>`;
const SEL = {};                                         // wybrany slot per wykres (key) – przezywa odswiezenie panelu
export function bindCharts(root, rerender) {
  root.querySelectorAll("[data-lg]").forEach(b => b.onclick = () => { const [k, nm] = b.dataset.lg.split("|"); const o = OFF[k] = OFF[k] || {}; o[nm] = !o[nm]; if (rerender) rerender(); });
  root.querySelectorAll("[data-chart]").forEach(el => {
    const c = CHARTS[el.dataset.chart]; if (!c) return;
    const svg = el.querySelector("svg"), cl = svg.querySelector(".cl"), tp = el.querySelector(".fc-tip");
    const hide = () => { cl.style.display = "none"; const cd = svg.querySelector(".cd"); if (cd) cd.innerHTML = ""; if (!ui.mob) tp.style.display = "none"; if (c.key) delete SEL[c.key]; };
    let my = null;   // pozycja myszy w pionie (px w ramce wykresu) – dymek idzie za nia
    const show = i => {
      if (i < 0 || i >= c.rows.length) { hide(); return; }
      const cx = c.P.l + (i + 0.5) * c.bw; cl.setAttribute("x1", cx); cl.setAttribute("x2", cx); cl.style.display = "";
      const cd = svg.querySelector(".cd"); if (cd && c.dots) cd.innerHTML = (c.dots[i] || []).map(d => `<circle cx="${cx}" cy="${d.y}" r="6" fill="${d.c}" stroke="#0b1828" stroke-width="2.5"/>`).join("");
      tp.innerHTML = c.tipf ? c.tipf(c.rows[i]) : ""; tp.style.display = "";
      if (!ui.mob) { const pc = cx / c.W * 100; if (c.dots) { tp.style.left = pc + "%"; tp.style.top = my == null ? "56px" : Math.max(0, Math.min(my - tp.offsetHeight / 2, el.clientHeight - tp.offsetHeight)) + "px"; tp.style.transform = pc > 60 ? "translateX(calc(-100% - 14px))" : "translateX(14px)"; } else tp.style.left = Math.min(Math.max(pc, 12), 88) + "%"; }
      if (c.key) SEL[c.key] = i;
    };
    const at = e => { const b = svg.getBoundingClientRect(); return Math.floor(((e.clientX - b.left) / b.width * c.W - c.P.l) / c.bw); };
    svg.onpointermove = svg.onpointerdown = e => { my = e.pointerType === "mouse" ? e.clientY - el.getBoundingClientRect().top : null; show(at(e)); };
    svg.onpointerleave = e => { if (e.pointerType === "mouse") hide(); };   // palec: dymek zostaje po puszczeniu
    if (c.key && SEL[c.key] != null) show(SEL[c.key]);
  });
}

export const CSS = `
.ico{display:inline-block;vertical-align:-0.2em;flex:none}.sc-top .ico{vertical-align:-0.25em;margin-right:.3cqw}.sc-top span{display:inline-flex;align-items:center;gap:.6cqw}.sc-top .icr{width:2.1cqw;height:2.1cqw}.sc-ic .ico,.sc-ic .icr{width:2.3cqw;height:2.3cqw}.icr{display:block;filter:drop-shadow(0 0 5px #ffffff22)}
.sc-ic.y,.ov-ic.y{color:#facc15}.sc-ic.g,.ov-ic.g{color:#3ee07a}.sc-ic.b,.ov-ic.b{color:#60a5fa}.sc-ic.r,.ov-ic.r{color:#ff5d6c}.sc-ic.o,.ov-ic.o{color:#ffad2e}
.sc-ic,.ov-ic{box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 30%,transparent),0 0 16px color-mix(in srgb,currentColor 28%,transparent)}.sc-ic .ico,.ov-ic .ico{filter:drop-shadow(0 0 4px currentColor)}
.ov-h .ico{color:#60a5fa}.ov-box .btn{display:inline-flex;align-items:center;gap:6px}.btn .ico{margin:0}.sc-sub .ico{vertical-align:-0.15em}
.sc{position:relative;container-type:inline-size;border-radius:16px;overflow:hidden;margin-bottom:14px;border:1px solid #1d3a55}.sc img{display:block;width:100%;height:auto}
.sc-card{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:1.1cqw;padding:1cqw 1.2cqw;background:#0b1a2b;border:1px solid #2a4560;border-radius:1cqw;box-shadow:0 0 1.4cqw #000a}
.sc-dom{background:#0d1d30c8;backdrop-filter:blur(3px);border-color:#3b5a73}.sc-top{background:#08121e;border:0;box-shadow:none;justify-content:center;gap:1.4cqw;font-size:1.25cqw;color:#e8eef5;font-weight:600}.sc-top i{width:1px;height:55%;background:#3b5a73}
.sc-ic{flex:none;width:3.6cqw;height:3.6cqw;border-radius:50%;display:grid;place-items:center;font-size:2cqw}.sc-ic.y{background:#3a2f0a}.sc-ic.g{background:#0d3a22}.sc-ic.b{background:#0f2c4d}.sc-ic.r{background:#3a1218}.sc-ic.o{background:#3a250a}
.sc-tx{min-width:0;line-height:1.15}.sc-lab{font-size:1.25cqw;font-weight:700;color:#f1f5f9}.sc-val{font-size:2.2cqw;font-weight:700;color:#fff;margin:.2cqw 0}.sc-sub{font-size:1.15cqw;color:#cbd5e1;white-space:nowrap}.sc-sm{font-size:.85cqw;color:#cbd5e1;margin-top:.3cqw}
.ov-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:14px}
.ov-tile{display:flex;align-items:center;gap:14px;background:linear-gradient(150deg,#0f2236,#0b1a2b);border:1px solid #1f3d5c;border-radius:14px;padding:14px 16px;box-shadow:0 0 12px #2a8cff14}
.ov-ic{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:26px}.ov-ic.y{background:#3a2f0a}.ov-ic.g{background:#0d3a22}.ov-ic.b{background:#0f2c4d}.ov-ic.r{background:#3a1218}.ov-ic.o{background:#3a250a}
.ov-lab{font-size:14px;font-weight:600;color:#e8eef5;display:flex;align-items:center}.ov-val{font-size:27px;font-weight:700;color:#fff;line-height:1.2}.ov-sub{font-size:14px;color:#cbd5e1}
.ov-box{background:linear-gradient(150deg,#0f2236d9,#0b1a2bd9);backdrop-filter:blur(2px);border:1px solid #1f3d5c;border-radius:14px;padding:14px 18px;min-width:0}.ov-h{font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.ov-mut{color:#8fa6bd;font-size:13px;font-weight:400}.ov-row{display:flex;justify-content:space-between;gap:12px;padding:5px 10px;font-size:15px;color:#e2e8f0;border-radius:6px}.ov-row:nth-child(even){background:#ffffff06}.ov-row b{font-weight:600}
.ov-3{display:grid;grid-template-columns:1fr 1.3fr 1.2fr;gap:12px;margin-bottom:14px}.ov-mid{display:grid;grid-template-columns:1fr 1.75fr 1.1fr;gap:12px;margin-bottom:14px}.ov-bot{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:12px}
.ov-ac{display:grid;grid-template-columns:110px 1fr 54px;align-items:center;gap:12px;padding:9px 0;font-size:15px;color:#e2e8f0}.ov-ac b{text-align:right}.ov-bar{height:14px;border-radius:7px;background:#1e3347;overflow:hidden}.ov-bar i{display:block;height:100%;border-radius:7px;box-shadow:0 0 10px #3ee07a88}
.ov-prof .ov-ax{fill:#cbd5e1;font-size:11px}.ov-leg{display:flex;justify-content:center;gap:18px;font-size:13px;color:#e2e8f0;margin-top:4px}.ov-leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.pf-mode{margin-left:auto;display:inline-flex;align-items:center;gap:8px;border:1px solid #1f3d5c;background:#0f2236;border-radius:12px;padding:8px 14px;font-size:14px;color:#cbd5e1;white-space:nowrap}.pf-mode b{color:#fff}
@media(max-width:1100px){.ov-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.ov-3,.ov-mid,.ov-bot{grid-template-columns:1fr}}
@media(max-width:700px){.ov-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ov-tile{padding:10px;gap:10px}.ov-ic{width:38px;height:38px;font-size:19px}.ov-val{font-size:20px}.sc-sm{display:none}.pf-mode{margin-left:0}}
.pw-svg .pw-pane{fill:#0e2234;fill-opacity:.55;stroke:#1d3a55}.pw-svg .pw-ic{fill:#13314c;stroke:#2b5b86}.pw-svg .pw-ict{font-size:17px}.pw-svg .pw-pt{fill:#e8eef5;font-size:14.5px;font-weight:700}.pw-svg .pw-pu{fill:#8fa6bd;font-size:11.5px}
.pw-svg .cl{stroke:#e8eef5;stroke-dasharray:4 4;stroke-width:1.5}.fc-tip i.d{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle}
.pw-plot .fc-tip{min-width:290px;border-color:#3b5a73;border-radius:12px;font-size:14px;padding:11px 14px}.pw-plot .fc-tip div{margin-top:4px}
.pw-legend .pw-lg{border-radius:20px;padding:6px 14px;background:#0e2234}
.pf-brand img.brand{height:64px;width:auto;display:block;margin:-6px 4px -6px 0;flex:none}@media(max-width:700px){.pf-brand img.brand{height:44px}}
:host{display:block;--bg:#06111b;--card1:#0c1f2e;--card2:#081826;--line:#14293a;--txt:#eaf2f9;--mut:#9bb3c6;--mut2:#6f8ba1;--o:#ffaa22;--g:#1fe090;--b:#3d8dff;--r:#ff4757;--v:#a78bfa;color:var(--txt);font-family:var(--paper-font-body1_-_font-family,Roboto),Roboto,"Segoe UI",Arial,sans-serif}
*{box-sizing:border-box}
.pf{min-height:100vh;background:var(--bg);padding:16px 18px 30px;position:relative;isolation:isolate}
.pf-bg{position:fixed;inset:-20px;z-index:-1;background-size:cover;background-position:center 35%;filter:blur(5px) brightness(.34) saturate(1.15);pointer-events:none}
.wrap{max-width:1600px;margin:0 auto}
.pf-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.pf-brand{display:flex;align-items:center;gap:14px}.pf-brand h1{font-size:26px;margin:0;font-weight:700;letter-spacing:-.4px}.pf-sub{color:var(--mut);font-size:13px;margin-top:3px}
.logo{width:54px;height:54px;border-radius:14px;display:grid;place-items:center;font-size:28px;background:linear-gradient(135deg,#1f6bff,#14d9a0);box-shadow:0 4px 14px #1f6bff44}
.tabs{display:flex;gap:8px;flex-wrap:wrap}
.btn,.tab{all:unset;box-sizing:border-box;cursor:pointer;height:38px;padding:0 14px;border-radius:9px;border:1px solid #1d3a54;background:#0c1f30;color:var(--txt);font-size:13.5px;display:inline-grid;place-items:center;white-space:nowrap}
.btn:hover,.tab:hover{border-color:#3a77b8}.tab.on,.btn.on,.btn.pri{background:#2a8cff;border-color:#2a8cff;color:#fff;font-weight:600;box-shadow:0 0 14px #2a8cff55}
.btn[disabled]{opacity:.35;cursor:default}.btn.ok{background:#11a86a;border-color:#11a86a;box-shadow:0 0 14px #1fe09055;color:#fff;font-weight:700}.btn.off{background:#3a2128;border-color:#6b2a36;color:#ffb3bd;font-weight:700}
.box{background:linear-gradient(150deg,#0c1f2ed9,#081826d9);backdrop-filter:blur(2px);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:14px;min-width:0;position:relative}
.box.lock{border-color:#6b2a36;background:linear-gradient(150deg,#1d1219,#120c11)}
.box.err{border-color:#6b2a36;color:#ffb3bd}.box.warn{border-color:#6b4f12;color:#ffd58a}
.h{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}.h>span:first-child{font-size:15.5px;font-weight:700;display:flex;align-items:center;gap:8px}
.sec{display:flex;align-items:center;gap:12px;margin:22px 0 12px;font-size:19px;font-weight:700}.sec .ic{width:40px;height:40px}
.g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:14px}.g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:14px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:12px}
.tile{border:1px solid #17304a;border-radius:12px;background:linear-gradient(150deg,#0d2131,#0a1a27);padding:12px 14px;display:flex;gap:12px;align-items:flex-start;min-width:0}
.ic{flex:0 0 auto;display:grid;place-items:center;width:42px;height:42px;border-radius:12px;font-size:20px}
.ic-o{color:#ffaa22;background:linear-gradient(145deg,#3a2c12,#271f12)}.ic-g{color:#1fe090;background:linear-gradient(145deg,#0c3a2c,#0a2a22)}.ic-b{color:#3d8dff;background:linear-gradient(145deg,#0e2f63,#0b2246)}.ic-r{color:#ff4757;background:linear-gradient(145deg,#3c1820,#2a141a)}.ic-v{color:#a78bfa;background:linear-gradient(145deg,#2a2150,#1c1838)}
.lab{font-size:12.5px;color:var(--mut)}.val{font-size:24px;font-weight:800;letter-spacing:-.3px;line-height:1.15}.sub{font-size:12.5px;color:var(--mut2);margin-top:2px}
.t-g{color:var(--g)}.t-r{color:var(--r)}.t-o{color:var(--o)}.t-b{color:var(--b)}
.row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #12283a;font-size:13.5px}
.pill{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid #1d3a54;background:#0c1f30}
.pill.g{color:#1fe090;border-color:#14533c}.pill.o{color:#ffaa22;border-color:#5a4114}.pill.b{color:#7fb3ff;border-color:#1f4d86}.pill.r{color:#ff8c97;border-color:#6b2a36}
.ti{position:relative;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#3d8dff;color:#fff;font:700 13px/1 Georgia,serif;font-style:italic;cursor:help;flex:0 0 auto;margin-left:6px;vertical-align:middle;box-shadow:0 0 8px #3d8dff66}
.ti .tt{display:none;position:absolute;z-index:20;left:50%;top:28px;transform:translateX(-50%);width:320px;max-width:80vw;background:#0d1c2a;border:1px solid #2b4459;border-radius:10px;padding:10px 12px;font:400 12.5px/1.5 Roboto,sans-serif;font-style:normal;color:var(--txt);box-shadow:0 8px 20px #0009;text-align:left}
.ti:hover .tt,.ti:focus .tt{display:block}
label.f{display:flex;align-items:center;font-size:12.5px;color:var(--mut);margin-bottom:5px;min-height:22px}
.inp{display:flex;border:1px solid #1d3a54;border-radius:9px;overflow:hidden;background:#091826}
.inp input{flex:1;min-width:0;border:0;background:transparent;color:var(--txt);padding:8px 10px;font-size:14px}.inp span{padding:8px 10px;border-left:1px solid #1d3a54;color:var(--mut);font-size:12px;background:#0c1f30}
.inp.chg{border-color:#2a8cff;box-shadow:0 0 8px #2a8cff44}.inp.pend,select.pend{border-color:#ffaa22;box-shadow:0 0 8px #ffaa2255}.inp.bad,select.bad{border-color:#ff4757;box-shadow:0 0 8px #ff475766}.sw.pend{color:var(--o)}.sw.bad{color:#ff8c97}
.toasts{position:fixed;right:16px;bottom:16px;z-index:200;display:flex;flex-direction:column;gap:8px;max-width:420px}
.toast{position:relative;padding:12px 34px 12px 14px;border-radius:12px;font-size:13px;line-height:1.45;cursor:pointer;box-shadow:0 10px 30px #000b;border:1px solid}
.toast b{display:block;font-size:14px;margin-bottom:3px}.toast div{color:#d7e4ee}.toast .x{position:absolute;top:8px;right:12px;opacity:.6}
.toast.ok{background:#0b2a20;border-color:#14533c;color:#1fe090}.toast.err{background:#2a1218;border-color:#6b2a36;color:#ff8c97}.inp.act{border-color:#1fe090}.inp.lk{border-color:#a8323f}
select{width:100%;padding:8px;border-radius:9px;background:#091826;color:var(--txt);border:1px solid #1d3a54}
input[type=range]{width:100%;accent-color:#2a8cff}
.btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.sw{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;min-height:38px}
.tg{width:36px;height:20px;border-radius:10px;background:#29435a;position:relative;flex:none}.tg::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#cfe0ee}.tg.on{background:#2a8cff}.tg.on::after{left:19px;background:#fff}
.tbl{width:100%;border-collapse:collapse;font-size:13px}.tbl th{color:var(--mut);font-weight:500;text-align:left;padding:7px 6px;border-bottom:1px solid #1d3a54}.tbl td{padding:7px 6px;border-top:1px solid #12283a;vertical-align:top}.tbl .r{text-align:right}
.note{font-size:12.5px;color:var(--mut2);margin:10px 0 0}
.fc-plot{position:relative}.fc-svg{display:block;width:100%;height:auto}.fc-svg text{fill:#c3d1dc;font-size:13px}.fc-svg .unit{font-size:12px;fill:#8fadc4}
.fc-svg .grid{stroke:#173044}.fc-svg .vgrid{stroke:#11273a;stroke-dasharray:3 4}.fc-svg .zero{stroke:#2b5470;stroke-width:1.2}.fc-svg .cl{stroke:#e8f1f8;stroke-dasharray:4 4;stroke-width:1.2}
.fc-tip{position:absolute;top:-6px;transform:translateX(-50%);background:#0d1c2a;border:1px solid #2b4459;border-radius:9px;padding:9px 12px;font-size:12.5px;pointer-events:none;box-shadow:0 8px 20px #0007;min-width:220px;z-index:5}
.fc-tip .tt2{font-weight:700;margin-bottom:5px}.fc-tip div{display:flex;justify-content:space-between;gap:12px;margin-top:2px}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--mut);margin-top:6px}.legend b{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.pw-legend{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px}.pw-lg{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;color:var(--mut2);padding:4px 10px;border:1px solid #1d3a55;border-radius:20px;background:transparent;cursor:pointer}.pw-lg.off{opacity:.35}.pw-lg i{width:14px;height:4px;border-radius:2px}
.pw-svg .grid{stroke:#1a3246}.pw-svg .vgrid{stroke:#14293a;stroke-dasharray:none}.pw-svg .zero{stroke:#3b5a73;stroke-width:1.2}.pw-svg .ax,.pw-svg .xl,.pw-svg .unit{fill:var(--mut);font-size:13px}.pw-svg .pw-pax{fill:#00f5ff;opacity:.85}.pw-svg .pw-sax{fill:#3b8cff;opacity:.55;font-size:11px}
.pw-svg .pw-night{fill:#3b8cff;opacity:.09}.pw-svg .pw-zt{fill:#7fa6d6;font-size:11px}.pw-svg .pw-pn{fill:#9fb0c3;font-size:12px}.pw-svg .pw-hint{fill:#5f7a99;font-size:11px}.pw-svg .nowl{stroke:#c9d7e2;stroke-dasharray:3 3;opacity:.6}.pw-svg .nowt{fill:#c9d7e2;font-size:12px}
.nohist{color:#58778c;text-align:center;padding:40px;font-size:13px}
.ctrl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.date{display:flex;align-items:center;gap:8px;height:38px;padding:0 10px;border:1px solid #2a4f70;border-radius:9px;background:#0c1f30}.date input{background:transparent;border:0;color:var(--txt);color-scheme:dark;font-size:13.5px}
.log{font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:pre-wrap;background:#06121c;border:1px solid #14293a;border-radius:10px;padding:10px;max-height:60vh;overflow:auto;color:#cfe0ee}
.anchor{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.scroll-hint{display:none;font-size:11.5px;color:var(--mut2);margin:-4px 0 6px}
.menu{display:none}.w140{width:140px}.wflt{width:260px}.wbuy{width:160px}.ms{display:flex;gap:8px;align-items:flex-end}
.pf-head.mob .menu{all:unset;box-sizing:border-box;display:grid;place-items:center;width:42px;height:42px;border-radius:10px;border:1px solid #1d3a54;background:#0c1f30;font-size:20px;cursor:pointer;flex:none}
/* ---------- telefon ---------- */
@media(max-width:700px){
  .pf{padding:0 8px 28px}
  .pf-head{position:sticky;top:0;z-index:30;margin:0 -8px 12px;padding:8px 8px 6px;gap:8px;background:#06111bee;backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
  .pf-brand{gap:10px;width:100%;min-width:0}.pf-brand h1{font-size:20px}.pf-sub{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pf-brand>div:last-child{min-width:0}
  .logo{width:40px;height:40px;font-size:21px;border-radius:11px;flex:none}
  .tabs{flex-wrap:nowrap;overflow-x:auto;width:100%;scrollbar-width:none;gap:6px}.tabs::-webkit-scrollbar{display:none}.tab{flex:1 0 auto;height:40px;padding:0 9px;font-size:13px}
  .btn{height:42px}
  .box{padding:12px;border-radius:13px;margin-bottom:10px}
  .g2,.g3{gap:10px}.sec{font-size:17px;margin:16px 0 10px}
  .tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .tile{padding:10px;gap:8px}.tile .ic{width:32px;height:32px;font-size:16px;border-radius:9px}.val{font-size:18px}.lab,.sub{font-size:11.5px}
  .inp input,select,.date input{font-size:16px}
  .ctrl{gap:6px}.ctrl>.date{flex:1 1 140px}.ctrl>.btn{flex:1 0 auto}
  .ms{width:100%}.ms>div{flex:1;min-width:0}.wbuy,.w140,.wflt{width:auto}.ctrl>.raw{flex:1 1 45%}
  .gap{display:none}.ctrl>.btn.full{flex:1 1 100%}
  .h>.ctrl{width:100%}
  .btns .btn{flex:1}
  /* (i) na telefonie: dymek jako plansza na dole ekranu */
  .ti{width:24px;height:24px}
  .ti .tt{position:fixed;left:8px;right:8px;top:auto;bottom:8px;transform:none;width:auto;max-width:none;max-height:60vh;overflow:auto;z-index:100;font-size:13.5px;padding:12px 14px;box-shadow:0 -6px 30px #000c}
  /* wykresy: dymek pod wykresem, przesuwanie palcem w poziomie = kursor */
  .fc-svg{touch-action:pan-y}
  .fc-tip{position:static;transform:none;min-width:0;margin-top:6px;box-shadow:none;color:var(--mut)}
  .fc-tip .tt2{color:var(--txt)}.fc-tip b{color:var(--txt)}
  .pw-legend{gap:5px}.pw-lg{font-size:12px;padding:5px 9px}
  .legend{gap:10px}
  /* tabele .rt -> karty: wiersz = karta, kolumna = "etykieta: wartosc" */
  table.rt,.rt tbody,.rt tr,.rt td{display:block;width:100%}
  .rt tr:first-child{display:none}
  .rt tr{border:1px solid #17304a;border-radius:11px;padding:6px 10px;margin-bottom:8px;background:#0a1a27}
  .rt td{border:0;padding:5px 0;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:right}
  .rt td[data-l]::before{content:attr(data-l);color:var(--mut);font-size:12px;text-align:left;flex:none;max-width:45%}
  .rt td>.inp,.rt td>div{flex:0 1 60%;min-width:0}.rt td.wide{display:block;text-align:left}.rt td.wide::before{display:block;margin-bottom:4px}
  .rt td.hd{font-weight:700;justify-content:flex-start;text-align:left;border-bottom:1px solid #17304a;margin-bottom:2px}
  .scroll-hint{display:block}.tbl td a{white-space:nowrap}
  .log{font-size:11px;max-height:55vh}
  .toasts{left:8px;right:8px;bottom:8px;max-width:none}
}
`;
