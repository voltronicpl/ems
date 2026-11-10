// Zakladka PGE – dawny panel „PGE Net-Billing” (rachunek, depozyt, bilans kWh, zarobek z automatyki) wcielony do EMS.
// Element <ems-pge-dashboard> tworzony RAZ i przenoszony przy kazdym przerysowaniu panelu EMS (zachowuje stan, wykresy, miesiac).
const V = new URL(import.meta.url).search;
let el = null;
const ready = import(`../pge.js${V}`).then(() => { el = document.createElement("ems-pge-dashboard"); el.setAttribute("embedded", ""); return el; });
export const title = "PGE";
export function render(c) {
  if (!el) ready.then(() => c.render(true));
  return `<div data-pge-host>${el ? "" : `<div class="box">Ładuję rozliczenie PGE…</div>`}</div>`;
}
export function bind(c, r) {
  const host = r.querySelector("[data-pge-host]");
  if (!el || !host) return;
  el.narrow = c._narrow;
  el.hass = c.hass;
  host.appendChild(el);
}
