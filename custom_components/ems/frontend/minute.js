// Wspolne dane minutowe z historii HA (Przeglad: Profil mocy, Plan: wykres) – wartosc z ostatniego odczytu przed dana minuta.
// Odswiezane, gdy datalogger zglosi nowy odczyt pomiarow (dociagany tylko kawalek od ostatniego punktu).
import { S } from "./core.js";
export const PK = { pv: "pv_moc_suma", bat: "bateria_moc", grid: "siec_moc_suma", dom: "obciazenie_moc_suma", soc: "bateria_soc" };
export const hist = { day: "", pts: {}, last: 0, sig: "", busy: false, hover: null };
export async function loadHist(c) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const day = d0.toDateString();
  const sig = S(c.hass, c.rid(c.e("ostatni_odczyt_pomiarow"), "Ostatni odczyt pomiarow"))?.state || S(c.hass, c.e("bateria_soc"))?.last_updated || "";
  if (hist.busy || (day === hist.day && sig === hist.sig)) return;
  if (day !== hist.day) Object.assign(hist, { day, pts: {}, last: 0 });
  hist.busy = true; hist.sig = sig;
  const from = hist.last ? new Date(hist.last - 60000) : d0, ids = Object.fromEntries(Object.entries(PK).map(([k, v]) => [c.e(v), k]));
  try {
    const res = await c.hass.callApi("GET", `history/period/${from.toISOString()}?filter_entity_id=${Object.keys(ids).join(",")}&minimal_response&no_attributes`);
    res.forEach(ser => { const k = ids[ser[0]?.entity_id]; if (!k) return; const a = hist.pts[k] = hist.pts[k] || [];
      ser.forEach(p => { const v = parseFloat(p.state), t = Date.parse(p.last_changed || p.last_updated) || (p.lu * 1000); if (isNaN(v) || !t) return;
        if (!a.length || t > a[a.length - 1][0]) a.push([t, v]); hist.last = Math.max(hist.last, t); }); });
  } catch (e) { /* zostaje to, co bylo */ }
  hist.busy = false; c.render(true);
}
// tablica 1-min: m -> {pv, bat, grid, dom, soc} (kW / %)
export function minutes() {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime(), nowM = Math.min(1439, Math.floor((Date.now() - t0) / 6e4)), out = [];
  const idx = Object.fromEntries(Object.keys(PK).map(k => [k, 0]));
  for (let m = 0; m <= nowM; m++) { const te = t0 + (m + 1) * 6e4, r = { m };
    for (const k in PK) { const a = hist.pts[k] || []; while (idx[k] < a.length && a[idx[k]][0] < te) idx[k]++; const p = a[idx[k] - 1]; r[k] = p ? (k === "soc" ? p[1] : p[1] / 1000) : null; }
    out.push(r); }
  return { t0, rows: out };
}
