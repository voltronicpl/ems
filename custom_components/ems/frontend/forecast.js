// Prognozy i ceny dla dowolnego okna czasu: plan (sensor.ems_plan) dla przyszlosci, zapisane prognozy (/api/ems/dzien) dla przeszlosci.
import { S } from "./core.js";

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
  for (let d = new Date(t0); d.getTime() < t1; d.setDate(d.getDate() + 1)) {
    const data = loadDay(c, isoDay(d)); if (!data) continue;
    for (const [k, v] of Object.entries(data.prognozy || {})) m.set(q(Date.parse(k)), { ...(v.ost || v.rano), rano: v.rano, plan: false });
    for (const [k, v] of Object.entries(data.ceny || {})) { const t = q(Date.parse(k)), o = m.get(t) || {}; if (o.price == null) o.price = v; m.set(t, o); }
  }
  for (const s of S(c.hass, "sensor.ems_plan")?.attributes?.plan || []) { const t = q(Date.parse(s.start)), o = m.get(t) || {}; m.set(t, { ...o, ...s, price: s.price ?? o.price, rano: o.rano, plan: true }); }
  return m;
}
// moce z bilansu slotu (kWh/15 min -> kW). Znaki jak na wykresach: bateria + ladowanie, siec − pobor.
export const kw = s => s ? { pv: (s.pv || 0) * 4, dom: (s.load || 0) * 4, grid: ((s.exp || 0) - (s.imp || 0)) * 4,
  bat: ((s.pv || 0) + (s.imp || 0) - (s.load || 0) - (s.exp || 0)) * 4, soc: s.soc } : null;
