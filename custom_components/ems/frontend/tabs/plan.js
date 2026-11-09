import { S, fmt } from "../core.js";
export const title = "Plan";
const COL = { charge: "#378ADD", sell: "#1D9E75", self: "#B4B2A9", block: "#E24B4A" };
const NAME = { charge: "ładowanie z sieci", sell: "sprzedaż", self: "autokonsumpcja", block: "blokada eksportu" };
export function render(c) {
  const st = S(c.hass, "sensor.ems_plan");
  if (!st) return `<div class="card">Brak sensora planu (sensor.ems_plan).</div>`;
  const a = st.attributes, plan = a.plan || [], s = a.podsumowanie || {};
  const t = x => new Date(x).toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const maxP = Math.max(0.5, ...plan.map(p => p.price || 0));
  const bars = plan.map(p => `<div title="${t(p.start)} · ${NAME[p.action]} · RCE ${p.price == null ? "–" : p.price.toFixed(2)} · SOC ${p.soc}%${p.storm ? " · BURZA" : ""}" style="flex:1;height:${Math.max(6, (p.price || 0) / maxP * 70)}px;background:${COL[p.action]};${p.storm ? "outline:1px solid #E24B4A" : ""}"></div>`).join("");
  const socline = plan.map(p => `<div style="flex:1;height:${p.soc * 0.4}px;background:rgba(127,119,221,.5)"></div>`).join("");
  const rows = []; let prev = null;
  for (const p of plan) { if (p.action !== "self" && (!prev || prev.action !== p.action || prev.end !== p.start)) rows.push({ ...p, n: 1, kwh: p.grid_kwh, end: p.start, last: p.start }); else if (p.action !== "self") { const r = rows[rows.length - 1]; r.n++; r.kwh += p.grid_kwh; r.last = p.start; } prev = { ...p, end: new Date(new Date(p.start).getTime() + 9e5).toISOString() }; }
  return `<div class="card"><div class="h"><span>Plan dziś + jutro (sloty 15 min)</span>
    <span><span class="l">przeliczono ${a.przeliczono ? t(a.przeliczono) : "–"}</span> <button class="sec" data-svc="button.press" data-ent="button.ems_przelicz">Przelicz</button></span></div>
    ${a.blad ? `<div class="card err">Błąd: ${a.blad}</div>` : ""}
    <div class="l">Cena RCE (wysokość) i akcja (kolor)</div><div class="slotbar">${bars}</div>
    <div class="l" style="margin-top:6px">SOC baterii</div><div class="slotbar" style="height:40px">${socline}</div>
    <div style="display:flex;gap:14px;margin-top:6px" class="l">${Object.keys(COL).map(k => `<span><span style="display:inline-block;width:10px;height:10px;background:${COL[k]}"></span> ${NAME[k]}</span>`).join("")}</div></div>
  <div class="g2"><div class="card"><div class="h">Podsumowanie</div>
    <div class="row"><span>Ładowanie z sieci</span><span>${fmt(s.ladowanie_kwh, 2, "kWh")}</span></div>
    <div class="row"><span>Sprzedaż</span><span>${fmt(s.sprzedaz_kwh, 2, "kWh")} · ~${fmt(s.przychod_zl, 2, "zł")}</span></div>
    <div class="row"><span>Prognoza PV / dom</span><span>${fmt(s.pv_kwh, 1)} / ${fmt(s.zuzycie_kwh, 1, "kWh")}</span></div>
    <div class="row"><span>Wsp. temperatury / korekta PV</span><span>${fmt(s.wsp_temp, 3)} / x${fmt(s.korekta_pv, 2)}</span></div>
    <div class="row"><span>Burza w prognozie</span><span>${s.burza ? "TAK" : "nie"}</span></div>
    <div class="row"><span>Horyzont do</span><span>${s.horyzont_do || "–"}</span></div></div>
  <div class="card"><div class="h">Najbliższe akcje</div>${rows.slice(0, 12).map(r => `<div class="row"><span>${t(r.start)}–${new Date(new Date(r.last).getTime() + 9e5).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} ${NAME[r.action]}</span><span>${fmt(r.kwh, 2, "kWh")}</span></div>`).join("") || `<p class="note">Same autokonsumpcje.</p>`}</div></div>`;
}
