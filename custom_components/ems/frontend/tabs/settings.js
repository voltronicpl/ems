import { S, num, fmt, tip, esc } from "../core.js";
import { T } from "../tips.js";
import { GROUPS } from "../inverter_spec.js";
export const title = "Ustawienia";
const PAIRS = [["Próg sprzedaży – tania", "prog_tania", "zł"], ["Próg sprzedaży – droga", "prog_droga", "zł"], ["Próg „za bezcen”", "prog_bezcen", "zł"],
  ["Mnożnik PV – słonecznie", "mn_slonecznie", "×"], ["Mnożnik PV – pochmurno", "mn_pochmurno", "×"], ["Mnożnik PV – deszcz", "mn_deszcz", "×"], ["Mnożnik PV – śnieg", "mn_snieg", "×"]];
// Rubryka „Planowanie energii – dokupienie pod sprzedaż”: [nazwa, klucz, jednostka, przelacznik?]
const ARB = [["Limit sprzedaży (z PV)", "limit_sprzedazy", "× PV"], ["Dzień bez PV – sprzedaż od", "los_min_wh", "Wh"], ["Dzień bez PV – sprzedaż do", "los_max_wh", "Wh"],
  ["Dokupienie pod sprzedaż", "arbitraz", "", 1], ["Sprzedaż w taniej strefie (noc)", "arbitraz_noc", "", 1], ["Min. zysk z dokupienia", "arbitraz_zysk", "zł/kWh"]];
const ARB1 = [["Sprawność ładowania", "number.ems_sprawnosc_ladowania", "%", "sprawnosc_ladowania"], ["Sprawność rozładowania", "number.ems_sprawnosc_rozladowania", "%", "sprawnosc_rozladowania"], ["Koszt zużycia baterii", "number.ems_koszt_cyklu_zl", "zł/kWh", "koszt_cyklu_zl"]];
const EMS = [
  ["⏱ Odpytywanie i przeliczanie", [["Odczyt falownika co", "number.ems_interwal", "s", "interwal"], ["Przeliczanie planu co", "number.ems_plan_co_min", "min", "plan_co_min"], ["Zapis do falownika co", "number.ems_zapis_co_s", "s", "zapis_co_s"]]],
  ["🔋 Bateria i burza", [["Pojemność baterii", "number.ems_pojemnosc_wh", "Wh", "pojemnosc_wh"], ["Burza – zapas od (h przed)", "number.ems_burza_wyprzedzenie_h", "h", "burza_wyprzedzenie_h"]]],
  ["☀ Instalacja PV", [["Moc PV", "number.ems_pv_moc_w", "Wp", "pv_moc_w"], ["Sprawność instalacji", "number.ems_pv_sprawnosc", "%", "pv_sprawnosc"], ["Nachylenie paneli", "number.ems_pv_nachylenie", "°", "pv_nachylenie"], ["Azymut (0 = płd.)", "number.ems_pv_azymut", "°", "pv_azymut"]]],
  ["🏠 Prognoza zużycia i bilans", [["Współczynnik temp. (0 = auto)", "number.ems_wsp_temp", "kWh/°C", "wsp_temp"], ["Weekend od (piątek, godz.)", "number.ems_weekend_od_godz", "h", "weekend_od_godz"], ["Mnożnik depozytu", "number.ems_depozyt_mnoznik", "×", "depozyt_mnoznik"]]],
];
const raw = { unlocked: 0, addr: "", val: "" };
const arbMin = (c, z) => 0.61 / (num(c.hass, "number.ems_sprawnosc_ladowania", 93) / 100 * num(c.hass, "number.ems_sprawnosc_rozladowania", 93) / 100) + num(c.hass, "number.ems_koszt_cyklu_zl", 0.15) + num(c.hass, `number.ems_arbitraz_zysk_${z}`, 0.1);
// przelacznik na encji number 0/1 (parametry EMS sa liczbami)
const ntog = (c, id) => { const on = num(c.hass, id, 0) >= 0.5; return `<div class="sw" data-ntog="${id}" title="${esc(id)}"><div class="tg ${on ? "on" : ""}"></div>${on ? "Włączone" : "Wyłączone"}</div>`; };
export function render(c) {
  const winter = !c.zone.summer, d = c.dev;
  const f = (id, u, o) => c.field(id, u, o);
  const ems = `<div class="sec" id="s-ems"><div class="ic ic-v">🤖</div>Część EMS</div>
    ${c.group(`🔁 Przeliczniki lato / zima`, `<div style="overflow:auto"><table class="tbl rt"><tr><th>Parametr</th><th>☀ Lato (1.04–30.09)${winter ? "" : ' <span class="pill g">aktywne</span>'}</th><th>❄ Zima (1.10–31.03)${winter ? ' <span class="pill g">aktywne</span>' : ""}</th></tr>
      ${PAIRS.map(([n, k, u]) => `<tr><td class="hd">${n}${tip(T[k])}</td><td data-l="☀ Lato">${f(`number.ems_${k}_lato`, u, { act: !winter })}</td><td data-l="❄ Zima">${f(`number.ems_${k}_zima`, u, { act: winter })}</td></tr>`).join("")}</table></div>`,
      PAIRS.flatMap(([, k]) => [`number.ems_${k}_lato`, `number.ems_${k}_zima`]))}
    ${c.group(`⚡ Planowanie energii – dokupienie pod sprzedaż${tip(T.arbitraz_box)}`, `<div style="overflow:auto"><table class="tbl rt"><tr><th>Parametr</th><th>☀ Lato${winter ? "" : ' <span class="pill g">aktywne</span>'}</th><th>❄ Zima${winter ? ' <span class="pill g">aktywne</span>' : ""}</th></tr>
      ${ARB.map(([n, k, u, sw]) => `<tr><td class="hd">${n}${tip(T[k])}</td>${["lato", "zima"].map(z => `<td data-l="${z === "lato" ? "☀ Lato" : "❄ Zima"}">${sw ? ntog(c, `number.ems_${k}_${z}`) : f(`number.ems_${k}_${z}`, u, { act: (z === "zima") === winter })}</td>`).join("")}</tr>`).join("")}</table></div>
      <div class="g3" style="margin-top:12px">${ARB1.map(([n, id, u, k]) => `<div><label class="f">${n}${tip(T[k])}</label>${f(id, u)}</div>`).join("")}</div>
      <div class="note">Opłaca się, gdy RCE × ${fmt(num(c.hass, "number.ems_depozyt_mnoznik", 1.23), 2)} ≥ ${fmt(arbMin(c, winter ? "zima" : "lato"), 2, "zł")} (tania G12 0,61 / (sprawność ładowania × rozładowania) + zużycie + min. zysk) → próg RCE teraz ≈ <b>${fmt(arbMin(c, winter ? "zima" : "lato") / num(c.hass, "number.ems_depozyt_mnoznik", 1.23), 2, "zł")}</b>.</div>`,
      ARB.filter(x => !x[3]).flatMap(([, k]) => [`number.ems_${k}_lato`, `number.ems_${k}_zima`]).concat(ARB1.map(x => x[1])))}
    <div class="g2">${EMS.map(([t, fs]) => c.group(t, `<div class="g3">${fs.map(([n, id, u, k]) => `<div><label class="f">${n}${tip(T[k])}</label>${f(id, u)}</div>`).join("")}</div>`, fs.map(x => x[1]))).join("")}</div>`;
  const lim = [["Max prąd ładowania baterii", `number.${d}_limit_twardy_max_prad_ladowania_baterii`, "A"], ["Max prąd rozładowania baterii", `number.${d}_limit_twardy_max_prad_rozladowania_baterii`, "A"],
    ["Prąd ładowania z sieci", `number.${d}_limit_twardy_prad_ladowania_z_sieci`, "A"], ["Max moc sprzedaży", `number.${d}_limit_twardy_max_moc_sprzedazy`, "W"],
    ["SOC minimalny", "number.ems_soc_min", "%", "soc_min"], ["SOC przy burzy", "number.ems_soc_burza", "%", "soc_burza"], ["SOC maksymalny", "number.ems_soc_max", "%", "soc_max"]];
  const limits = `<div class="sec" id="s-lim"><div class="ic ic-r">🔒</div>Limity twarde${tip(T.limity)}</div>
    ${c.group("🔒 Nie do ruszenia przez algorytm", `<div class="g3">${lim.map(([n, id, u, k]) => `<div><label class="f">🔒 ${n}${tip(T[k])}</label>${f(id, u, { lock: 1 })}</div>`).join("")}</div>`, lim.map(x => x[1]), "lock")}`;
  const st = k => S(c.hass, `sensor.${d}_${k}`)?.state, ok = v => v && !["unknown", "unavailable"].includes(v);
  const miss = GROUPS.flatMap(g => g.fields).filter(x => x.t !== "b" && !S(c.hass, c.rid(x.id.replace("ecobss", d), x.l))).map(x => x.id.replace("ecobss", d));
  const status = `<div class="box" style="margin:0 0 12px"><div class="ctrl" style="gap:16px;flex-wrap:wrap">
    <span>📥 Pomiary: <b>${ok(st("ostatni_odczyt_pomiarow")) ? st("ostatni_odczyt_pomiarow") : "–"}</b></span>
    <span>📥 Ustawienia: <b>${ok(st("ostatni_odczyt_ustawien")) ? st("ostatni_odczyt_ustawien") : "–"}</b></span>
    <span>📤 Ostatni zapis: <b>${ok(st("ostatni_zapis")) ? esc(st("ostatni_zapis")) : "–"}</b></span>
    <span class="lab">licznik cykli ${ok(st("licznik_odczytow")) ? st("licznik_odczytow") : "–"}</span></div>
    ${ok(st("ostatni_odczyt_ustawien")) ? "" : `<div class="note">Brak potwierdzeń odczytu – wgraj datalogger ecobss.yaml v5.3.</div>`}
    ${miss.length ? `<div class="note">Brak w HA ${miss.length} encji: <code>${miss.slice(0, 8).map(esc).join(", ")}${miss.length > 8 ? ", …" : ""}</code> – sprawdź Ustawienia → Urządzenia → EcoBss (wyłączone?).</div>` : ""}</div>`;
  const inv = `<div class="sec" id="s-inv"><div class="ic ic-b">🔌</div>Część Inwerter</div>${status}
    <div class="g2">${GROUPS.map(g => c.group(g.title.replace("Siec", "Sieć"), `<div class="g3">${g.fields.map(x => {
      const id = c.rid(x.id.replace("ecobss", d), x.l), rr = x.r ? `<span class="lab" style="margin-left:auto">rej. ${x.r}</span>` : "";
      if (x.t === "n") return `<div><label class="f">${x.lock ? "🔒 " : ""}${esc(x.l)}${rr}</label>${f(id, x.u, { lock: x.lock })}</div>`;
      if (x.t === "s") return `<div><label class="f">${esc(x.l)}${rr}</label>${c.sw(id, "")}</div>`;
      if (x.t === "o") return `<div><label class="f">${esc(x.l)}${rr}</label>${c.sel(id)}</div>`;
      if (x.t === "b") return `<div><label class="f">Czas falownika</label><button class="btn pri" data-svc="button.press" data-ent="${id}">${esc(x.l)}</button></div>`;
      return ""; }).join("")}</div>`, g.fields.filter(x => x.t === "n").map(x => c.rid(x.id.replace("ecobss", d), x.l)))).join("")}</div>`;
  const on = raw.unlocked > Date.now(), res = S(c.hass, `sensor.${d}_surowy_odczyt`)?.state;
  const rawbox = `<div class="box ${on ? "warn" : ""}"><div class="h"><span>🧪 Surowy rejestr Modbus${tip(T.raw)}</span>
      <button class="btn ${on ? "off" : ""}" data-unlock>${on ? `🔓 Odblokowane (${Math.ceil((raw.unlocked - Date.now()) / 60000)} min) – zablokuj` : "🔒 Odblokuj"}</button></div>
    ${on ? `<div class="ctrl"><div class="raw"><label class="f">Adres (dziesiętnie)</label><div class="inp w140"><input data-raw="addr" value="${esc(raw.addr)}" inputmode="numeric"></div></div>
      <div class="raw"><label class="f">Wartość (0–65535)</label><div class="inp w140"><input data-raw="val" value="${esc(raw.val)}" inputmode="numeric"></div></div>
      <button class="btn" data-rawread style="align-self:flex-end">Odczytaj</button><button class="btn off" data-rawwrite style="align-self:flex-end">Zapisz do falownika</button>
      <span class="pill b" style="align-self:flex-end">Wynik: ${esc(res || "–")}</span></div>
      <p class="note">Każdy surowy zapis jest logowany w ESP i w Diagnostyce. Blokada wraca sama po 5 min.</p>` : `<p class="note">Zablokowane. Wszystkie znane rejestry mają swoje pola wyżej.</p>`}</div>`;
  return `<div class="anchor"><button class="btn" data-go="s-ems">🤖 EMS</button><button class="btn" data-go="s-lim">🔒 Limity</button><button class="btn" data-go="s-inv">🔌 Inwerter</button></div>${ems}${limits}${inv}${rawbox}`;
}
export function bind(c, r) {
  r.querySelectorAll("[data-ntog]").forEach(el => el.onclick = () => { const id = el.dataset.ntog; c.zapisz([{ entity_id: id, value: num(c.hass, id, 0) >= 0.5 ? 0 : 1 }]); });
  r.querySelectorAll("[data-go]").forEach(b => b.onclick = () => r.getElementById(b.dataset.go)?.scrollIntoView({ behavior: "smooth" }));
  r.querySelector("[data-unlock]")?.addEventListener("click", () => { raw.unlocked = raw.unlocked > Date.now() ? 0 : Date.now() + 300000; c.log(`Surowy rejestr ${raw.unlocked ? "ODBLOKOWANY" : "zablokowany"}`); c.render(true); });
  r.querySelectorAll("[data-raw]").forEach(i => { i.oninput = () => { raw[i.dataset.raw] = i.value; }; i.onfocus = () => { c._hold = true; }; i.onblur = () => { c._hold = false; }; });
  const svc = n => `${c.dev.replace(/-/g, "_")}_${n}`;
  r.querySelector("[data-rawread]")?.addEventListener("click", () => { const a = parseInt(raw.addr); if (isNaN(a)) return; c.call("esphome", svc("raw_read"), { address: a }); c.log(`Surowy odczyt rejestru ${a}`); });
  r.querySelector("[data-rawwrite]")?.addEventListener("click", () => {
    const a = parseInt(raw.addr), v = parseInt(raw.val);
    if (isNaN(a) || isNaN(v) || v < 0 || v > 65535) return;
    if (!confirm(`Zapisać do falownika rejestr ${a} = ${v} (0x${v.toString(16).toUpperCase().padStart(4, "0")})?\n\nBłędny zapis może zmienić ważne ustawienie falownika.`)) return;
    c.call("esphome", svc("raw_write"), { address: a, value: v }); c.log(`SUROWY ZAPIS rejestr ${a} = ${v}`);
  });
}
