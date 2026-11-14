// Karta Lovelace "custom:ems-card" – maly kafelek EMS na pulpit (scena z obrazka uzytkownika + zywe kafelki + animowane linie).
// Rejestrowana przez integracje (frontend.add_extra_js_url) – nic nie trzeba dodawac w Zasobach.
// Konfiguracja:  type: custom:ems-card   [device: ecobss]   [navigate: /ems]
import { icR } from "./icons.js";
import { flowSvg, lines, FLOW_CSS } from "./flow.js";

const BG = new URL("./card.jpg", import.meta.url).href;
// miejsca kafelkow narysowanych w obrazku (% kadru 1496x720)
const POS = { pv: [3.0, 19.6, 22.0, 27.0], bat: [3.0, 54.6, 27.0, 38.4], dom: [44.0, 54.0, 17.6, 25.6], grid: [76.0, 19.6, 21.8, 41.8] };
// linie od zrodla do domu (uklad 1496x720)
const FLOW = {
  pv: "M370 290 C470 290 500 430 590 440",
  bat: "M445 545 C520 545 540 500 590 495",
  grid: "M1143 320 C1060 320 1050 450 965 460",
};
const num = (h, id) => { const s = h && h.states[id]; const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? null : v; };
const fmt = (v, d = 1, u = "") => v == null || isNaN(v) ? "–" : `${Number(v).toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d })}${u ? " " + u : ""}`;
const W = n => n == null ? "–" : `${Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} W`;

const CSS = `
:host{display:block}
ha-card{overflow:hidden;background:#05080e;border-radius:var(--ha-card-border-radius,16px);cursor:pointer}
.c{position:relative;container-type:inline-size;font-family:var(--paper-font-body1_-_font-family,Roboto,system-ui,sans-serif);color:#e8eef5}
.c img{display:block;width:100%;height:auto}
.t{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:2.2cqw;padding:1.6cqw 2cqw;background:#0b1622f2;border:1px solid #2a4560;border-radius:2.4cqw;box-shadow:0 0 2cqw #000c}
.t{overflow:hidden}.t.dom{flex-direction:column;justify-content:center;gap:.4cqw;text-align:center;background:#0b1622}.sub.ie{font-size:2.3cqw;white-space:nowrap}
.ic{flex:none;width:7cqw;height:7cqw;display:grid;place-items:center}.ic svg{width:100%;height:100%}
.tx{min-width:0;line-height:1.12}
.lab{font-size:2.9cqw;font-weight:700;color:#f1f5f9;display:flex;align-items:center;gap:1cqw}.lab svg{width:3.4cqw;height:3.4cqw}
.val{font-size:4.6cqw;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
.sub{font-size:2.4cqw;color:#cbd5e1;white-space:nowrap;font-variant-numeric:tabular-nums}
.b{color:#60c8ff}.gr{color:#3ee07a}.rd{color:#ff5d6c}.bl{color:#3aa0ff}.or{color:#ff9f1a}
.bat{flex:none;position:relative;width:6.2cqw;height:13cqw;border:.5cqw solid #4fd1ff;border-radius:1.2cqw;box-shadow:0 0 1.6cqw #4fd1ff88;display:flex;flex-direction:column-reverse;gap:.5cqw;padding:.6cqw}
.bat::before{content:"";position:absolute;top:-1.6cqw;left:50%;transform:translateX(-50%);width:2.4cqw;height:1cqw;background:#4fd1ff;border-radius:.4cqw .4cqw 0 0}
.bat i{flex:1;border-radius:.5cqw;background:#1b2a36}.bat i.on{background:currentColor;box-shadow:0 0 1.2cqw currentColor}
.pge{display:flex;justify-content:space-around;gap:8px;padding:8px 12px 10px;font-family:var(--paper-font-body1_-_font-family,Roboto,system-ui,sans-serif);color:#cbd5e1;font-size:13px;border-top:1px solid #1d3347;background:#081420}
.pge b{display:block;color:#fff;font-size:16px;font-variant-numeric:tabular-nums}.pge .rd{color:#ff5d6c}.pge .gr{color:#3ee07a}
${FLOW_CSS}`;

class EmsCard extends HTMLElement {
  setConfig(c) { this._c = { device: "ecobss", navigate: "/ems", ...(c || {}) }; this._root || this._init(); this._draw(); }
  getCardSize() { return 4; }
  static getStubConfig() { return { device: "ecobss" }; }
  _init() {
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `<style>${CSS}</style><ha-card><div class="c"><img src="${BG}" alt="EMS"><div id="f"></div><div id="t"></div></div><div id="pge"></div></ha-card>`;
    this._root.querySelector("ha-card").onclick = () => { history.pushState(null, "", this._c.navigate); window.dispatchEvent(new CustomEvent("location-changed")); };
  }
  set hass(h) { const first = !this._h; this._h = h; const n = Date.now(); if (first || !this._t || n - this._t > 2000) { this._t = n; if (!this._root && this._c) this._init(); this._draw(); } }
  connectedCallback() { if (this._h && this._root) this._draw(); }
  _draw() {
    const h = this._h; if (!h || !this._root) return;
    const e = k => `sensor.${this._c.device}_${k}`, v = k => num(h, e(k));
    const pv = v("pv_moc_suma") ?? 0, bp = v("bateria_moc") ?? 0, grid = v("siec_moc_suma") ?? 0, dom = v("obciazenie_moc_suma");
    const soc = v("bateria_soc"), chg = bp < -20, dis = bp > 20;
    const box = (k, html, cls = "") => { const [l, t, w, hh] = POS[k]; return `<div class="t ${cls}" style="left:${l}%;top:${t}%;width:${w}%;height:${hh}%">${html}</div>`; };
    const cells = [0, 1, 2, 3].map(i => `<i class="${soc != null && soc > i * 25 + 5 ? "on" : ""}"></i>`).join("");
    const bc = chg ? "or" : "gr";
    this._root.getElementById("f").innerHTML = flowSvg("0 0 1496 720", FLOW, lines(pv, bp, grid), [18, 13, 4.5], "flc");
    this._root.getElementById("t").innerHTML =
      box("pv", `<div class="ic">${icR("sun", 40)}</div><div class="tx"><div class="lab">PV</div><div class="val">${W(pv)}</div><div class="sub">Dziś: <span class="b">${fmt(v("energia_pv_produkcja_dzisiaj"), 1, "kWh")}</span></div></div>`) +
      box("bat", `<div class="bat ${bc}">${cells}</div><div class="tx"><div class="lab">Bateria</div><div class="val">${fmt(soc, 0, "%")}</div><div class="val ${chg || dis ? bc : ""}">${W(bp)}</div>
        <div class="sub b">${fmt(v("energia_bateria_ladowanie_dzisiaj"), 1)} / ${fmt(v("energia_bateria_rozladowanie_dzisiaj"), 1, "kWh")}</div><div class="sub b">${fmt(v("bateria_napiecie"), 1, "V")} • ${fmt(v("temperatura_baterii"), 1, "°C")}</div></div>`) +
      box("dom", `<div class="lab"><span style="color:#60c8ff;display:flex">${icR("home", 24)}</span>Dom</div><div class="val">${W(dom)}</div><div class="sub">Dziś: ${fmt(v("energia_zuzycie_dom_dzisiaj"), 1, "kWh")}</div>`, "dom") +
      box("grid", `<div class="ic">${icR("tower", 40)}</div><div class="tx"><div class="lab">Sieć</div><div class="val">${W(grid)}</div><div class="sub ${grid > 20 ? "rd" : grid < -20 ? "bl" : ""}">${grid > 20 ? "Pobór" : grid < -20 ? "Oddawanie" : "–"}</div>
        <div class="sub ie">Import <span class="rd">${fmt(v("energia_siec_import_dzisiaj"), 1, "kWh")}</span></div><div class="sub ie">Eksport <span class="bl">${fmt(v("energia_siec_export_dzisiaj"), 1, "kWh")}</span></div></div>`);
    // wiersz rozliczenia PGE (encje EMS z translation_key pge_*)
    const reg = Object.values(h.entities || {}), pid = k => reg.find(x => x.platform === "ems" && x.translation_key === "pge_" + k)?.entity_id;
    const inv = num(h, pid("invoice_forecast")), dep = num(h, pid("deposit_estimate")), mies = new Date().toLocaleDateString("pl-PL", { month: "long" });
    this._root.getElementById("pge").innerHTML = pid("invoice_forecast") ? `<div class="pge"><div>Rachunek PGE – ${mies}<b class="${inv > 0 ? "rd" : "gr"}">${fmt(inv, 2, "zł")}</b></div><div>Depozyt<b class="gr">${fmt(dep, 2, "zł")}</b></div></div>` : "";
  }
}
if (!customElements.get("ems-card")) customElements.define("ems-card", EmsCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === "ems-card")) window.customCards.push({ type: "ems-card", name: "EMS – kafelek", description: "PV, bateria, dom i sieć z animowanymi liniami przesyłu", preview: true });
