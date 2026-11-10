// Profil mocy (Przeglad) wg wzoru uzytkownika: okno teraz ±12 h ("teraz" na srodku), pomiar co 1 min linia ciagla,
// prognoza (to, co sie jeszcze nie wydarzylo) linia przerywana; klik -> modal "Prognoza vs rzeczywistosc".
import { fmt, esc } from "./core.js";
import { ic } from "./icons.js";
import { range, nowWindow, dayWindow } from "./minute.js";
import { slots, kw, dayData } from "./forecast.js";
import { bands, MC } from "./manual.js";
import { BUYSELL } from "./core.js";

const W = 900, H = 330, L = 64, R = 46, T = 16, B = 34;
const SER = [["pv", "#facc15", "PV"], ["bat", "#22e07a", "Bateria"], ["grid", "#ff4d5e", "Sieć"], ["dom", "#1e9bff", "Dom"], ["soc", "#a78bfa", "SOC (bateria)"]];
const OFF = {};
const st = { hover: null, open: false, day: null };
let cur = null;

// pomiar: bateria + ladowanie (= −bateria_moc), siec − pobor (= −siec_moc)
const disp = r => ({ t: r.t, pv: r.pv, dom: r.dom, bat: r.bat == null ? null : -r.bat, grid: r.grid == null ? null : -r.grid, soc: r.soc });
const sma = (a, k, n = 5) => a.map((r, i) => { let s = 0, m = 0; for (let j = Math.max(0, i - n); j <= Math.min(a.length - 1, i + n); j++) { const v = a[j][k]; if (v != null) { s += v; m++; } } return a[i][k] == null ? null : s / m; });

export function profile(c) {
  const w = nowWindow(12), meas = range(c, w.t0, w.t0 + 24 * 36e5).map(disp), sm = slots(c, w.t0, w.t1);
  const fc = []; for (let t = Math.max(w.now, w.t0) - (w.now % 6e4); t < w.t1; t += 6e4) { const k = kw(sm.get(Math.floor(t / 9e5) * 9e5)); fc.push(k ? { t, ...k } : { t }); }
  const X = t => L + (t - w.t0) / (w.t1 - w.t0) * (W - L - R);
  const all = [...meas, ...fc].flatMap(r => ["pv", "bat", "grid", "dom"].filter(k => !OFF[k]).map(k => Math.abs(r[k] || 0)));
  const top = Math.max(2.5, Math.ceil(Math.max(0, ...all) / 2.5) * 2.5), Y = v => T + (top - v) / (2 * top) * (H - T - B), YS = p => T + (100 - p) / 100 * (H - T - B);
  const stp = top <= 5 ? 1 : top <= 10 ? 2.5 : 5;
  let g = `<defs>${SER.map(([k, col]) => `<linearGradient id="pf-${k}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset=".5" stop-color="${col}" stop-opacity=".08"/><stop offset="1" stop-color="${col}" stop-opacity=".45"/></linearGradient>`).join("")}<filter id="pf-gl"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  for (let v = -top; v <= top + 1e-9; v += stp) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="pf-grid${Math.abs(v) < 1e-9 ? " z" : ""}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" class="pf-ax">${fmt(v, 1)}</text>`;
  for (const p of [0, 50, 100]) g += `<text x="${W - R + 6}" y="${YS(p) + 4}" class="pf-ax" style="fill:#a78bfa">${p}%</text>`;
  for (let t = Math.ceil(w.t0 / 108e5) * 108e5; t <= w.t1; t += 108e5) { const d = new Date(t); g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H - B}" class="pf-grid"/><text x="${X(t)}" y="${H - 12}" text-anchor="middle" class="pf-ax">${String(d.getHours()).padStart(2, "0")}:00</text>`; }
  g += `<text transform="translate(16 ${(H - B + T) / 2}) rotate(-90)" text-anchor="middle" class="pf-yl">Moc [kW]</text>`;
  // kolumny kupna / sprzedazy przez cala wysokosc (delikatne): reczne zlecenia + plan EMS do przodu; bez napisow (szczegoly w dymku)
  const colr = (a, e, k) => { if (e - a > 0.5) g += `<rect x="${a.toFixed(1)}" y="${T}" width="${Math.max(e - a, 1.5).toFixed(1)}" height="${H - T - B}" fill="${BUYSELL[k]}" opacity=".075"/>`; };
  for (const b of bands(w.t0, w.t1)) { const a = Math.max(L, X(b.a)), e = Math.min(W - R, X(b.b)); colr(a, e, b.typ === "sprzedaj" ? "sprzedaj" : "kup"); }
  for (let t = Math.floor(Math.max(w.now, w.t0) / 9e5) * 9e5; t < w.t1; t += 9e5) { const a = (sm.get(t) || {}).action, k = a === "charge" ? "kup" : a === "sell" ? "sprzedaj" : null; if (k) colr(Math.max(L, X(Math.max(t, w.now))), Math.min(W - R, X(t + 9e5)), k); }
  const path = (rows, k, y) => { let d = "", on = false; rows.forEach(r => { const v = r[k]; if (v == null) { on = false; return; } d += `${on ? "L" : "M"}${X(r.t).toFixed(1)} ${y(v).toFixed(1)}`; on = true; }); return d; };
  const smr = ["pv", "bat", "grid", "dom", "soc"].reduce((o, k) => { const s = sma(meas, k, k === "soc" ? 0 : 4); meas.forEach((r, i) => { (o[i] = o[i] || { t: r.t })[k] = s[i]; }); return o; }, []);
  for (const [k, col] of SER) { if (OFF[k]) continue; const y = k === "soc" ? YS : Y;
    const d = path(smr, k, y), f = path(fc, k, y);
    if (d && k !== "soc") g += d.split("M").filter(Boolean).map(q => { const pts = q.split("L"), x0 = pts[0].split(" ")[0], x1 = pts[pts.length - 1].split(" ")[0]; return `<path d="M${q}L${x1} ${Y(0)}L${x0} ${Y(0)}Z" fill="url(#pf-${k})"/>`; }).join("");
    if (d) g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${k === "soc" ? 1.8 : 2.4}" stroke-linejoin="round" filter="url(#pf-gl)"/>`;
    if (f) g += `<path d="${f}" fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="6 5" opacity=".85"/>`; }
  g += `<line x1="${X(w.now)}" x2="${X(w.now)}" y1="${T}" y2="${H - B}" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4 4"/><text x="${X(w.now) + 5}" y="${H - B - 6}" class="pf-ax">teraz</text>`;
  cur = { w, meas, fc, X, Y, YS };
  const last = meas.length ? meas[meas.length - 1] : {};
  const leg = SER.map(([k, col, n]) => `<button class="pf-lg${OFF[k] ? " off" : ""}" data-pflg="${k}"><i style="background:${col}"></i>${n}</button>`).join("");
  return `<div class="pf-wrap" data-prof><svg viewBox="0 0 ${W} ${H}" width="100%" class="pf-svg">${g}<line class="pcl" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#fff" stroke-width="1.4" stroke-dasharray="5 4" style="display:none"/><g class="pdots"></g></svg><div class="pf-tip" style="display:none"></div></div>
    <div class="pf-foot"><div class="pf-legs">${leg}<span class="pf-dash">┄ prognoza</span></div><div class="pf-soc">${ic("battery", 18)} SOC: <b>${fmt(last.soc, 0, "%")}</b></div></div>`;
}

function tip(box, t) {
  const l = box.querySelector(".pcl"), tp = box.querySelector(".pf-tip"), dots = box.querySelector(".pdots");
  if (!cur || t == null || t < cur.w.t0 || t >= cur.w.t1) { l.style.display = tp.style.display = "none"; dots.innerHTML = ""; return; }
  const past = t <= cur.w.now, src = past ? cur.meas : cur.fc, r = src.find(x => x.t <= t && t < x.t + 6e4) || src[src.length - 1] || {};
  const x = cur.X(t); l.setAttribute("x1", x); l.setAttribute("x2", x); l.style.display = "";
  dots.innerHTML = SER.filter(([k]) => !OFF[k] && r[k] != null).map(([k, col]) => `<circle cx="${x}" cy="${(k === "soc" ? cur.YS : cur.Y)(r[k])}" r="5" fill="${col}" stroke="#fff" stroke-width="1.5"/>`).join("");
  const sg = v => (v > 0 ? "+" : "") + fmt(v, 2) + " kW", pf = past ? "" : ` <span class="pf-pr">(prognoza)</span>`;
  const row = (col, txt) => `<div><i style="background:${col}"></i>${txt}</div>`;
  tp.innerHTML = `<div class="pf-th">${ic("clock", 18)} <b>${new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</b>${pf}</div>`
    + (r.pv != null ? row("#facc15", `PV: ${fmt(r.pv, 2)} kW`) : "")
    + (r.bat != null ? row("#22e07a", `Bateria: ${sg(r.bat)} ${r.bat > 0.02 ? "(ładowanie)" : r.bat < -0.02 ? "(rozładowanie)" : ""}`) : "")
    + (r.grid != null ? row("#ff4d5e", `Sieć: ${sg(r.grid)} ${r.grid < -0.02 ? "(pobór)" : r.grid > 0.02 ? "(oddawanie)" : ""}`) : "")
    + (r.dom != null ? row("#1e9bff", `Dom: ${fmt(r.dom, 2)} kW`) : "")
    + (r.soc != null ? row("#a78bfa", `SOC: ${fmt(r.soc, 0, "%")}`) : "")
    + bands(t, t + 6e4).map(b => `<div style="color:${MC[b.typ]}">● ${esc(b.txt)}</div>`).join("");
  tp.style.display = ""; const bw = box.clientWidth, px = x / W * bw;
  tp.style.left = (px + 14 + tp.offsetWidth > bw ? Math.max(px - tp.offsetWidth - 14, 0) : px + 14) + "px";
}

export function bindProfile(c, r) {
  r.querySelectorAll("[data-pflg]").forEach(b => b.onclick = () => { OFF[b.dataset.pflg] = !OFF[b.dataset.pflg]; c.render(true); });
  r.querySelectorAll("[data-pfopen]").forEach(b => b.onclick = () => { st.open = true; st.day = st.day || new Date().toLocaleDateString("sv-SE"); c._hold = true; c.render(true); });
  r.querySelectorAll("[data-pfclose]").forEach(b => b.onclick = e => { if (e.target !== b) return; st.open = false; c._hold = false; c.render(true); });
  r.querySelectorAll("[data-pfday]").forEach(b => b.onclick = () => { const d = new Date(st.day); d.setDate(d.getDate() + +b.dataset.pfday); if (d <= new Date()) st.day = d.toLocaleDateString("sv-SE"); c.render(true); });
  r.querySelectorAll("[data-prof]").forEach(box => {
    const svg = box.querySelector("svg"), at = ev => { const p = ev.touches ? ev.touches[0] : ev, b = svg.getBoundingClientRect(), x = (p.clientX - b.left) / b.width * W;
      return cur ? Math.floor((cur.w.t0 + (x - L) / (W - L - R) * (cur.w.t1 - cur.w.t0)) / 6e4) * 6e4 : null; };
    const mv = ev => { st.hover = at(ev); c._hold = true; tip(box, st.hover); };
    svg.addEventListener("mousemove", mv); svg.addEventListener("touchstart", mv, { passive: true }); svg.addEventListener("touchmove", mv, { passive: true });
    svg.addEventListener("mouseleave", () => { st.hover = null; c._hold = st.open; tip(box, null); });
    svg.addEventListener("touchend", () => { c._hold = st.open; });
    svg.addEventListener("click", ev => { if (ev.pointerType === "touch" || ev.sourceCapabilities?.firesTouchEvents) return; st.open = true; st.day = new Date().toLocaleDateString("sv-SE"); c._hold = true; c.render(true); });
    if (st.hover != null) tip(box, st.hover);
  });
}

// ---- modal: prognoza vs rzeczywistosc (godzinowo) ----
export function accuracyModal(c) {
  if (!st.open) return "";
  const dw = dayWindow(new Date(st.day + "T00:00")), meas = range(c, dw.t0, dw.t1).map(disp), sm = slots(c, dw.t0, dw.t1), dd = dayData(c, st.day);
  const H = [];
  for (let h = 0; h < 24; h++) { const a = dw.t0 + h * 36e5, b = a + 36e5; if (a > Date.now()) break;
    const ms = meas.filter(r => r.t >= a && r.t < b), done = b <= Date.now(), kwh = k => ms.reduce((s, r) => s + (r[k] || 0), 0) / 60;
    const pos = k => ms.reduce((s, r) => s + Math.max(0, r[k] || 0), 0) / 60;
    const fs = [0, 1, 2, 3].map(i => sm.get(a + i * 9e5)).filter(Boolean), sum = (k, src = "ost") => fs.length ? fs.reduce((s, x) => s + (((src === "rano" ? x.rano : x) || {})[k] || 0), 0) : null;
    const plCh = fs.length ? fs.reduce((s, x) => s + (x.action === "charge" ? x.grid_kwh || 0 : 0), 0) : null, plSl = fs.length ? fs.reduce((s, x) => s + (x.action === "sell" ? x.grid_kwh || 0 : 0), 0) : null;
    H.push({ h, done, n: ms.length, pv: kwh("pv"), dom: kwh("dom"), ch: pos("bat"), ex: pos("grid"), pvR: sum("pv", "rano"), pvO: sum("pv"), domR: sum("load", "rano"), domO: sum("load"), plCh, plSl, fs, a }); }
  const tot = k => H.reduce((s, x) => s + (x[k] || 0), 0), err = (f, p) => f == null || p == null ? null : f - p, pct = (f, p) => p ? (f - p) / p * 100 : null;
  const hit = (k, pk) => H.filter(x => x.done && x[pk] != null && x[k] > 0.05).filter(x => Math.abs(x[k] - x[pk]) <= Math.max(0.1 * x[k], 0.05)).length, cnt = pk => H.filter(x => x.done && x[pk] != null && x.n).length;
  const e = v => v == null ? "–" : `<span style="color:${Math.abs(v) < 0.05 ? "#9bb3c6" : v > 0 ? "#3ee07a" : "#ff6b6b"}">${v > 0 ? "+" : ""}${fmt(v, 2)}</span>`;
  // wykres godzinowy: fakt ciagla, prognoza (ostatnia) przerywana
  const CW = 860, CH = 200, cx = h => 40 + h / 24 * (CW - 60), mx = Math.max(0.5, ...H.flatMap(x => [x.pv, x.dom, x.pvO || 0, x.domO || 0])), cy = v => 12 + (1 - v / mx) * (CH - 40);
  const ln = (k, col, dash) => { const p = H.filter(x => x[k] != null && (dash || x.n)).map((x, i) => `${i ? "L" : "M"}${cx(x.h + 0.5).toFixed(1)} ${cy(x[k]).toFixed(1)}`).join(""); return p ? `<path d="${p}" fill="none" stroke="${col}" stroke-width="2.2" ${dash ? 'stroke-dasharray="6 5"' : ""}/>` : ""; };
  let ch = ""; for (let h = 0; h <= 24; h += 3) ch += `<line x1="${cx(h)}" x2="${cx(h)}" y1="12" y2="${CH - 28}" class="pf-grid"/><text x="${cx(h)}" y="${CH - 10}" text-anchor="middle" class="pf-ax">${String(h).padStart(2, "0")}:00</text>`;
  ch += `<text x="34" y="18" text-anchor="end" class="pf-ax">${fmt(mx, 1)}</text><text x="34" y="${CH - 28}" text-anchor="end" class="pf-ax">0</text>` + ln("pv", "#facc15") + ln("pvO", "#facc15", 1) + ln("dom", "#1e9bff") + ln("domO", "#1e9bff", 1);
  const sumRow = (lab, f, pR, pO) => `<tr><td class="hd">${lab}</td><td data-l="Fakt" class="r"><b>${fmt(f, 1, "kWh")}</b></td><td data-l="Prognoza z początku dnia" class="r">${fmt(pR, 1, "kWh")} · ${e(err(f, pR))} (${pR ? fmt(pct(f, pR), 0, "%") : "–"})</td><td data-l="Prognoza ostatnia" class="r">${fmt(pO, 1, "kWh")} · ${e(err(f, pO))} (${pO ? fmt(pct(f, pO), 0, "%") : "–"})</td></tr>`;
  const anyFc = H.some(x => x.pvO != null);
  const rows = H.map(x => `<tr><td class="hd">${String(x.h).padStart(2, "0")}:00${x.done ? "" : " (trwa)"}</td>
    <td data-l="PV fakt" class="r">${fmt(x.pv, 2)}</td><td data-l="PV prognoza" class="r">${fmt(x.pvO, 2)} <span class="lab">(pocz. dnia ${fmt(x.pvR, 2)})</span></td><td data-l="PV błąd" class="r">${e(err(x.pv, x.pvO))}</td>
    <td data-l="Dom fakt" class="r">${fmt(x.dom, 2)}</td><td data-l="Dom prognoza" class="r">${fmt(x.domO, 2)} <span class="lab">(pocz. dnia ${fmt(x.domR, 2)})</span></td><td data-l="Dom błąd" class="r">${e(err(x.dom, x.domO))}</td>
    <td data-l="Ładowanie plan/fakt" class="r">${fmt(x.plCh, 2)} / ${fmt(x.ch, 2)}</td><td data-l="Sprzedaż plan/fakt" class="r">${fmt(x.plSl, 2)} / ${fmt(x.ex, 2)}</td></tr>`).join("");
  // blad wg wyprzedzenia: kazda zapisana aktualizacja slotu vs fakt slotu
  const BK = [[0, 1, "< 1 h"], [1, 3, "1–3 h"], [3, 6, "3–6 h"], [6, 12, "6–12 h"], [12, 99, "> 12 h"]], acc = BK.map(() => ({ n: 0, ld: 0, pv: 0, bl: 0 }));
  H.filter(x => x.done).forEach(x => (x.fs || []).forEach((sl, i) => { const t = x.a + i * 9e5, ms = meas.filter(r => r.t >= t && r.t < t + 9e5); if (ms.length < 10) return;
    const fd = ms.reduce((q, r) => q + (r.dom || 0), 0) / 60, fp = ms.reduce((q, r) => q + (r.pv || 0), 0) / 60;
    (sl.h || []).forEach(u => { const lead = (t - Date.parse(u[0])) / 36e5; if (lead < 0) return; const b = BK.findIndex(k => lead >= k[0] && lead < k[1]); if (b < 0) return;
      const o = acc[b]; o.n++; o.ld += Math.abs(fd - u[2]); o.pv += Math.abs(fp - u[1]); o.bl += fd - u[2]; }); }));
  const leadTab = acc.some(o => o.n) ? `<div class="h" style="margin:12px 0 6px"><span>Błąd wg wyprzedzenia prognozy (kWh na 15 min)</span></div><table class="tbl rt"><tr><th>Wyprzedzenie</th><th class="r">Prognoz</th><th class="r">Dom – śr. błąd</th><th class="r">Dom – odchylenie</th><th class="r">PV – śr. błąd</th></tr>
    ${BK.map((k, i) => { const o = acc[i]; return o.n ? `<tr><td class="hd">${k[2]}</td><td class="r" data-l="Prognoz">${o.n}</td><td class="r" data-l="Dom śr. błąd">${fmt(o.ld / o.n, 3)}</td><td class="r" data-l="Dom odchylenie">${e(o.bl / o.n)} <span class="lab">${o.bl > 0 ? "(zaniża)" : "(zawyża)"}</span></td><td class="r" data-l="PV śr. błąd">${fmt(o.pv / o.n, 3)}</td></tr>` : ""; }).join("")}</table>` : "";
  const today = st.day === new Date().toLocaleDateString("sv-SE");
  return `<div class="mr-ov" data-pfclose><div class="mr-md" style="max-width:1100px"><div class="mr-hd"><b>Prognoza vs rzeczywistość</b><span><button class="btn" data-pfday="-1">◀</button><b style="align-self:center">${new Date(st.day + "T00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "2-digit", month: "2-digit" })}</b><button class="btn" data-pfday="1" ${today ? "disabled" : ""}>▶</button><button class="btn" data-pfclose>✕</button></span></div>
    <div class="mr-body">${!dd ? `<div class="ov-mut">Ładuję…</div>` : !anyFc ? `<div class="ov-mut">Brak zapisanych prognoz dla tego dnia (EMS zapisuje je od wersji 0.6.4, trzyma 14 dni).</div>` : ""}
      <svg viewBox="0 0 ${CW} ${CH}" width="100%">${ch}</svg>
      <div class="pf-legs" style="margin:4px 0 10px"><span class="pf-lg"><i style="background:#facc15"></i>PV</span><span class="pf-lg"><i style="background:#1e9bff"></i>Dom</span><span class="pf-dash">── fakt · ┄ prognoza (ostatnia przed godziną), kWh/h</span></div>
      <table class="tbl rt" style="margin-bottom:12px"><tr><th>Dzień (do teraz)</th><th class="r">Fakt</th><th class="r">Prognoza z początku dnia · błąd</th><th class="r">Ostatnia prognoza · błąd</th></tr>
        ${sumRow("PV", tot("pv"), tot("pvR"), tot("pvO"))}${sumRow("Zużycie domu", tot("dom"), tot("domR"), tot("domO"))}
        <tr><td class="hd">Trafione godziny (±10 %)</td><td colspan="3" data-l="Trafione" class="r">PV ${hit("pv", "pvO")}/${cnt("pvO")} · dom ${hit("dom", "domO")}/${cnt("domO")}</td></tr>
        <tr><td class="hd">Ładowanie z sieci</td><td colspan="3" data-l="Plan / fakt" class="r">plan ${fmt(tot("plCh"), 1)} kWh · bateria naładowana ${fmt(tot("ch"), 1)} kWh</td></tr>
        <tr><td class="hd">Sprzedaż</td><td colspan="3" data-l="Plan / fakt" class="r">plan ${fmt(tot("plSl"), 1)} kWh · oddane do sieci ${fmt(tot("ex"), 1)} kWh</td></tr></table>
      <div style="overflow:auto"><table class="tbl rt"><tr><th>Godzina</th><th class="r">PV fakt</th><th class="r">PV prognoza</th><th class="r">PV błąd</th><th class="r">Dom fakt</th><th class="r">Dom prognoza</th><th class="r">Dom błąd</th><th class="r">Ładowanie plan / fakt</th><th class="r">Sprzedaż plan / fakt</th></tr>${rows}</table></div>
      ${leadTab}<div class="note" style="margin-top:8px">kWh w godzinie. Błąd = fakt − prognoza (zielony: więcej niż przewidziano). „Początek dnia” = prognoza z pierwszego przeliczenia po północy, „ostatnia” = ostatnia przed daną godziną. Błąd wg wyprzedzenia = średni błąd bezwzględny slotu 15 min dla prognoz zrobionych tyle godzin wcześniej (z każdej aktualizacji w ciągu dnia).</div></div></div></div>`;
}

export const PROFILE_CSS = `
.pf-wrap{position:relative}.pf-svg{display:block;touch-action:pan-y;cursor:crosshair}
.pf-grid{stroke:#1a3246;stroke-width:1}.pf-grid.z{stroke:#3b5a73}.pf-ax{fill:#cbd5e1;font-size:13px}.pf-yl{fill:#cbd5e1;font-size:14px}
.pf-tip{position:absolute;top:8px;z-index:5;background:#0a1420f2;border:1px solid #4b6b8a;border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.7;pointer-events:none;white-space:nowrap;box-shadow:0 0 18px #3b82f633}
.pf-tip i{display:inline-block;width:22px;height:10px;border-radius:5px;margin-right:8px;vertical-align:0}.pf-th{display:flex;align-items:center;gap:6px;font-size:16px;margin-bottom:2px}.pf-pr{color:#9bb3c6;font-size:12px}
.pf-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px}
.pf-legs{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}.pf-lg{background:none;border:0;color:#e2e8f0;font:inherit;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:8px;padding:2px}
.pf-lg i{display:inline-block;width:26px;height:11px;border-radius:6px}.pf-lg.off{opacity:.35}.pf-dash{color:#9bb3c6;font-size:12px}
.pf-soc{display:flex;align-items:center;gap:8px;border:1.5px solid #a78bfa;border-radius:999px;padding:6px 16px;color:#e9e3ff;box-shadow:0 0 12px #a78bfa44}.pf-soc .ico{color:#a78bfa}`;
