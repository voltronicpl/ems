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

// Wykres w stylu PGE. rows: [{t: Date, ...}], bars/lines: [{k, c, name, unit, axis:"r"}]
let CH = 0;
export function chart({ rows, bars = [], lines = [], hlines = [], zones = true, now = true, h = 260, unit = "kWh", runit = "", tipf }) {
  if (!rows.length) return `<div class="nohist">Brak danych</div>`;
  const id = "c" + (++CH), W = 1000, P = { l: 52, r: runit ? 52 : 14, t: 14, b: 26 }, iw = W - P.l - P.r, ih = h - P.t - P.b, n = rows.length, bw = iw / n;
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
  rows.forEach((r, i) => { const d = r.t; if (d.getMinutes() === 0 && d.getHours() % 3 === 0) g += `<line class="vgrid" x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${P.t + ih}"/><text x="${x(i)}" y="${h - 8}" text-anchor="middle">${d.getHours() === 0 ? d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" }) : String(d.getHours()).padStart(2, "0")}</text>`; });
  const nb = bars.length || 1, gap = bw > 6 ? bw * 0.12 : 0, sw = (bw - gap) / nb;
  rows.forEach((r, i) => bars.forEach((b, j) => { const v = (b.sign || 1) * (r[b.k] || 0); if (!v) return; const y0 = y(0), y1 = y(v); g += `<rect x="${x(i) + gap / 2 + j * sw}" y="${Math.min(y0, y1)}" width="${Math.max(sw, 0.8)}" height="${Math.max(Math.abs(y1 - y0), 0.5)}" rx="1.5" fill="${typeof b.c === "function" ? b.c(r) : b.c}"/>`; }));
  hlines.forEach(l => g += `<line x1="${P.l}" x2="${W - P.r}" y1="${ry(l.v)}" y2="${ry(l.v)}" stroke="${l.c}" stroke-dasharray="6 5" stroke-width="1.3"/><text x="${W - P.r - 4}" y="${ry(l.v) - 4}" text-anchor="end" fill="${l.c}" style="fill:${l.c}">${l.name}</text>`);
  lines.forEach(l => { const f = l.axis === "r" ? ry : y; const pts = rows.map((r, i) => r[l.k] == null ? null : `${x(i) + bw / 2},${f(r[l.k])}`); let d = "", on = false; pts.forEach(p => { if (!p) { on = false; return; } d += (on ? "L" : "M") + p; on = true; }); g += `<path d="${d}" fill="none" stroke="${l.c}" stroke-width="${l.w || 2.2}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ""}/>`; });
  if (now) { const t = Date.now(), i = rows.findIndex(r => r.t.getTime() > t); if (i > 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${P.t + ih}" stroke="#fff" stroke-width="1.5"/><text x="${x(i) + 4}" y="${P.t + 12}" style="fill:#fff">teraz</text>`; }
  const legend = [...bars, ...lines].map(s => `<span><b style="background:${typeof s.c === "function" ? s.lc || "#888" : s.c}"></b>${s.name}</span>`).join("");
  CHARTS[id] = { rows, P, bw, W, tipf };
  return `<div class="fc-plot" data-chart="${id}"><svg class="fc-svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none">${g}<line class="cl" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" style="display:none"/></svg><div class="fc-tip" style="display:none"></div></div><div class="legend">${legend}</div>`;
}
const CHARTS = {};
export function bindCharts(root) {
  root.querySelectorAll("[data-chart]").forEach(el => {
    const c = CHARTS[el.dataset.chart]; if (!c) return;
    const svg = el.querySelector("svg"), cl = svg.querySelector(".cl"), tp = el.querySelector(".fc-tip");
    svg.onmousemove = e => {
      const b = svg.getBoundingClientRect(), xs = (e.clientX - b.left) / b.width * c.W, i = Math.floor((xs - c.P.l) / c.bw);
      if (i < 0 || i >= c.rows.length) { cl.style.display = tp.style.display = "none"; return; }
      const cx = c.P.l + (i + 0.5) * c.bw; cl.setAttribute("x1", cx); cl.setAttribute("x2", cx); cl.style.display = "";
      tp.innerHTML = c.tipf ? c.tipf(c.rows[i]) : ""; tp.style.display = ""; tp.style.left = Math.min(Math.max(cx / c.W * 100, 12), 88) + "%";
    };
    svg.onmouseleave = () => { cl.style.display = tp.style.display = "none"; };
  });
}

export const CSS = `
:host{display:block;--bg:#06111b;--card1:#0c1f2e;--card2:#081826;--line:#14293a;--txt:#eaf2f9;--mut:#9bb3c6;--mut2:#6f8ba1;--o:#ffaa22;--g:#1fe090;--b:#3d8dff;--r:#ff4757;--v:#a78bfa;color:var(--txt);font-family:var(--paper-font-body1_-_font-family,Roboto),Roboto,"Segoe UI",Arial,sans-serif}
*{box-sizing:border-box}
.pf{min-height:100vh;background:radial-gradient(ellipse at 40% -10%,#0b2233 0%,var(--bg) 60%);padding:16px 18px 30px}
.wrap{max-width:1600px;margin:0 auto}
.pf-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.pf-brand{display:flex;align-items:center;gap:14px}.pf-brand h1{font-size:26px;margin:0;font-weight:700;letter-spacing:-.4px}.pf-sub{color:var(--mut);font-size:13px;margin-top:3px}
.logo{width:54px;height:54px;border-radius:14px;display:grid;place-items:center;font-size:28px;background:linear-gradient(135deg,#1f6bff,#14d9a0);box-shadow:0 4px 14px #1f6bff44}
.tabs{display:flex;gap:8px;flex-wrap:wrap}
.btn,.tab{all:unset;box-sizing:border-box;cursor:pointer;height:38px;padding:0 14px;border-radius:9px;border:1px solid #1d3a54;background:#0c1f30;color:var(--txt);font-size:13.5px;display:inline-grid;place-items:center;white-space:nowrap}
.btn:hover,.tab:hover{border-color:#3a77b8}.tab.on,.btn.on,.btn.pri{background:#2a8cff;border-color:#2a8cff;color:#fff;font-weight:600;box-shadow:0 0 14px #2a8cff55}
.btn[disabled]{opacity:.35;cursor:default}.btn.ok{background:#11a86a;border-color:#11a86a;box-shadow:0 0 14px #1fe09055;color:#fff;font-weight:700}.btn.off{background:#3a2128;border-color:#6b2a36;color:#ffb3bd;font-weight:700}
.box{background:linear-gradient(150deg,var(--card1),var(--card2));border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:14px;min-width:0;position:relative}
.box.lock{border-color:#6b2a36;background:linear-gradient(150deg,#1d1219,#120c11)}
.box.err{border-color:#6b2a36;color:#ffb3bd}.box.warn{border-color:#6b4f12;color:#ffd58a}
.h{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}.h>span:first-child{font-size:15.5px;font-weight:700;display:flex;align-items:center;gap:8px}
.sec{display:flex;align-items:center;gap:12px;margin:22px 0 12px;font-size:19px;font-weight:700}.sec .ic{width:40px;height:40px}
.g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
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
.inp.chg{border-color:#2a8cff;box-shadow:0 0 8px #2a8cff44}.inp.act{border-color:#1fe090}.inp.lk{border-color:#a8323f}
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
.nohist{color:#58778c;text-align:center;padding:40px;font-size:13px}
.ctrl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.date{display:flex;align-items:center;gap:8px;height:38px;padding:0 10px;border:1px solid #2a4f70;border-radius:9px;background:#0c1f30}.date input{background:transparent;border:0;color:var(--txt);color-scheme:dark;font-size:13.5px}
.log{font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:pre-wrap;background:#06121c;border:1px solid #14293a;border-radius:10px;padding:10px;max-height:60vh;overflow:auto;color:#cfe0ee}
.anchor{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap}
@media(max-width:600px){.pf{padding:10px}.val{font-size:20px}.ti .tt{width:260px}}
`;
