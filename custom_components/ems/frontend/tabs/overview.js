import { S, num, fmt } from "../core.js";
export const title = "Przegląd";
export function render(c) {
  const h = c.hass, z = c.zone, v = (k, d) => c.v(k, d);
  const soc = v("bateria_soc"), bp = v("bateria_moc"), pv = v("pv_moc_suma"), load = v("obciazenie_moc_suma"), grid = v("siec_moc_suma");
  const dom = v("energia_zuzycie_dom_dzisiaj", 0), imp = v("energia_siec_import_dzisiaj", 0), exp = v("energia_siec_export_dzisiaj", 0), pvd = v("energia_pv_produkcja_dzisiaj", 0);
  const fromGrid = Math.min(imp, dom), fromPv = Math.max(Math.min(pvd - exp, dom - fromGrid), 0), fromBat = Math.max(dom - fromGrid - fromPv, 0);
  const pc = x => dom > 0 ? Math.round(x / dom * 100) : 0;
  const alg = S(h, "switch.ems_algorytm"), on = alg && alg.state === "on";
  const plan = S(h, "sensor.ems_plan"), man = plan && plan.attributes.reczne;
  const ACT = { charge: "ładowanie z sieci", sell: "sprzedaż", self: "autokonsumpcja", block: "blokada eksportu", wylaczony: "algorytm wyłączony", brak_planu: "brak planu", reczne_buy: "RĘCZNE: kupno", reczne_sell: "RĘCZNE: sprzedaż" };
  const L = ["l1", "l2", "l3"];
  return `
  ${S(h, c.e("bateria_soc")) ? "" : `<div class="card err">Brak danych z dataloggera <b>${c.dev}</b>. Sprawdź, czy ESPHome jest online.</div>`}
  <div class="card"><div class="h"><span>Sterowanie</span><span class="pill ${on ? "ok" : "warn"}">Teraz: ${ACT[plan?.state] || plan?.state || "–"}</span></div>
    <div class="act">
      <button class="big ${on ? "on-g" : "off-g"}" data-svc="switch.toggle" data-ent="switch.ems_algorytm">Algorytm: ${on ? "WŁĄCZONY" : "WYŁĄCZONY"}</button>
      <div><label class="f">Kup energię teraz</label><div class="inp" style="width:150px"><input type="number" step="0.1" data-num="number.ems_kup_kwh" value="${num(h, "number.ems_kup_kwh", 2)}"><span>kWh</span></div></div>
      <button data-svc="button.press" data-ent="button.ems_kup_teraz">Kup</button>
      <div><label class="f">Sprzedaj teraz</label><div class="inp" style="width:150px"><input type="number" step="0.1" data-num="number.ems_sprzedaj_kwh" value="${num(h, "number.ems_sprzedaj_kwh", 2)}"><span>kWh</span></div></div>
      <button data-svc="button.press" data-ent="button.ems_sprzedaj_teraz">Sprzedaj</button>
      ${man ? `<span class="pill info">${man.typ}: ${fmt(man.zrobione_kwh, 2)} / ${fmt(man.kwh, 2, "kWh")}</span><button class="sec" data-svc="button.press" data-ent="button.ems_przerwij_reczne">Przerwij</button>` : ""}
    </div>
    <p class="note">Algorytm wyłączony = działają Twoje ustawienia z zakładki „Konfiguracja inwertera” (EMS przywraca je przy wyłączeniu). Kup/Sprzedaj działa zawsze.</p></div>
  <div class="card"><div class="h"><span>Stan teraz</span><span class="pill ${z.cheap ? "ok" : "warn"}">${z.cheap ? "Tania" : "Droga"} strefa G12 · tania ${z.label} · ${z.summer ? "lato" : "zima"}</span></div>
    <div class="g4">
      <div class="m"><div class="l">Bateria</div><div class="v">${fmt(soc, 0, "%")}</div><div class="l">${fmt(v("bateria_napiecie"), 2, "V")} · ${fmt(v("temperatura_baterii"), 1, "°C")}</div></div>
      <div class="m"><div class="l">Bateria moc</div><div class="v">${fmt(bp, 0, "W")}</div><div class="l">${bp === null ? "" : bp < 0 ? "ładowanie" : bp > 0 ? "rozładowanie" : "postój"}</div></div>
      <div class="m"><div class="l">PV</div><div class="v">${fmt(pv, 0, "W")}</div><div class="l">dziś ${fmt(pvd, 1, "kWh")}</div></div>
      <div class="m"><div class="l">Dom</div><div class="v">${fmt(load, 0, "W")}</div><div class="l">dziś ${fmt(dom, 1, "kWh")}</div></div>
      <div class="m"><div class="l">Sieć</div><div class="v">${fmt(grid, 0, "W")}</div><div class="l">${grid > 0 ? "pobór" : grid < 0 ? "oddawanie" : ""}</div></div>
      <div class="m"><div class="l">BMS</div><div class="v">${fmt(v("bms_soh"), 0, "%")}</div><div class="l">SOH · max ład. ${fmt(v("bms_prad_ladowania"), 0, "A")}</div></div>
    </div></div>
  <div class="g2">
    <div class="card"><div class="h">Energia dziś</div>
      <div class="row"><span>Import z sieci</span><span>${fmt(imp, 1, "kWh")}</span></div>
      <div class="row"><span>Eksport do sieci</span><span>${fmt(exp, 1, "kWh")}</span></div>
      <div class="row"><span>Bateria ład. / rozł.</span><span>${fmt(v("energia_bateria_ladowanie_dzisiaj"), 1)} / ${fmt(v("energia_bateria_rozladowanie_dzisiaj"), 1, "kWh")}</span></div>
      <div class="row"><span>Produkcja PV</span><span>${fmt(pvd, 1, "kWh")}</span></div></div>
    <div class="card"><div class="h">Autokonsumpcja</div>
      <div class="bar"><div style="width:${pc(fromPv)}%;background:#1D9E75"></div><div style="width:${pc(fromBat)}%;background:#7F77DD"></div><div style="width:${pc(fromGrid)}%;background:#B4B2A9"></div></div>
      <div class="l">Dom: PV ${pc(fromPv)}% · bateria ${pc(fromBat)}% · sieć ${pc(fromGrid)}%</div>
      <div class="row"><span>PV zużyte w domu</span><span>${pvd > 0 ? Math.round(Math.max(pvd - exp, 0) / pvd * 100) : 0}%</span></div></div>
  </div>
  <div class="g3">
    <div class="card"><div class="h"><span>Sieć</span><span class="l">${fmt(v("siec_czestotliwosc"), 2, "Hz")}</span></div>${L.map(l => `<div class="row"><span>${l.toUpperCase()}</span><span>${fmt(v("siec_napiecie_" + l), 1, "V")} · ${fmt(v("siec_moc_" + l), 0, "W")}</span></div>`).join("")}</div>
    <div class="card"><div class="h">Przetwornica</div>${L.map(l => `<div class="row"><span>${l.toUpperCase()}</span><span>${fmt(v("przetwornica_napiecie_" + l), 1, "V")} · ${fmt(v("przetwornica_moc_" + l), 0, "W")}</span></div>`).join("")}<div class="row"><span>Temp. / radiator</span><span>${fmt(v("temperatura_przetwornicy"), 1)} / ${fmt(v("temperatura_radiatora"), 1, "°C")}</span></div></div>
    <div class="card"><div class="h">PV</div>${[1, 2, 3, 4].map(i => `<div class="row"><span>PV${i}</span><span>${fmt(v("pv" + i + "_moc"), 0, "W")}</span></div>`).join("")}</div>
  </div>`;
}
