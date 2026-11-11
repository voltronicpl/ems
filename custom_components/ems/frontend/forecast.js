// Prognozy i ceny dla dowolnego okna czasu: plan (sensor.ems_plan) dla przyszlosci, zapisane prognozy (/api/ems/dzien) dla przeszlosci.
import { S, fmt } from "./core.js";

const DAYS = {};   // "YYYY-MM-DD" -> { at, busy, data: { prognozy, ceny } }
const isoDay = t => new Date(t).toLocaleDateString("sv-SE");

function loadDay(c, d) {
  const e = DAYS[d] = DAYS[d] || { at: 0, busy: false, data: null }, today = isoDay(Date.now());
  const ttl = d >= today ? 300000 : 36e5;
  if (e.busy || Date.now() - e.at < ttl) return e.data;
  e.busy = true;
  c.hass.callApi("GET", `ems/dzien?day=${d}`).then(r => { e.data = r; }).catch(() => {}).finally(() => { e.at = Date.now(); e.busy = false; c.render(true); });
  return e.data;
}
export const dayData = (c, d) => loadDay(c, d);

// slot (ms, poczatek 15 min) -> { pv, load, soc, action, grid_kwh, imp, exp, price, rano, plan: bool }
export function slots(c, t0, t1) {
  const m = new Map(), q = t => Math.floor(t / 9e5) * 9e5;
  // kazdy dzien kalendarzowy, ktory zahacza o okno (od polnocy dnia t0) – inaczej przy oknie 20:55 → 20:55 dzisiejszy dzien wypadal
  for (let d = new Date(t0), _ = d.setHours(0, 0, 0, 0); d.getTime() < t1; d.setDate(d.getDate() + 1)) {
    const data = loadDay(c, isoDay(d)); if (!data) continue;
    for (const [k, v] of Object.entries(data.prognozy || {})) m.set(q(Date.parse(k)), { ...(v.ost || v.rano), rano: v.rano, dzien: v.dzien || v.rano, h: v.h || [], plan: false });
    for (const [k, v] of Object.entries(data.ceny || {})) { const t = q(Date.parse(k)), o = m.get(t) || {}; if (o.price == null) o.price = v; m.set(t, o); }
  }
  for (const s of S(c.hass, "sensor.ems_plan")?.attributes?.plan || []) { const t = q(Date.parse(s.start)), o = m.get(t) || {}; m.set(t, { ...o, ...s, price: s.price ?? o.price, rano: o.rano, dzien: o.dzien, h: o.h, plan: true }); }
  return m;
}
// moce z bilansu slotu (kWh/15 min -> kW). Znaki jak na wykresach: bateria + ladowanie, siec − pobor.
export const kw = s => s ? { pv: (s.pv || 0) * 4, dom: (s.load || 0) * 4, grid: ((s.exp || 0) - (s.imp || 0)) * 4,
  bat: ((s.pv || 0) + (s.imp || 0) - (s.load || 0) - (s.exp || 0)) * 4, soc: s.soc } : null;

// Naglowek wykresu PV / domu: "do teraz" = pomiar vs prognoza z poczatku dnia (dzien), ponizej reszta okna i calosc.
// rows: { t (Date|ms), [pk] kWh/15 min, dzien: { pv, load }, [mk] kW }; step = minuty na wiersz; dk = klucz w dzien.
export function cmpHead(rows, { pk, dk, mk, cls, step = 1, now = Date.now(), small = 0.2 }) {
  let tot = 0, rest = 0, fm = 0, fd = 0, nd = 0, has = false;
  for (const r of rows) { const t = +r.t, p = r[pk] == null ? 0 : r[pk] * step / 15; tot += p;
    if (t >= now) { rest += p; continue; }
    if (r[mk] != null) { fm += r[mk] * step / 60; has = true; }
    const d = r.dzien && r.dzien[dk] != null ? r.dzien[dk] : r[pk]; if (d != null) { fd += d * step / 15; nd++; } }
  const full = `<b class="${cls}">${fmt(tot, 1, "kWh")} prognoza</b>`;
  if (!has || !nd) return `<span>${full}</span>`;
  const df = fm - fd, big = Math.max(fm, fd) >= small, pc = fd > 0.01 ? df / fd * 100 : null, a = Math.abs(pc ?? 0);
  const col = !big ? "#9bb3c6" : a <= 10 ? "#22e07a" : a <= 25 ? "#facc15" : "#ff4d5e";
  const dtxt = big && pc != null ? `${df >= 0 ? "+" : ""}${fmt(pc, 0)}%` : `${df >= 0 ? "+" : ""}${fmt(df, 2)} kWh`;
  return `<span style="text-align:right;line-height:1.35"><span>Do teraz: <b>${fmt(fm, 1, "kWh")}</b> faktycznie · prognoza ${fmt(fd, 1, "kWh")} <b style="color:${col}">(${dtxt})</b></span>`
    + `<br><span class="ov-mut" style="font-size:12px">Reszta okna: ${fmt(rest, 1, "kWh")} prognoza · całość ${full}</span></span>`;
}
