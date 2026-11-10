// Animowane linie przeplywu energii (Przeglad + karta ems-card).
// Sciezki rysowane od zrodla (PV, bateria, slup, auto) DO domu; kierunek = znak mocy.
// Animacja CSS z ujemnym opoznieniem liczonym z zegara -> po przerysowaniu HTML impulsy nie skacza.
export const COL = { pv: "#7CFC4A", out: "#7CFC4A", chg: "#ff9f1a", imp: "#ff4d6d", exp: "#3aa0ff", off: "#2a3644" };
const GAP = 104;   // dlugosc wzoru kreski (impuls + przerwa)

export const FLOW_CSS = `
.fl-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fl-svg path{fill:none;stroke-linecap:round}
.fl-run{animation:emsflow linear infinite}
.fl-rev{animation-direction:reverse}
@keyframes emsflow{to{stroke-dashoffset:-${GAP}}}
@media(prefers-reduced-motion:reduce){.fl-run{animation:none}}`;

// moc -> stan linii: { w: W (abs), toHouse, col }
export function lines(pv, bat, grid) {   // bat: + rozladowanie, - ladowanie (jak bateria_moc); grid: + pobor, - oddawanie
  return {
    pv: { w: pv, toHouse: true, col: COL.pv },
    bat: { w: bat, toHouse: bat > 0, col: bat > 0 ? COL.out : COL.chg },
    grid: { w: grid, toHouse: grid > 0, col: grid > 0 ? COL.imp : COL.exp },
    car: { w: 0, toHouse: false, col: COL.pv },   // samochod: na razie tylko grafika
  };
}

// vb = "0 0 W H", paths = {klucz: d}, st = lines(...), th = [kabel, impuls, srodek]
export function flowSvg(vb, paths, st, th = [13, 9, 3.5], id = "flg") {
  const now = Date.now() / 1000;
  let g = "";
  for (const k in paths) {
    const s = st[k] || { w: 0 }, a = Math.abs(s.w || 0), d = paths[k];
    if (a < 5) { g += `<path d="${d}" stroke="${COL.off}" stroke-width="${th[0]}" opacity=".6"/>`; continue; }
    const sp = a < 100 ? 25 : a < 500 ? 60 : a < 1500 ? 130 : 240, dur = GAP / sp, del = -(now % dur);
    const an = `class="fl-run${s.toHouse ? "" : " fl-rev"}" style="animation-duration:${dur.toFixed(2)}s;animation-delay:${del.toFixed(2)}s" stroke-dasharray="34 70"`;
    g += `<path d="${d}" stroke="${s.col}" stroke-width="${th[0]}" opacity=".28"/>`
      + `<path d="${d}" stroke="${s.col}" stroke-width="${th[1]}" filter="url(#${id})" ${an}/>`
      + `<path d="${d}" stroke="#fff" stroke-width="${th[2]}" ${an}/>`;
  }
  return `<svg class="fl-svg" viewBox="${vb}" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" result="a"/><feMerge><feMergeNode in="a"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${g}</svg>`;
}
