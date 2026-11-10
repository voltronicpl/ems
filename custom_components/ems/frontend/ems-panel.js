// EMS – panel boczny Home Assistant w stylu PGE Net-Billing. Rdzen + zakladki jako osobne moduly (tabs/*.js).
import { S, num, g12, CSS, esc, bindCharts, ui } from "./core.js";
const V = new URL(import.meta.url).search;
const LOGO = new URL("./logo.png", import.meta.url).href, BG = new URL("./bg.jpg", import.meta.url).href;   // logo w naglowku (sciezka z wersja -> bez starego cache)             // ?v=wersja -> takze dla modulow zakladek
const NAMES = ["overview", "pge", "plan", "settings", "diag"];
const TABS = await Promise.all(NAMES.map(n => import(`./tabs/${n}.js${V}`)));

class EmsDashboard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.tab = 0; this.dirty = {}; this.pend = {}; this.rd = {}; this.bad = {}; this.toasts = []; }
  set panel(p) { this.dev = (p && p.config && p.config.device) || "ecobss"; }
  set narrow(n) { const ch = this._narrow !== n; this._narrow = n; if (ch && this._hass) this.render(true); }
  // Telefon / Fold: przerysuj, gdy szerokosc zmieni sie wyraznie (zlozenie, obrot) – wykresy licza viewBox z szerokosci.
  connectedCallback() {
    if (this._ro) return;
    this._ro = new ResizeObserver(() => { const w = this.clientWidth; if (w && Math.abs(w - (this._w || 0)) > 40) { this._w = w; if (this._hass && !this._hold) this.render(true); } });
    this._ro.observe(this);
  }
  disconnectedCallback() { this._ro?.disconnect(); this._ro = null; }
  set hass(h) { this._hass = h; if (!this._hold && (!this._t || Date.now() - this._t > 2000)) this.render(); }
  get hass() { return this._hass; }
  get zone() { return g12(); }
  e(k, dom = "sensor") { return `${dom}.${this.dev}_${k}`; }
  v(k, d = null) { return num(this._hass, this.e(k), d); }
  call(domain, service, data) { return this._hass.callService(domain, service, data).catch(e => this.log(`Błąd ${domain}.${service}: ${e.message}`)); }
  log(msg) { this._hass.callApi("POST", "ems/log", { msg }).catch(() => {}); }

  // --- zapis ze sprawdzeniem: backend zapisuje, czeka na nastepny odczyt z falownika i porownuje ---
  toast(kind, title, lines = []) {
    const t = { id: Date.now() + Math.random(), kind, title, lines };
    this.toasts = [...this.toasts.slice(-3), t];
    if (kind === "ok") setTimeout(() => { this.toasts = this.toasts.filter(x => x !== t); this.render(true); }, 6000);
    this.render(true);
  }
  async zapisz(items) {
    if (!items.length) return;
    items.forEach(i => { this.pend[i.entity_id] = 1; delete this.bad[i.entity_id]; });
    this.render(true);
    let res;
    try { res = await this._hass.callApi("POST", "ems/zapis", { dev: this.dev, items }); }
    catch (e) { res = { ok: false, items: items.map(i => ({ ...i, ok: false, msg: `brak odpowiedzi EMS: ${e.message || e}` })) }; }
    const name = id => S(this._hass, id)?.attributes?.friendly_name || id.split(".")[1];
    for (const r of res.items) {
      delete this.pend[r.entity_id];
      if (r.ok) { delete this.dirty[r.entity_id]; delete this.bad[r.entity_id]; } else this.bad[r.entity_id] = r.msg;
    }
    const ok = res.items.filter(r => r.ok), bad = res.items.filter(r => !r.ok);
    const dev = res.items.some(r => !r.entity_id.split(".")[1].startsWith("ems_"));
    const same = ok.filter(r => r.same), wr = ok.filter(r => !r.same);
    const okLines = [...wr.map(r => `${name(r.entity_id)} = ${r.got}`), ...same.map(r => `${name(r.entity_id)} = ${r.got} – bez zmian, nie wysyłano`)];
    if (!bad.length) this.toast("ok", wr.length ? `✅ Zapisano${dev ? " – falownik potwierdził" : ""} (${wr.length})${same.length ? `, bez zmian ${same.length}` : ""}` : `✅ Bez zmian – falownik już ma te wartości (${same.length})`, okLines);
    else this.toast("err", `❌ Nie zapisano ${bad.length} z ${res.items.length}`, [...bad.map(r => `❌ ${name(r.entity_id)}: ${r.msg}`), ...ok.map(r => `✅ ${name(r.entity_id)} = ${r.got} – ${r.same ? "bez zmian" : "zapisano"}`)]);
  }

  // Przycisk "Odczyt": datalogger czyta ustawienia z falownika od razu, potem komunikat "Odczytano" i swieze wartosci w polach.
  async odczyt(ids) {
    ids.forEach(i => { delete this.dirty[i]; delete this.bad[i]; });
    const dev = ids.filter(i => !i.split(".")[1].startsWith("ems_"));
    if (!dev.length) { this.toast("ok", "✅ Odczytano (parametry EMS)", []); return; }
    dev.forEach(i => { this.rd[i] = 1; }); this.render(true);
    let res;
    try { res = await this._hass.callApi("POST", "ems/odczyt", { dev: this.dev, ids: dev }); } catch (e) { res = { ok: false, msg: `brak odpowiedzi EMS: ${e.message || e}`, items: [] }; }
    dev.forEach(i => { delete this.rd[i]; });
    const name = id => S(this._hass, id)?.attributes?.friendly_name || id.split(".")[1];
    if (res.ok) this.toast("ok", `✅ Odczytano z falownika o ${res.at}`, res.items.map(x => `${name(x.entity_id)} = ${x.got}`));
    else this.toast("err", `❌ Nie odczytano: ${res.msg}`, []);
  }
  // --- pola wspolne: zmiany zbierane w grupie, zapis przyciskiem "Zapisz" ---
  // ID encji dataloggera: dokladne, a jak go nie ma - ta sama encja pod innym ID (HA nadal np. sufiks _2 albo prefiks urzadzenia),
  // szukana po koncowce ID albo po nazwie z rejestru. Wynik zapamietany do przeladowania panelu.
  rid(id, label) {
    const h = this._hass; if (!h || h.states[id]) return id;
    const memo = this._rid = this._rid || {}; if (memo[id] && h.states[memo[id]]) return memo[id];
    const [dom, obj] = id.split("."), base = obj.replace(/^[^_]+_/, ""), norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, " ").trim();
    const want = norm(label);
    const hit = Object.keys(h.states).filter(e => e.startsWith(dom + ".")).find(e => { const o = e.split(".")[1]; return o === base || o.endsWith("_" + base) || o.startsWith(obj + "_") || (want && norm(h.states[e].attributes?.friendly_name).endsWith(want)); });
    if (hit) memo[id] = hit;
    return hit || id;
  }
  input(id) { const v = num(this._hass, id); return `<input type="number" step="any" data-num="${id}" data-now="1" value="${v ?? ""}">`; }
  field(id, unit, o = {}) {
    const cur = num(this._hass, id), d = this.dirty[id], val = d !== undefined ? d : cur, miss = !S(this._hass, id);
    const st = this.pend[id] ? "pend" : this.bad[id] ? "bad" : d !== undefined ? "chg" : "";
    if (o.time) { const hm = val == null ? "" : `${String(Math.floor(val / 100)).padStart(2, "0")}:${String(Math.round(val % 100)).padStart(2, "0")}`;   // HHMM -> "HH:MM"
      return `<div class="inp ${st}" title="${esc(this.bad[id] || id)}"><input type="time" step="300" data-num="${id}" data-hhmm="1" value="${hm}" ${o.ro || miss ? "disabled" : ""}><span>godz.</span></div>`; }
    return `<div class="inp ${st} ${o.lock ? "lk" : ""} ${o.act ? "act" : ""}" title="${esc(this.bad[id] || id)}"><input type="number" step="any" data-num="${id}" value="${val ?? ""}" ${o.ro || miss ? "disabled" : ""} placeholder="${miss ? "brak encji" : ""}"><span>${unit}</span></div>`;
  }
  range(id, label, ro) {
    const cur = num(this._hass, id), d = this.dirty[id], val = d !== undefined ? d : cur;
    return `<div><label class="f">${label ? label + ": " : ""}<b style="margin-left:4px">${val ?? "–"}%</b></label><input type="range" min="0" max="100" step="1" data-num="${id}" value="${val ?? 0}" ${ro ? "disabled" : ""}></div>`;
  }
  sw(id, label, ro) { const s = S(this._hass, id), on = s?.state === "on", st = this.pend[id] ? "pend" : this.bad[id] ? "bad" : ""; return `<div class="sw ${st}" ${ro || !s || this.pend[id] ? "" : `data-sw="${id}"`} title="${esc(this.bad[id] || id)}" style="${ro || !s ? "opacity:.5;cursor:default" : ""}"><div class="tg ${on ? "on" : ""}"></div>${this.pend[id] ? "⏳ sprawdzam…" : label || (s ? (on ? "Włączony" : "Wyłączony") : "brak encji")}</div>`; }
  sel(id) {
    const s = S(this._hass, id), opts = s?.attributes?.options || [];
    return s ? `<select data-sel="${id}" class="${this.pend[id] ? "pend" : this.bad[id] ? "bad" : ""}" title="${esc(this.bad[id] || id)}" ${this.pend[id] ? "disabled" : ""}>${opts.map(o => `<option ${o === s.state ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : `<div class="inp"><input disabled placeholder="brak encji"></div>`;
  }
  group(title, inner, ids, cls = "") {
    const k = ids.filter(i => this.dirty[i] !== undefined && !this.pend[i]).length, p = ids.filter(i => this.pend[i]).length, b = ids.filter(i => this.bad[i]).length, rd = ids.some(i => this.rd[i]);
    const st = rd ? `<span class="lab t-o">⏳ odczytuję z falownika…</span>` : p ? `<span class="lab t-o">⏳ zapis – sprawdzam w falowniku (${p})…</span>` : b ? `<span class="lab t-r">❌ ${b} niezapisane – najedź / dotknij czerwone pole</span>` : `<span class="lab">${k ? k + " zmian do zapisu" : ""}</span>`;
    return `<div class="box ${cls}"><div class="h"><span>${title}</span>${st}</div>${inner}
      ${ids.length ? `<div class="btns"><button class="btn" data-read="${ids.join(",")}" ${p || rd ? "disabled" : ""}>${rd ? "Odczytuję…" : "Odczyt"}</button><button class="btn pri" data-save="${ids.join(",")}" ${k && !p ? "" : "disabled"}>${p ? "Sprawdzam…" : "Zapisz"}</button></div>` : ""}</div>`;
  }

  render(force) {
    if (!this._hass) return;
    this._t = Date.now();
    const T = TABS[this.tab], ver = new URLSearchParams(V).get("v") || "";
    ui.w = this.clientWidth || window.innerWidth; ui.mob = ui.w <= 700; this._w = ui.w;
    let body;
    try { body = T.render(this); } catch (e) { body = `<div class="box err">Błąd zakładki „${T.title}”: ${esc(e.message)}</div>`; console.error("[EMS]", e); }
    const last = S(this._hass, this.e("bateria_soc"))?.last_updated;
    const tx = this.shadowRoot.querySelector(".tabs")?.scrollLeft || 0;
    this.shadowRoot.innerHTML = `<style>${CSS}</style><main class="pf"><div class="pf-bg" style="background-image:url(${BG})"></div><div class="wrap">
      <div class="pf-head ${this._narrow ? "mob" : ""}"><div class="pf-brand"><button class="menu" data-menu title="Menu Home Assistant">☰</button><img class="brand" src="${LOGO}" alt="EMS – Energy Management System"><div><div class="pf-sub">datalogger ${esc(this.dev)} · ostatni odczyt ${last ? new Date(last).toLocaleTimeString("pl-PL") : "–"} · v${ver}</div></div></div>
      <div class="tabs">${TABS.map((t, i) => `<button class="tab ${i === this.tab ? "on" : ""}" data-tab="${i}">${t.title}</button>`).join("")}</div>${(() => { const ps = S(this._hass, "sensor.ems_plan")?.state; const M = { charge: "Ładowanie z sieci", sell: "Sprzedaż", self: "Autokonsumpcja", block: "Blokada eksportu", wylaczony: "Algorytm wyłączony", brak_planu: "Brak planu", reczne_buy: "Ręczne kupno", reczne_sell: "Ręczna sprzedaż" }; return ps ? `<span class="pf-mode">🍃 Tryb: <b>${esc(M[ps] || ps)}</b></span>` : ""; })()}</div>${body}</div></main>
      <div class="toasts">${this.toasts.map(t => `<div class="toast ${t.kind}" data-toast="${t.id}"><b>${esc(t.title)}</b>${t.lines.slice(0, 8).map(l => `<div>${esc(l)}</div>`).join("")}${t.lines.length > 8 ? `<div>… i ${t.lines.length - 8} więcej</div>` : ""}<span class="x">✕</span></div>`).join("")}</div>`;
    const tb = this.shadowRoot.querySelector(".tabs"); if (tb) tb.scrollLeft = tx;
    this.bind();
    bindCharts(this.shadowRoot, () => this.render(true));
    if (T.bind) T.bind(this, this.shadowRoot);
  }

  bind() {
    const r = this.shadowRoot;
    r.querySelectorAll("[data-tab]").forEach(el => el.onclick = () => { this.tab = +el.dataset.tab; this.tabAt = Date.now(); this.render(); if (ui.mob) this.scrollIntoView?.({ block: "start" }); });
    // ☰ – na waskim ekranie HA chowa pasek boczny; bez tego przycisku nie da sie wyjsc z panelu
    r.querySelector("[data-menu]")?.addEventListener("click", () => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })));
    r.querySelectorAll("[data-num]").forEach(el => {
      el.onfocus = () => { this._hold = true; };
      el.onblur = () => { setTimeout(() => { this._hold = false; }, 300); };
      el.oninput = () => { if (el.type === "range") { const b = el.previousElementSibling?.querySelector("b"); if (b) b.textContent = el.value + "%"; } };
      el.onchange = () => {
        this._hold = false;
        const id = el.dataset.num, v = el.dataset.hhmm ? (([h, m]) => h * 100 + m)(el.value.split(":").map(Number)) : parseFloat(el.value);
        if (isNaN(v)) return;
        if (el.dataset.now) { this.call("number", "set_value", { entity_id: id, value: v }); return; }
        this.dirty[id] = v; this.render();
      };
    });
    r.querySelectorAll("[data-sw]").forEach(el => el.onclick = () => { const id = el.dataset.sw; this.zapisz([{ entity_id: id, value: S(this._hass, id)?.state !== "on" }]); });
    r.querySelectorAll("[data-sel]").forEach(el => el.onchange = () => this.zapisz([{ entity_id: el.dataset.sel, value: el.value }]));
    r.querySelectorAll("[data-toast]").forEach(el => el.onclick = () => { this.toasts = this.toasts.filter(t => String(t.id) !== el.dataset.toast); this.render(true); });
    r.querySelectorAll("[data-svc]").forEach(el => el.onclick = () => { const [d, s] = el.dataset.svc.split("."); this.call(d, s, { entity_id: el.dataset.ent }); });
    r.querySelectorAll("[data-read]").forEach(el => el.onclick = () => this.odczyt(el.dataset.read.split(",")));
    r.querySelectorAll("[data-save]").forEach(el => el.onclick = () =>
      this.zapisz(el.dataset.save.split(",").filter(id => this.dirty[id] !== undefined && !this.pend[id]).map(id => ({ entity_id: id, value: this.dirty[id] }))));
  }
}
if (!customElements.get("ems-dashboard")) customElements.define("ems-dashboard", EmsDashboard);
