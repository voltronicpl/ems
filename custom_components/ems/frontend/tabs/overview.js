import { S, num, fmt, tip } from "../core.js";
import { T } from "../tips.js";
export const title = "Przegląd";
const ACT = { charge: "ładowanie z sieci", sell: "sprzedaż", self: "autokonsumpcja", block: "blokada eksportu", wylaczony: "algorytm wyłączony", brak_planu: "brak planu", reczne_buy: "RĘCZNE: kupno", reczne_sell: "RĘCZNE: sprzedaż" };
const tile = (ic, cls, lab, val, sub, t) => `<div class="tile"><div class="ic ${cls}">${ic}</div><div><div class="lab">${lab}${tip(t)}</div><div class="val">${val}</div><div class="sub">${sub}</div></div></div>`;
export function render(c) {
  const h = c.hass, z = c.zone, v = (k, d) => c.v(k, d);
  const soc = v("bateria_soc"), bp = v("bateria_moc"), grid = v("siec_moc_suma");
  const dom = v("energia_zuzycie_dom_dzisiaj", 0), imp = v("energia_siec_import_dzisiaj", 0), exp = v("energia_siec_export_dzisiaj", 0), pvd = v("energia_pv_produkcja_dzisiaj", 0);
  const fG = Math.min(imp, dom), fP = Math.max(Math.min(pvd - exp, dom - fG), 0), fB = Math.max(dom - fG - fP, 0), pc = x => dom > 0 ? Math.round(x / dom * 100) : 0;
  const on = S(h, "switch.ems_algorytm")?.state === "on", plan = S(h, "sensor.ems_plan"), man = plan?.attributes?.reczne;
  const L = ["l1", "l2", "l3"];
  return `${S(h, c.e("bateria_soc")) ? "" : `<div class="box err">Brak danych z dataloggera <b>${c.dev}</b>. Sprawdź, czy ESPHome jest online.</div>`}
  <div class="box"><div class="h"><span>🤖 Sterowanie${tip(T.algorytm)}</span><span class="pill ${on ? "g" : "r"}">Teraz: ${ACT[plan?.state] || plan?.state || "–"}</span></div>
    <div class="ctrl">
      <button class="btn full ${on ? "ok" : "off"}" data-svc="switch.toggle" data-ent="switch.ems_algorytm">Algorytm: ${on ? "WŁĄCZONY" : "WYŁĄCZONY"}</button>
      <span class="gap" style="width:12px"></span>
      <div class="ms"><div><label class="f">Kup energię teraz${tip(T.kup)}</label><div class="inp wbuy">${c.input("number.ems_kup_wh")}<span>Wh</span></div></div>
      <button class="btn pri" data-svc="button.press" data-ent="button.ems_kup_teraz">Kup</button></div>
      <div class="ms"><div><label class="f">Sprzedaj teraz${tip(T.sprzedaj)}</label><div class="inp wbuy">${c.input("number.ems_sprzedaj_wh")}<span>Wh</span></div></div>
      <button class="btn pri" data-svc="button.press" data-ent="button.ems_sprzedaj_teraz">Sprzedaj</button></div>
      ${man ? `<span class="pill b">${man.typ}: ${fmt(man.zrobione_kwh, 2)} / ${fmt(man.kwh, 2, "kWh")}</span><button class="btn" data-svc="button.press" data-ent="button.ems_przerwij_reczne">Przerwij</button>` : ""}
    </div></div>
  <div class="h"><span></span><span class="pill ${z.cheap ? "g" : "o"}">${z.cheap ? "Tania" : "Droga"} strefa G12 · tania ${z.label} · ${z.summer ? "lato" : "zima"}${tip(T.strefa)}</span></div>
  <div class="tiles">
    ${tile("🔋", "ic-v", "Bateria", fmt(soc, 0, "%"), `${fmt(v("bateria_napiecie"), 2, "V")} · ${fmt(v("temperatura_baterii"), 1, "°C")}`, T.soc)}
    ${tile("⚡", "ic-v", "Moc baterii", fmt(bp, 0, "W"), bp < 0 ? "ładowanie" : bp > 0 ? "rozładowanie" : "postój", T.bmoc)}
    ${tile("☀", "ic-o", "PV", fmt(v("pv_moc_suma"), 0, "W"), `dziś ${fmt(pvd, 1, "kWh")}`, T.pv)}
    ${tile("🏠", "ic-b", "Dom", fmt(v("obciazenie_moc_suma"), 0, "W"), `dziś ${fmt(dom, 1, "kWh")}`, T.dom)}
    ${tile("🗼", grid > 0 ? "ic-r" : "ic-g", "Sieć", fmt(grid, 0, "W"), grid > 0 ? "pobór" : grid < 0 ? "oddawanie" : "", T.siec)}
    ${tile("🩺", "ic-g", "BMS SOH", fmt(v("bms_soh"), 0, "%"), `max ład. ${fmt(v("bms_prad_ladowania"), 0, "A")}`, T.bms)}
  </div>
  <div class="g2" style="margin-top:14px">
    <div class="box"><div class="h"><span>📊 Energia dziś</span></div>
      <div class="row"><span>Import z sieci</span><b class="t-r">${fmt(imp, 1, "kWh")}</b></div><div class="row"><span>Eksport do sieci</span><b class="t-g">${fmt(exp, 1, "kWh")}</b></div>
      <div class="row"><span>Bateria ład. / rozł.</span><b>${fmt(v("energia_bateria_ladowanie_dzisiaj"), 1)} / ${fmt(v("energia_bateria_rozladowanie_dzisiaj"), 1, "kWh")}</b></div><div class="row"><span>Produkcja PV</span><b class="t-o">${fmt(pvd, 1, "kWh")}</b></div></div>
    <div class="box"><div class="h"><span>♻ Autokonsumpcja${tip(T.autokons)}</span></div>
      <div style="display:flex;height:14px;border-radius:8px;overflow:hidden;margin:6px 0 10px"><div style="width:${pc(fP)}%;background:#1fe090"></div><div style="width:${pc(fB)}%;background:#a78bfa"></div><div style="width:${pc(fG)}%;background:#4a6378"></div></div>
      <div class="row"><span>PV / bateria / sieć</span><b>${pc(fP)}% / ${pc(fB)}% / ${pc(fG)}%</b></div><div class="row"><span>PV zużyte w domu</span><b>${pvd > 0 ? Math.round(Math.max(pvd - exp, 0) / pvd * 100) : 0}%</b></div></div>
  </div>
  <div class="g3">
    <div class="box"><div class="h"><span>🗼 Sieć</span><span class="lab">${fmt(v("siec_czestotliwosc"), 2, "Hz")}</span></div>${L.map(l => `<div class="row"><span>${l.toUpperCase()}</span><b>${fmt(v("siec_napiecie_" + l), 1, "V")} · ${fmt(v("siec_moc_" + l), 0, "W")}</b></div>`).join("")}</div>
    <div class="box"><div class="h"><span>🔌 Przetwornica</span></div>${L.map(l => `<div class="row"><span>${l.toUpperCase()}</span><b>${fmt(v("przetwornica_napiecie_" + l), 1, "V")} · ${fmt(v("przetwornica_moc_" + l), 0, "W")}</b></div>`).join("")}<div class="row"><span>Temp. / radiator</span><b>${fmt(v("temperatura_przetwornicy"), 1)} / ${fmt(v("temperatura_radiatora"), 1, "°C")}</b></div></div>
    <div class="box"><div class="h"><span>☀ PV</span></div>${[1, 2, 3, 4].map(i => `<div class="row"><span>PV${i}</span><b>${fmt(v("pv" + i + "_moc"), 0, "W")}</b></div>`).join("")}</div>
  </div>`;
}
