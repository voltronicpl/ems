// EMS – panel boczny Home Assistant w stylu PGE Net-Billing. Rdzen + zakladki jako osobne moduly (tabs/*.js).
import { S, num, g12, CSS, esc, bindCharts } from "./core.js";
const V = new URL(import.meta.url).search;             // ?v=wersja -> takze dla modulow zakladek
const NAMES = ["overview", "plan", "settings", "diag"];
const TABS = await Promise.all(NAMES.map(n => import(`./tabs/${n}.js${V}`)));

class EmsDashboard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.tab = 0; this.dirty = {}; }
  set panel(p) { this.dev = (p && p.config && p.config.device) || "ecobss"; }
  set narrow(n) { this._narrow = n; }
  set hass(h) { this._hass = h; if (!this._hold && (!this._t || Date.now() - this._t > 2000)) this.render(); }
  get hass() { return this._hass; }
  get zone() { return g12(); }
  e(k, dom = "sensor") { return `${dom}.${this.dev}_${k}`; }
  v(k, d = null) { return num(this._hass, this.e(k), d); }
  call(domain, service, data) { return this._hass.callService(domain, service, data).catch(e => this.log(`Błąd ${domain}.${service}: ${e.message}`)); }
  log(msg) { this._hass.callApi("POST", "ems/log", { msg }).catch(() => {}); }

  // --- pola wspolne: zmiany zbierane w grupie, zapis przyciskiem "Zapisz" ---
  input(id) { const v = num(this._hass, id); return `<input type="number" step="any" data-num="${id}" data-now="1" value="${v ?? ""}">`; }
  field(id, unit, o = {}) {
    const cur = num(this._hass, id), d = this.dirty[id], val = d !== undefined ? d : cur, miss = !S(this._hass, id);
    return `<div class="inp ${d !== undefined ? "chg" : ""} ${o.lock ? "lk" : ""} ${o.act ? "act" : ""}" title="${esc(id)}"><input type="number" step="any" data-num="${id}" value="${val ?? ""}" ${o.ro || miss ? "disabled" : ""} placeholder="${miss ? "brak encji" : ""}"><span>${unit}</span></div>`;
  }
  range(id, label, ro) {
    const cur = num(this._hass, id), d = this.dirty[id], val = d !== undefined ? d : cur;
    return `<div><label class="f">${label ? label + ": " : ""}<b style="margin-left:4px">${val ?? "–"}%</b></label><input type="range" min="0" max="100" step="1" data-num="${id}" value="${val ?? 0}" ${ro ? "disabled" : ""}></div>`;
  }
  sw(id, label, ro) { const s = S(this._hass, id), on = s?.state === "on"; return `<div class="sw" ${ro || !s ? "" : `data-sw="${id}"`} title="${esc(id)}" style="${ro || !s ? "opacity:.5;cursor:default" : ""}"><div class="tg ${on ? "on" : ""}"></div>${label || (s ? (on ? "Włączony" : "Wyłączony") : "brak encji")}</div>`; }
  sel(id) {
    const s = S(this._hass, id), opts = s?.attributes?.options || [];
    return s ? `<select data-sel="${id}">${opts.map(o => `<option ${o === s.state ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : `<div class="inp"><input disabled placeholder="brak encji"></div>`;
  }
  group(title, inner, ids, cls = "") {
    const k = ids.filter(i => this.dirty[i] !== undefined).length;
    return `<div class="box ${cls}"><div class="h"><span>${title}</span><span class="lab">${k ? k + " zmian do zapisu" : ""}</span></div>${inner}
      ${ids.length ? `<div class="btns"><button class="btn" data-read="${ids.join(",")}">Odczyt</button><button class="btn pri" data-save="${ids.join(",")}" ${k ? "" : "disabled"}>Zapisz</button></div>` : ""}</div>`;
  }

  render(force) {
    if (!this._hass) return;
    this._t = Date.now();
    const T = TABS[this.tab], ver = new URLSearchParams(V).get("v") || "";
    let body;
    try { body = T.render(this); } catch (e) { body = `<div class="box err">Błąd zakładki „${T.title}”: ${esc(e.message)}</div>`; console.error("[EMS]", e); }
    const last = S(this._hass, this.e("bateria_soc"))?.last_updated;
    const y = this.shadowRoot.host.scrollTop;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><main class="pf"><div class="wrap">
      <div class="pf-head"><div class="pf-brand"><div class="logo">⚡</div><div><h1>EMS</h1><div class="pf-sub">datalogger ${esc(this.dev)} · ostatni odczyt ${last ? new Date(last).toLocaleTimeString("pl-PL") : "–"} · v${ver}</div></div></div>
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === this.tab ? "on" : ""}" data-tab="${i}">${t.title}</button>`).join("")}</div></div>${body}</div></main>`;
    this.bind();
    bindCharts(this.shadowRoot, () => this.render(true));
    if (T.bind) T.bind(this, this.shadowRoot);
  }

  bind() {
    const r = this.shadowRoot;
    r.querySelectorAll("[data-tab]").forEach(el => el.onclick = () => { this.tab = +el.dataset.tab; this.render(); });
    r.querySelectorAll("[data-num]").forEach(el => {
      el.onfocus = () => { this._hold = true; };
      el.onblur = () => { setTimeout(() => { this._hold = false; }, 300); };
      el.oninput = () => { if (el.type === "range") { const b = el.previousElementSibling?.querySelector("b"); if (b) b.textContent = el.value + "%"; } };
      el.onchange = () => {
        this._hold = false;
        const id = el.dataset.num, v = parseFloat(el.value);
        if (isNaN(v)) return;
        if (el.dataset.now) { this.call("number", "set_value", { entity_id: id, value: v }); return; }
        this.dirty[id] = v; this.render();
      };
    });
    r.querySelectorAll("[data-sw]").forEach(el => el.onclick = () => this.call("switch", "toggle", { entity_id: el.dataset.sw }));
    r.querySelectorAll("[data-sel]").forEach(el => el.onchange = () => this.call("select", "select_option", { entity_id: el.dataset.sel, option: el.value }));
    r.querySelectorAll("[data-svc]").forEach(el => el.onclick = () => { const [d, s] = el.dataset.svc.split("."); this.call(d, s, { entity_id: el.dataset.ent }); });
    r.querySelectorAll("[data-read]").forEach(el => el.onclick = () => {
      const ids = el.dataset.read.split(","); ids.forEach(i => delete this.dirty[i]);
      const dev = ids.filter(i => !i.startsWith("number.ems_"));
      if (dev.length) this.call("homeassistant", "update_entity", { entity_id: dev });
      this.render();
    });
    r.querySelectorAll("[data-save]").forEach(el => el.onclick = async () => {
      for (const id of el.dataset.save.split(",")) if (this.dirty[id] !== undefined) { await this.call("number", "set_value", { entity_id: id, value: this.dirty[id] }); this.log(`Zmiana ${id} = ${this.dirty[id]}`); delete this.dirty[id]; }
      this.render();
    });
  }
}
if (!customElements.get("ems-dashboard")) customElements.define("ems-dashboard", EmsDashboard);
