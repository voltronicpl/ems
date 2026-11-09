// EMS – wspolne narzedzia panelu
export const S = (h, id) => h && h.states[id];
export const num = (h, id, d = null) => { const s = S(h, id); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? d : v; };
export const fmt = (v, d = 1, u = "") => v === null || v === undefined ? "–" : `${Number(v).toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d })}${u ? " " + u : ""}`;
export function g12(now = new Date()) {
  const m = now.getMonth() + 1, summer = m >= 4 && m <= 9;
  const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
  const dst = now.getTimezoneOffset() < jan ? 1 : 0;
  const h = (now.getHours() - dst + 24) % 24 + now.getMinutes() / 60;
  const day = summer ? [15, 17] : [13, 15];
  const cheap = h >= 22 || h < 6 || (h >= day[0] && h < day[1]);
  const p = (x) => `${(x + dst) % 24}:00`;
  return { cheap, summer, label: `${p(day[0])}–${p(day[1])}, ${p(22)}–${p(6)}` };
}
export const CSS = `
    :host{display:block;padding:16px;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit);max-width:1400px;margin:0 auto}
    .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px}
    h1{font-size:22px;font-weight:500;margin:0}
    .tabs{display:flex;gap:6px;flex-wrap:wrap}
    .tab{padding:6px 14px;border-radius:8px;border:1px solid var(--divider-color);cursor:pointer;font-size:14px;background:var(--card-background-color)}
    .tab.on{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
    .card{background:var(--card-background-color);border-radius:12px;border:1px solid var(--divider-color);padding:16px 20px;margin-bottom:12px}
    .h{font-weight:500;font-size:15px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
    .g4{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
    .g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
    .g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .m{background:var(--secondary-background-color);border-radius:8px;padding:10px 12px}
    .l{font-size:12px;color:var(--secondary-text-color)}
    .v{font-size:22px;font-weight:500}
    .row{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--divider-color);font-size:14px}
    .pill{font-size:12px;padding:3px 10px;border-radius:8px;display:inline-block}
    .ok{background:rgba(67,160,71,.15);color:var(--success-color,#43a047)}
    .warn{background:rgba(255,152,0,.15);color:var(--warning-color,#ff9800)}
    .info{background:rgba(3,169,244,.15);color:var(--info-color,#039be5)}
    .err{background:rgba(219,68,55,.12);color:var(--error-color,#db4437)}
    .lock{border:1px solid var(--error-color,#db4437)}
    .bar{display:flex;height:12px;border-radius:4px;overflow:hidden;margin:6px 0}
    label.f{display:block;font-size:12px;color:var(--secondary-text-color);margin-bottom:4px}
    .inp{display:flex;border:1px solid var(--divider-color);border-radius:8px;overflow:hidden;background:var(--secondary-background-color)}
    .inp input{flex:1;min-width:0;border:0;background:transparent;color:inherit;padding:7px 9px;font-size:14px}
    .inp span{padding:7px 9px;border-left:1px solid var(--divider-color);color:var(--secondary-text-color);font-size:12px}
    .inp.chg{border-color:var(--primary-color)}
    .lk .inp{border-color:var(--error-color,#db4437)}
    input[type=range]{width:100%}
    .btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
    button{padding:7px 16px;border-radius:8px;border:0;cursor:pointer;font-size:14px;background:var(--primary-color);color:var(--text-primary-color,#fff)}
    button.sec{background:transparent;color:var(--primary-text-color);border:1px solid var(--divider-color)}
    button:disabled{opacity:.4;cursor:default}
    .tou{display:grid;grid-template-columns:150px 110px 110px minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--divider-color);font-size:13px}
    .sw{display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px}
    .tg{width:30px;height:16px;border-radius:8px;background:var(--disabled-color,#bbb);position:relative;flex:none}
    .tg::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff}
    .tg.on{background:var(--primary-color)} .tg.on::after{left:16px}
    .note{font-size:13px;color:var(--secondary-text-color)}
    @media(max-width:700px){.tou{grid-template-columns:1fr 1fr}}
  
    .act{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
    .log{font-family:monospace;font-size:12px;white-space:pre-wrap;background:var(--secondary-background-color);border-radius:8px;padding:10px;max-height:60vh;overflow:auto}
    .slotbar{display:flex;align-items:flex-end;gap:1px;height:70px}
    .big{font-size:15px;padding:9px 18px}
    .on-g{background:var(--success-color,#43a047)} .off-g{background:var(--disabled-color,#999)}
`;
