// Ikony liniowe (wlasne, 24x24, kolor = currentColor). ic("sun", 24) -> <svg>; icP("sun") -> same sciezki (do wstawienia w <svg>).
const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  battery: '<rect x="7" y="4" width="10" height="17" rx="2"/><path d="M10 2h4M10 9h4M10 13h4M10 17h4"/>',
  batteryBolt: '<rect x="7" y="4" width="10" height="17" rx="2"/><rect x="9" y="13" width="6" height="6" rx=".8" fill="currentColor" stroke="none" opacity=".55"/><path d="M10 2h4M12.8 7l-2.3 3.5h3L11.2 14"/>',
  bolt: '<path d="M13 2L5 13.5h6L10 22l8-11.5h-6L13 2z" fill="currentColor"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  tower: '<path d="M8 22L12 2l4 20M9.3 15h5.4M10.2 10h3.6M5 7h14M6 7l-2 3M18 7l2 3M9 22l6-7M15 22l-6-7"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z" fill="currentColor" fill-opacity=".9"/><path d="M5 19c3-4 6-7 10-10" stroke="#0b1a2b"/>',
  cloudSun: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M9 20h9a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.6-1A4 4 0 0 0 9 20z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  stack: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  chart: '<path d="M4 20V10M9 20V4M14 20v-8M19 20v-5M2 20h20"/>',
  gauge: '<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4M7 12h1M12 7v1M16.5 12h.5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  panel: '<path d="M4 4h16l-2 10H6L4 4zM4.7 7.5h14.6M5.4 11h13.2M9.5 4l-.8 10M14.5 4l.8 10M12 14v4M8 20h8"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5M2 13v2M22 13v2"/><circle cx="12" cy="3.5" r="1"/>',
  cart: '<path d="M3 4h2l2.4 11h10.8l2-8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 5h16"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="2.5"/><path d="M3 7v4c0 1.4 2.7 2.5 6 2.5M3 11v4c0 1.4 2.7 2.5 6 2.5"/><ellipse cx="15" cy="13" rx="6" ry="2.5"/><path d="M9 13v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4"/>',
  recycle: '<path d="M7 19H4.5a2 2 0 0 1-1.7-3l2.6-4.5M14 19h4.8a2 2 0 0 0 1.7-3l-1.3-2.2M10.2 5.2l1-1.7a2 2 0 0 1 3.4 0l2.4 4.2M5 13l.4-1.5L7 12M17.5 9l.2-1.6 1.5.6M13 17l-1.5 2 1.5 1.5"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>', arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>', arrowUR: '<path d="M7 17L17 7M8 7h9v9"/>', arrowDR: '<path d="M7 7l10 10M17 8v9H8"/>',
};
export const icP = n => P[n] || "";
export const ic = (n, s = 20, extra = "") => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[n] || ""}</svg>`;

// Ikony "realistyczne" (kolorowe, gradienty, poswiata) do kafelkow i scen. icR("sun", 32)
let RID = 0;
const R = {
  sun: u => `<defs><radialGradient id="s${u}" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#fff7c2"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9d00"/></radialGradient></defs>
    <g stroke="#ffc21a" stroke-width="2.2" stroke-linecap="round"><path d="M16 2.5v4M16 25.5v4M2.5 16h4M25.5 16h4M6.4 6.4l2.8 2.8M22.8 22.8l2.8 2.8M6.4 25.6l2.8-2.8M22.8 9.2l2.8-2.8"/></g><circle cx="16" cy="16" r="7.2" fill="url(#s${u})"/>`,
  battery: u => `<defs><linearGradient id="b${u}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#4ade80"/></linearGradient><linearGradient id="bc${u}" x1="0" x2="1"><stop offset="0" stop-color="#cbd5e1"/><stop offset=".5" stop-color="#f8fafc"/><stop offset="1" stop-color="#94a3b8"/></linearGradient></defs>
    <rect x="12" y="2.5" width="8" height="3" rx="1" fill="url(#bc${u})"/><rect x="8" y="5" width="16" height="25" rx="3.5" fill="#0b2a1a" stroke="url(#bc${u})" stroke-width="1.6"/>
    <rect x="10.5" y="13" width="11" height="4.6" rx="1" fill="url(#b${u})"/><rect x="10.5" y="18.6" width="11" height="4.6" rx="1" fill="url(#b${u})"/><rect x="10.5" y="24.2" width="11" height="4" rx="1" fill="url(#b${u})"/>
    <path d="M17.2 6.8l-3.6 5.4h2.6l-1.4 4 3.8-5.6h-2.6z" fill="#fff"/>`,
  bolt: u => `<defs><linearGradient id="t${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a3"/><stop offset=".45" stop-color="#ffcc1a"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs>
    <path d="M18.5 2L6.5 18h8.2L12.5 30l13-17.5h-8.3L18.5 2z" fill="url(#t${u})" stroke="#ffe27a" stroke-width=".8" stroke-linejoin="round"/>`,
  home: u => `<defs><linearGradient id="h${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#2f7fe0"/></linearGradient></defs>
    <path d="M4 15.5L16 5l12 10.5" fill="none" stroke="url(#h${u})" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7.5 13.5V28h17V13.5" fill="#0f2c4d" stroke="url(#h${u})" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="13" y="19" width="6" height="9" rx=".8" fill="#ffc34d"/><rect x="21" y="9" width="2.6" height="4.5" fill="url(#h${u})"/>`,
  tower: u => `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3ba"/><stop offset="1" stop-color="#ff3b4e"/></linearGradient></defs>
    <g fill="none" stroke="url(#w${u})" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 30L16 3l5 27M12.4 22.5h7.2M13.6 15.5h4.8M7 8.5h18M8.5 8.5l-2 3.5M23.5 8.5l2 3.5M10 12.5h12M12 30l7.4-7.5M20 30l-7.4-7.5M13.6 15.5l5 7M18.4 15.5l-5 7"/></g>
    <circle cx="16" cy="3" r="1.4" fill="#fff"/>`,
  leaf: u => `<defs><linearGradient id="l${u}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#15803d"/><stop offset=".6" stop-color="#4ade80"/><stop offset="1" stop-color="#bbf7d0"/></linearGradient></defs>
    <path d="M5 27C5 14 13 5.5 28 4c-1.2 15-9.6 23-23 23z" fill="url(#l${u})"/><path d="M5.5 26.5C10 20 15.5 14 23 9M12.5 19.5l-.5-5M17 15l4.5.4" fill="none" stroke="#0b3a1f" stroke-width="1.5" stroke-linecap="round"/>`,
  coins: u => `<defs><linearGradient id="c${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#e09a00"/></linearGradient></defs>
    <g stroke="#7a5200" stroke-width=".9"><ellipse cx="13" cy="21.5" rx="9" ry="3.6" fill="url(#c${u})"/><path d="M4 21.5v3.2c0 2 4 3.6 9 3.6s9-1.6 9-3.6v-3.2" fill="url(#c${u})"/>
    <ellipse cx="19" cy="13.5" rx="9" ry="3.6" fill="url(#c${u})"/><path d="M10 13.5v3.2c0 2 4 3.6 9 3.6s9-1.6 9-3.6v-3.2" fill="url(#c${u})"/><ellipse cx="19" cy="7.5" rx="9" ry="3.6" fill="url(#c${u})"/><path d="M10 7.5v3.2c0 2 4 3.6 9 3.6s9-1.6 9-3.6V7.5" fill="url(#c${u})"/></g>`,
};
R.cloudSun = u => `<defs><radialGradient id="cs${u}" cx=".4" cy=".4" r=".6"><stop offset="0" stop-color="#fff3b0"/><stop offset="1" stop-color="#ffb000"/></radialGradient><linearGradient id="cc${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c6d6"/></linearGradient></defs>
    <g stroke="#ffc21a" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v3M3.5 11h3M5.8 4.8l2 2M18.2 4.8l-2 2M3.5 17.5l2.4-1"/></g><circle cx="12" cy="11.5" r="5.6" fill="url(#cs${u})"/>
    <path d="M11.5 27.5h13a4.8 4.8 0 0 0 .6-9.6 6.6 6.6 0 0 0-12.6-1.6 5.6 5.6 0 0 0-1 11.2z" fill="url(#cc${u})"/>`;
R.cloud = u => `<defs><linearGradient id="cl${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#a9b8ca"/></linearGradient></defs><path d="M9 26h15a5.5 5.5 0 0 0 .7-11 7.5 7.5 0 0 0-14.3-1.8A6.4 6.4 0 0 0 9 26z" fill="url(#cl${u})"/>`;
R.rain = u => R.cloud(u) + `<g stroke="#4fb3ff" stroke-width="2" stroke-linecap="round"><path d="M11 28.5l-1 2.5M16 28.5l-1 2.5M21 28.5l-1 2.5"/></g>`;
R.snow = u => R.cloud(u) + `<g fill="#e0f2fe"><circle cx="11" cy="29.5" r="1.3"/><circle cx="16" cy="30.5" r="1.3"/><circle cx="21" cy="29.5" r="1.3"/></g>`;
R.storm = u => R.cloud(u) + `<path d="M17 24l-3.5 5h2.8L15 32l4.5-5.5h-2.8z" fill="#ffd23f"/>`;
R.moon = u => `<path d="M20 4a11 11 0 1 0 8 18.5A12 12 0 0 1 20 4z" fill="#ffe28a"/>`;
R.calendar = u => `<rect x="4" y="6.5" width="24" height="21" rx="3" fill="#0f2c4d" stroke="#e2e8f0" stroke-width="1.8"/><path d="M4 12.5h24" stroke="#e2e8f0" stroke-width="1.8"/><path d="M10 4v5M22 4v5" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"/><g fill="#e2e8f0"><rect x="8.5" y="16" width="3" height="2.6" rx=".5"/><rect x="14.5" y="16" width="3" height="2.6" rx=".5"/><rect x="20.5" y="16" width="3" height="2.6" rx=".5"/><rect x="8.5" y="21" width="3" height="2.6" rx=".5"/><rect x="14.5" y="21" width="3" height="2.6" rx=".5" fill="#4fb3ff"/></g>`;
R.clock = u => `<circle cx="16" cy="16" r="12" fill="#0f2c4d" stroke="#e2e8f0" stroke-width="2"/><path d="M16 9v7.5l4.5 3" fill="none" stroke="#e2e8f0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
R.batteryBolt = R.battery;
export const hasR = n => !!R[n];
export const icRP = n => R[n] ? R[n](++RID) : "";
export const icR = (n, s = 32) => R[n] ? `<svg class="icr" width="${s}" height="${s}" viewBox="0 0 32 32">${R[n](++RID)}</svg>` : ic(n, s);
