// Wspolne dane minutowe z historii HA (Przeglad: Profil mocy, Plan: wykres) – wartosc z ostatniego odczytu przed dana minuta.
// Zakres dowolny [t0, t1). Zakres siegajacy "teraz" jest dociagany po kazdym nowym odczycie pomiarow dataloggera (tylko nowy kawalek).
import { S } from "./core.js";

export const PK = { pv: "pv_moc_suma", bat: "bateria_moc", grid: "siec_moc_suma", dom: "obciazenie_moc_suma", soc: "bateria_soc" };
const CACHE = {};   // klucz "t0" -> { t0, t1, pts: {k: [[t, v]]}, last, sig, busy }
const sigOf = c => S(c.hass, c.rid(c.e("ostatni_odczyt_pomiarow"), "Ostatni odczyt pomiarow"))?.state || S(c.hass, c.e("bateria_soc"))?.last_updated || "";

async function load(c, e) {
  const live = e.t1 > Date.now() - 6e4, sig = live ? sigOf(c) : "x";
  if (e.busy || (e.sig === sig && e.done)) return;
  e.busy = true; e.sig = sig;
  const from = new Date(e.last ? e.last - 6e4 : e.t0), to = new Date(Math.min(e.t1, Date.now() + 6e4));
  const ids = Object.fromEntries(Object.entries(PK).map(([k, v]) => [c.e(v), k]));
  try {
    const res = await c.hass.callApi("GET", `history/period/${from.toISOString()}?end_time=${to.toISOString()}&filter_entity_id=${Object.keys(ids).join(",")}&minimal_response&no_attributes`);
    res.forEach(ser => { const k = ids[ser[0]?.entity_id]; if (!k) return; const a = e.pts[k] = e.pts[k] || [];
      ser.forEach(p => { const v = parseFloat(p.state), t = Date.parse(p.last_changed || p.last_updated) || (p.lu * 1000); if (isNaN(v) || !t) return;
        if (!a.length || t > a[a.length - 1][0]) a.push([t, v]); e.last = Math.max(e.last || 0, t); }); });
    e.done = true;
  } catch (err) { /* zostaje to, co bylo */ }
  e.busy = false; c.render(true);
}

// Wiersze minutowe dla [t0, t1): { t (ms), pv, bat, grid, dom (kW, znaki jak w falowniku), soc (%) } – tylko do "teraz".
export function range(c, t0, t1) {
  const key = String(t0), e = CACHE[key] = CACHE[key] || { t0, t1, pts: {}, last: 0, sig: "", busy: false, done: false };
  e.t1 = t1; load(c, e);
  for (const k of Object.keys(CACHE)) if (Object.keys(CACHE).length > 6 && k !== key) delete CACHE[k];
  const end = Math.min(t1, Date.now()), out = [], idx = Object.fromEntries(Object.keys(PK).map(k => [k, 0]));
  for (let t = t0; t < end; t += 6e4) { const te = t + 6e4, r = { t };
    for (const k in PK) { const a = e.pts[k] || []; while (idx[k] < a.length && a[idx[k]][0] < te) idx[k]++; const p = a[idx[k] - 1]; r[k] = p ? (k === "soc" ? p[1] : p[1] / 1000) : null; }
    out.push(r); }
  return out;
}
// okno "teraz ±12 h" (wyrownane do minuty, klucz zmienia sie co 10 min, zeby nie pobierac historii co minute od nowa)
export function nowWindow(h = 12) {
  const n = Date.now(), m = Math.floor(n / 6e5) * 6e5;
  return { t0: m - h * 36e5, t1: m + h * 36e5, now: n };
}
export function dayWindow(day) {   // day = Date (lokalna polnoc)
  const d = new Date(day); d.setHours(0, 0, 0, 0); const e = new Date(d); e.setDate(e.getDate() + 1);
  return { t0: d.getTime(), t1: e.getTime(), now: Date.now() };
}

// Statystyki HA (srednie) dla dlugich okresow: period "5minute" (tydzien) albo "hour" (miesiac). -> Map(start ms -> {pv, bat, grid, dom (kW), soc})
const STATS = {};
export function stats(c, t0, t1, period) {
  const key = `${period}:${t0}`, e = STATS[key] = STATS[key] || { at: 0, busy: false, map: new Map() };
  if (!e.busy && Date.now() - e.at > 300000) {
    e.busy = true;
    const ids = Object.fromEntries(Object.entries(PK).map(([k, v]) => [c.e(v), k]));
    c.hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(t0).toISOString(), end_time: new Date(Math.min(t1, Date.now())).toISOString(),
      statistic_ids: Object.keys(ids), period, types: ["mean"] })
      .then(res => { const m = new Map(); for (const [id, arr] of Object.entries(res || {})) { const k = ids[id]; if (!k) continue;
        for (const p of arr) { const t = typeof p.start === "number" ? p.start : Date.parse(p.start); if (p.mean == null) continue; const o = m.get(t) || {}; o[k] = k === "soc" ? p.mean : p.mean / 1000; m.set(t, o); } }
        e.map = m; })
      .catch(() => {}).finally(() => { e.at = Date.now(); e.busy = false; c.render(true); });
  }
  return e.map;
}
export function weekWindow() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const e = new Date(d); e.setDate(e.getDate() + 7); return { t0: d.getTime(), t1: e.getTime(), now: Date.now() }; }
export function monthWindow() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); const e = new Date(d); e.setMonth(e.getMonth() + 1); return { t0: d.getTime(), t1: e.getTime(), now: Date.now() }; }
