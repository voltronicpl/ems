// EMS – panel boczny Home Assistant. Rdzen: zakladki ladowane jako osobne moduly (tabs/*.js).
import { S, num, g12, CSS } from "./core.js";
const V = new URL(import.meta.url).search;   // ?v=wersja -> takze dla modulow zakladek
const NAMES = ["overview", "plan", "params", "inverter", "diag"];
const TABS = await Promise.all(NAMES.map(n => import(`./tabs/${n}.js${V}`)));

class EmsDashboard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.tab = 0; this.dirty = {}; }
  set panel(p) { this.dev = (p && p.config && p.config.device) || "ecobss"; }
  set narrow(n) { this._narrow = n; }
  set hass(h) { this._hass = h; if (!this._hold && (!this._t || Date.now() - this._t > 1000)) this.render(); }
  get hass() { return this._hass; }
  get zone() { return g12(); }
  e(k, dom = "sensor") { return `${dom}.${this.dev}_${k}`; }
  v(k, d = null) { return num(this._hass, this.e(k), d); }
  call(domain, service, data) { return this._hass.callService(domain, service, data); }

  // --- pola wspolne dla zakladek (zapis tylko zmienionych, przycisk Zapisz w grupie) ---
  field(id, unit, active, lock) {
    const cur = num(this._hass, id), d = this.dirty[id], val = d !== undefined ? d : cur;
    return `<div class="inp ${d !== undefined ? "chg" : ""} ${lock ? "lk" : ""}" style="${active ? "border-color:var(--primary-color)" : ""}${lock ? ";border-color:var(--error-color)" : ""}"><input type="number" step="any" data-num="${id}" value="${val ?? ""}"><span>${unit}</span></div>`;
  }
  range(id, label) {
    const cur = num(this._hass, id), d = this.dirty[id], val = d !== undefined ? d : cur;
    return `<div><label class="f">${label}: <b>${val ?? "–"}%</b></label><input type="range" min="0" max="100" step="1" data-num="${id}" value="${val ?? 0}"></div>`;
  }
  sw(id, label) { const on = S(this._hass, id)?.state === "on"; return `<div class="sw" data-sw="${id}"><div class="tg ${on ? "on" : ""}"></div>${label}</div>`; }
  sel(id, label) {
    const s = S(this._hass, id), opts = s?.attributes?.options || [];
    return `<div><label class="f">${label}</label><select data-sel="${id}" style="width:100%;padding:7px;border-radius:8px;background:var(--secondary-background-color);color:inherit;border:1px solid var(--divider-color)">${opts.map(o => `<option ${o === s.state ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  }
  group(title, inner, ids) {
    const k = ids.filter(i => this.dirty[i] !== undefined).length;
    return `<div class="card"><div class="h"><span>${title}</span><span class="l">${k ? k + " zmian do zapisu" : ""}</span></div>${inner}
      <div class="btns"><button class="sec" data-read="${ids.join(",")}">Odczyt</button><button data-save="${ids.join(",")}" ${k ? "" : "disabled"}>Zapisz</button></div></div>`;
  }

  render(force) {
    if (!this._hass) return;
    this._t = Date.now();
    const T = TABS[this.tab];
    let body;
    try { body = T.render(this); } catch (e) { body = `<div class="card err">Błąd zakładki „${T.title}”: ${e.message}</div>`; console.error("[EMS]", e); }
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
      <div class="top"><h1>EMS – ${this.dev}</h1><div class="tabs">${TABS.map((t, i) => `<div class="tab ${i === this.tab ? "on" : ""}" data-tab="${i}">${t.title}</div>`).join("")}</div></div>${body}`;
    this.bind();
    if (T.bind) T.bind(this, this.shadowRoot);
  }

  bind() {
    const r = this.shadowRoot;
    r.querySelectorAll("[data-tab]").forEach(el => el.onclick = () => { this.tab = +el.dataset.tab; this.render(); });
    r.querySelectorAll("[data-num]").forEach(el => {
      el.onfocus = () => { this._hold = true; };
      el.onblur = () => { this._hold = false; };
      el.oninput = () => { if (el.type === "range") { const b = el.previousElementSibling.querySelector("b"); if (b) b.textContent = el.value + "%"; } };
      el.onchange = () => {
        this._hold = false;
        const id = el.dataset.num, v = parseFloat(el.value);
        if (!el.closest(".card")?.querySelector("[data-save]")) { this.call("number", "set_value", { entity_id: id, value: v }); return; }  // pole bez grupy (kup/sprzedaj) – od razu
        this.dirty[id] = v; this.render();
      };
    });
    r.querySelectorAll("[data-sw]").forEach(el => el.onclick = () => this.call("switch", "toggle", { entity_id: el.dataset.sw }));
    r.querySelectorAll("[data-sel]").forEach(el => el.onchange = () => this.call("select", "select_option", { entity_id: el.dataset.sel, option: el.value }));
    r.querySelectorAll("[data-svc]").forEach(el => el.onclick = () => { const [d, s] = el.dataset.svc.split("."); this.call(d, s, { entity_id: el.dataset.ent }); });
    r.querySelectorAll("[data-read]").forEach(el => el.onclick = () => {
      const ids = el.dataset.read.split(","); ids.forEach(i => delete this.dirty[i]);
      this.call("homeassistant", "update_entity", { entity_id: ids.filter(i => !i.startsWith("number.ems_")) }).catch(() => {});
      this.render();
    });
    r.querySelectorAll("[data-save]").forEach(el => el.onclick = async () => {
      for (const id of el.dataset.save.split(",")) if (this.dirty[id] !== undefined) { await this.call("number", "set_value", { entity_id: id, value: this.dirty[id] }); delete this.dirty[id]; }
      this.render();
    });
  }
}
if (!customElements.get("ems-dashboard")) customElements.define("ems-dashboard", EmsDashboard);
