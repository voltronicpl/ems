// EMS – panel boczny Home Assistant (v0.2.0)
// Czyta encje dataloggera ESPHome (sensor./number./switch./select.<device>_*) i zapisuje przez usługi HA.
const S = (h, id) => h && h.states[id];
const num = (h, id, d = null) => { const s = S(h, id); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? d : v; };
const fmt = (v, d = 1, u = "") => v === null || v === undefined ? "–" : `${Number(v).toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d })}${u ? " " + u : ""}`;
const TABS = ["Przegląd", "Plan", "Parametry EMS", "Konfiguracja inwertera"];

function g12(now = new Date()) {
  // PGE G12: licznik na czasie zimowym. Zima 1.10–31.03: tania 13–15, 22–6; lato 1.04–30.09: 15–17, 22–6 (czas licznika).
  const m = now.getMonth() + 1, summer = m >= 4 && m <= 9;
  const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
  const dst = now.getTimezoneOffset() < jan ? 1 : 0;
  const h = (now.getHours() - dst + 24) % 24 + now.getMinutes() / 60;
  const day = summer ? [15, 17] : [13, 15];
  const cheap = h >= 22 || h < 6 || (h >= day[0] && h < day[1]);
  const p = (x) => `${(x + dst) % 24}:00`;
  return { cheap, summer, label: `${p(day[0])}–${p(day[1])}, ${p(22)}–${p(6)}` };
}

class EmsDashboard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.tab = 0; this.dirty = {}; }
  set panel(p) { this.dev = (p && p.config && p.config.device) || "ecobss"; }
  set narrow(n) { this._narrow = n; }
  set hass(h) { this._hass = h; if (!this._t || Date.now() - this._t > 1000) { this._t = Date.now(); this.render(); } }
  e(k, dom = "sensor") { return `${dom}.${this.dev}_${k}`; }
  v(k, d = null) { return num(this._hass, this.e(k), d); }

  call(domain, service, data) { return this._hass.callService(domain, service, data); }
  setNum(id, value) { return this.call("number", "set_value", { entity_id: id, value }); }

  css() { return `
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
  `; }

  render() {
    if (!this._hass) return;
    const h = this._hass, z = g12();
    const tabs = TABS.map((t, i) => `<div class="tab ${i === this.tab ? "on" : ""}" data-tab="${i}">${t}</div>`).join("");
    const body = [this.overview, this.plan, this.params, this.inverter][this.tab].call(this, h, z);
    this.shadowRoot.innerHTML = `<style>${this.css()}</style>
      <div class="top"><h1>EMS – ${this.dev}</h1><div class="tabs">${tabs}</div></div>${body}`;
    this.bind();
  }

  overview(h, z) {
    const soc = this.v("bateria_soc"), bp = this.v("bateria_moc"), pv = this.v("pv_moc_suma"),
      load = this.v("obciazenie_moc_suma"), grid = this.v("siec_moc_suma"), avail = S(h, this.e("bateria_soc"));
    const dom = this.v("energia_zuzycie_dom_dzisiaj", 0), imp = this.v("energia_siec_import_dzisiaj", 0),
      exp = this.v("energia_siec_export_dzisiaj", 0), pvd = this.v("energia_pv_produkcja_dzisiaj", 0);
    const fromGrid = Math.min(imp, dom), fromPv = Math.min(pvd - exp, dom - fromGrid), fromBat = Math.max(dom - fromGrid - Math.max(fromPv, 0), 0);
    const pc = (x) => dom > 0 ? Math.max(0, Math.round(x / dom * 100)) : 0;
    const L = ["L1", "L2", "L3"];
    const phase = (pre, unit, d) => L.map(l => `<div class="row"><span>${l}</span><span>${fmt(this.v(`${pre}_${l.toLowerCase()}`), d, unit)}</span></div>`).join("");
    return `
      ${avail ? "" : `<div class="card err">Brak danych z dataloggera <b>${this.dev}</b>. Sprawdź, czy ESPHome jest online.</div>`}
      <div class="card"><div class="h"><span>Stan teraz</span>
        <span class="pill ${z.cheap ? "ok" : "warn"}">${z.cheap ? "Tania" : "Droga"} strefa G12 · tania ${z.label} · ${z.summer ? "lato" : "zima"}</span></div>
        <div class="g4">
          <div class="m"><div class="l">Bateria</div><div class="v">${fmt(soc, 0, "%")}</div><div class="l">${fmt(this.v("bateria_napiecie"), 2, "V")} · ${fmt(this.v("temperatura_baterii"), 1, "°C")}</div></div>
          <div class="m"><div class="l">Bateria moc</div><div class="v">${fmt(bp, 0, "W")}</div><div class="l">${bp === null ? "" : bp < 0 ? "ładowanie" : bp > 0 ? "rozładowanie" : "postój"}</div></div>
          <div class="m"><div class="l">PV</div><div class="v">${fmt(pv, 0, "W")}</div><div class="l">dziś ${fmt(pvd, 1, "kWh")}</div></div>
          <div class="m"><div class="l">Dom</div><div class="v">${fmt(load, 0, "W")}</div><div class="l">dziś ${fmt(dom, 1, "kWh")}</div></div>
          <div class="m"><div class="l">Sieć</div><div class="v">${fmt(grid, 0, "W")}</div><div class="l">${grid === null ? "" : grid > 0 ? "pobór" : grid < 0 ? "oddawanie" : ""}</div></div>
          <div class="m"><div class="l">BMS</div><div class="v">${fmt(this.v("bms_soh"), 0, "%")}</div><div class="l">SOH · SOC ${fmt(this.v("bms_soc"), 0, "%")}</div></div>
        </div></div>
      <div class="g2">
        <div class="card"><div class="h">Energia dziś</div>
          <div class="row"><span>Import z sieci</span><span>${fmt(imp, 1, "kWh")}</span></div>
          <div class="row"><span>Eksport do sieci</span><span>${fmt(exp, 1, "kWh")}</span></div>
          <div class="row"><span>Bateria ładowanie / rozładowanie</span><span>${fmt(this.v("energia_bateria_ladowanie_dzisiaj"), 1)} / ${fmt(this.v("energia_bateria_rozladowanie_dzisiaj"), 1, "kWh")}</span></div>
          <div class="row"><span>Produkcja PV</span><span>${fmt(pvd, 1, "kWh")}</span></div>
          <div class="row"><span>Zużycie domu</span><span>${fmt(dom, 1, "kWh")}</span></div></div>
        <div class="card"><div class="h">Autokonsumpcja</div>
          <div class="bar"><div style="width:${pc(fromPv)}%;background:#1D9E75"></div><div style="width:${pc(fromBat)}%;background:#7F77DD"></div><div style="width:${pc(fromGrid)}%;background:#B4B2A9"></div></div>
          <div class="l">Dom: PV ${pc(fromPv)}% · bateria ${pc(fromBat)}% · sieć ${pc(fromGrid)}%</div>
          <div class="row"><span>PV zużyte w domu</span><span>${pvd > 0 ? Math.round(Math.max(pvd - exp, 0) / pvd * 100) : 0}%</span></div>
          <div class="row"><span>Oddane do sieci</span><span>${fmt(exp, 1, "kWh")}</span></div></div>
      </div>
      <div class="g3">
        <div class="card"><div class="h">Sieć <span class="l">${fmt(this.v("siec_czestotliwosc"), 2, "Hz")}</span></div>${phase("siec_napiecie", "V", 1)}${L.map(l => `<div class="row"><span>Moc ${l}</span><span>${fmt(this.v("siec_moc_" + l.toLowerCase()), 0, "W")}</span></div>`).join("")}</div>
        <div class="card"><div class="h">Przetwornica</div>${phase("przetwornica_napiecie", "V", 1)}<div class="row"><span>Moc suma</span><span>${fmt(this.v("przetwornica_moc_suma"), 0, "W")}</span></div><div class="row"><span>Temp. / radiator</span><span>${fmt(this.v("temperatura_przetwornicy"), 1)} / ${fmt(this.v("temperatura_radiatora"), 1, "°C")}</span></div></div>
        <div class="card"><div class="h">PV</div>${[1, 2, 3, 4].map(i => `<div class="row"><span>PV${i}</span><span>${fmt(this.v("pv" + i + "_moc"), 0, "W")}${i < 3 ? ` · ${fmt(this.v("pv" + i + "_napiecie"), 1, "V")}` : ""}</span></div>`).join("")}</div>
      </div>`;
  }

  plan() {
    return `<div class="card"><div class="h">Plan dziś + jutro (sloty 15 min)</div>
      <p class="note">Algorytm planowania (prognoza zużycia i PV, ceny RCE, ładowanie w taniej strefie, sprzedaż w najdroższych slotach) wejdzie w kolejnej wersji. Do tego czasu harmonogram ustawiasz ręcznie w zakładce „Konfiguracja inwertera”.</p></div>`;
  }

  params() {
    const row = (n, l, z, u) => `<div class="tou" style="grid-template-columns:minmax(0,1.4fr) 1fr 1fr"><span>${n}</span><div class="inp"><input disabled value="${l}"><span>${u}</span></div><div class="inp" style="border-color:var(--primary-color)"><input disabled value="${z}"><span>${u}</span></div></div>`;
    const lim = (n, k, u) => `<div class="row"><span>🔒 ${n}</span><span>${fmt(num(this._hass, `number.${this.dev}_${k}`), 0, u)}</span></div>`;
    return `<div class="card"><div class="h"><span>Przeliczniki i progi</span><span class="pill info">edycja w kolejnej wersji</span></div>
      <div class="tou" style="grid-template-columns:minmax(0,1.4fr) 1fr 1fr;border:0"><span class="l">Parametr</span><span class="l">Lato (1.04–30.09)</span><span class="l">Zima (1.10–31.03)</span></div>
      ${row("Limit sprzedaży", "1,5", "2,0", "× PV")}${row("Próg sprzedaży – tania", "1,10", "1,10", "zł")}${row("Próg sprzedaży – droga", "2,40", "2,40", "zł")}${row("Próg „za bezcen”", "0,10", "0,10", "zł")}</div>
      <div class="card lock"><div class="h" style="color:var(--error-color)">🔒 Limity twarde – nie do ruszenia przez algorytm</div>
      ${lim("Max sprzedaż do sieci", "limit_twardy_max_moc_sprzedazy", "W")}${lim("Max prąd ładowania baterii", "limit_twardy_max_prad_ladowania_baterii", "A")}${lim("Max prąd rozładowania baterii", "limit_twardy_max_prad_rozladowania_baterii", "A")}${lim("Prąd ładowania z sieci", "limit_twardy_prad_ladowania_z_sieci", "A")}
      <div class="row"><span>🔒 SOC min / burza / max</span><span>25% / 50% / 98%</span></div>
      <p class="note">Limity ustawiasz w zakładce „Konfiguracja inwertera”.</p></div>`;
  }

  // --- pola edytowalne: tylko zmienione idą do zapisu ---
  field(k, label, unit, opt = {}) {
    const id = `number.${this.dev}_${k}`, cur = num(this._hass, id), d = this.dirty[id];
    const val = d !== undefined ? d : cur;
    if (opt.range) return `<div class="${opt.lock ? "lk" : ""}"><label class="f">${opt.lock ? "🔒 " : ""}${label}: ${val ?? "–"}${unit}</label><input type="range" min="0" max="100" step="1" data-num="${id}" value="${val ?? 0}"></div>`;
    return `<div class="${opt.lock ? "lk" : ""}"><label class="f">${opt.lock ? "🔒 " : ""}${label}</label><div class="inp ${d !== undefined ? "chg" : ""}"><input type="number" data-num="${id}" value="${val ?? ""}"><span>${unit}</span></div></div>`;
  }
  sw(dom, k, label) {
    const id = `${dom}.${this.dev}_${k}`, on = S(this._hass, id)?.state === "on";
    return `<div class="sw" data-sw="${id}"><div class="tg ${on ? "on" : ""}"></div>${label}</div>`;
  }
  sel(k, label) {
    const id = `select.${this.dev}_${k}`, s = S(this._hass, id), opts = s?.attributes?.options || [];
    return `<div><label class="f">${label}</label><select data-sel="${id}" style="width:100%;padding:7px;border-radius:8px;background:var(--secondary-background-color);color:inherit;border:1px solid var(--divider-color)">${opts.map(o => `<option ${o === s.state ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  }
  group(title, inner, keys) {
    const n = keys.filter(k => this.dirty[`number.${this.dev}_${k}`] !== undefined).length;
    return `<div class="card"><div class="h"><span>${title}</span><span class="l">${n ? n + " zmian do zapisu" : ""}</span></div>${inner}
      <div class="btns"><button class="sec" data-read="${keys.join(",")}">Odczyt</button><button data-save="${keys.join(",")}" ${n ? "" : "disabled"}>Zapisz</button></div></div>`;
  }
  inverter() {
    const bat = ["limit_twardy_max_prad_ladowania_baterii", "limit_twardy_max_prad_rozladowania_baterii", "poziom_wylaczenia_load", "niski_poziom_baterii", "poziom_wlaczenia_load"];
    const mode = ["limit_twardy_prad_ladowania_z_sieci", "limit_twardy_max_moc_sprzedazy", "max_moc_sprzedazy_z_pv", "interwal_odczytu"];
    const tk = []; for (let p = 1; p <= 6; p++) tk.push(`tou_${p}_start_hhmm`, `tou_${p}_moc`, `tou_${p}_autokonsumpcja_do`, `tou_${p}_sprzedaj_do`);
    const tou = [1, 2, 3, 4, 5, 6].map(p => `<div class="tou">${this.sw("switch", `tou_${p}_ladowanie_z_sieci`, `Z sieci ${p}`)}
      ${this.field(`tou_${p}_start_hhmm`, `Punkt ${p} (HHMM)`, "")}${this.field(`tou_${p}_moc`, `Moc ${p}`, "W")}
      ${this.field(`tou_${p}_autokonsumpcja_do`, `Autokonsumpcja ${p}`, "%", { range: 1 })}${this.field(`tou_${p}_sprzedaj_do`, `Sprzedaj do ${p}`, "%", { range: 1 })}</div>`).join("");
    return `
      ${this.group("Bateria – podstawowe", `<div class="g3">${this.field(bat[0], "Limit prądu ładowania", "A", { lock: 1 })}${this.field(bat[1], "Limit prądu rozładowania", "A", { lock: 1 })}<div></div>
        ${this.field(bat[2], "Poziom wyłączenia LOAD", "%", { range: 1 })}${this.field(bat[3], "Niski poziom baterii", "%", { range: 1 })}${this.field(bat[4], "Poziom włączenia LOAD", "%", { range: 1 })}</div>`, bat)}
      ${this.group("Tryb pracy – podstawowe", `<div class="g3">${this.field(mode[0], "Prąd ładowania z sieci", "A", { lock: 1 })}${this.field(mode[1], "Maksymalna moc sprzedaży", "W", { lock: 1 })}${this.field(mode[2], "Max moc sprzedaży z PV", "W")}
        ${this.sel("priorytet_energii", "Priorytet energii")}${this.sel("tryb_limitu_eksportu", "Tryb limitu eksportu")}${this.field(mode[3], "Interwał odczytu", "s")}
        <div>${this.sw("switch", "harmonogram_tou", "Harmonogram pracy")}</div><div>${this.sw("switch", "ladowanie_z_sieci_dozwolone", "Ładowanie z sieci dozwolone")}</div><div>${this.sw("switch", "sprzedaj_nadwyzke_pv", "Sprzedaj nadwyżkę PV")}</div></div>`, mode)}
      ${this.group("Harmonogram (TOU)", `<div class="tou" style="border:0"><span class="l">Ładowanie</span><span class="l">Start</span><span class="l">Moc</span><span class="l">Autokonsumpcja do</span><span class="l">Sprzedaj do</span></div>${tou}`, tk)}
      <p class="note">Przełączniki i listy zapisują się od razu. Pola liczbowe i suwaki – po kliknięciu „Zapisz” w grupie. 🔒 = limit twardy.</p>`;
  }

  bind() {
    const r = this.shadowRoot;
    r.querySelectorAll("[data-tab]").forEach(el => el.onclick = () => { this.tab = +el.dataset.tab; this.render(); });
    r.querySelectorAll("[data-num]").forEach(el => {
      el.onchange = () => { this.dirty[el.dataset.num] = parseFloat(el.value); this.render(); };
      el.oninput = () => { if (el.type === "range") el.previousElementSibling.textContent = el.previousElementSibling.textContent.replace(/: .*$/, `: ${el.value}%`); };
      el.onfocus = () => { this._t = Date.now() + 60000; };   // nie odświeżaj w trakcie pisania
    });
    r.querySelectorAll("[data-sw]").forEach(el => el.onclick = () => this.call("switch", "toggle", { entity_id: el.dataset.sw }));
    r.querySelectorAll("[data-sel]").forEach(el => el.onchange = () => this.call("select", "select_option", { entity_id: el.dataset.sel, option: el.value }));
    r.querySelectorAll("[data-read]").forEach(el => el.onclick = () => {
      el.dataset.read.split(",").forEach(k => delete this.dirty[`number.${this.dev}_${k}`]);
      this.call("homeassistant", "update_entity", { entity_id: el.dataset.read.split(",").map(k => `number.${this.dev}_${k}`) }).catch(() => {});
      this.render();
    });
    r.querySelectorAll("[data-save]").forEach(el => el.onclick = async () => {
      for (const k of el.dataset.save.split(",")) {
        const id = `number.${this.dev}_${k}`;
        if (this.dirty[id] !== undefined) { await this.setNum(id, this.dirty[id]); delete this.dirty[id]; }
      }
      this.render();
    });
  }
}
if (!customElements.get("ems-dashboard")) customElements.define("ems-dashboard", EmsDashboard);
