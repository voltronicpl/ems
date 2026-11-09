"""Algorytm planowania EMS (sloty 15 min, horyzont: tak daleko, jak sa ceny RCE - dzis + jutro).

Zasady (spec 7 / 7a):
1. Prognoza na slot: zuzycie domu i produkcja PV.
2. W taniej strefie G12 laduj baterie tylko do poziomu, ktory pokryje dom + zaplanowana sprzedaz do
   nastepnej taniej strefy, z miejscem na nadwyzke PV (max 98%).
3. Sprzedaz w najdrozszych slotach RCE, rozbita na wiele okienek:
   - energia kupiona tanio: RCE >= prog_tania,
   - nadwyzka PV: najdrozsze wolne okienka, nigdy ponizej progu "za bezcen",
   - powyzej prog_droga sprzedaje nawet energie potrzebna domowi (dom dobierze z sieci).
4. Limit sprzedazy dziennie: limit_sprzedazy_<sezon> x prognoza PV; dzien bez PV -> losowo los_min..los_max Wh.
   Wszystko (nadwyzka PV + dokupienie pod sprzedaz) miesci sie w tym limicie.
4a. Dokupienie pod sprzedaz (arbitraz_<sezon>): w taniej strefie laduje ponad potrzeby domu, jesli w nastepnym
   drogim oknie RCE x depozyt - (cena taniej G12 / sprawnosc + koszt cyklu) >= arbitraz_zysk_<sezon>.
4b. Sprzedaz w taniej strefie (arbitraz_noc_<sezon>): w taniej strefie sprzedaje z baterii w godzinach z najwyzszym
   RCE (ten sam warunek), a laduje w INNYCH godzinach zegarowych (bilansowanie godzinowe: pobor i oddanie
   w tej samej godzinie sie znosza). Na koniec strefy bateria i tak dochodzi do celu.
5. Burza: zapas 50% od N godzin przed burza do konca burzy.
6. RCE ponizej progu "za bezcen" -> blokada eksportu.
"""
from __future__ import annotations

import random
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .diag import get_logger
from .tariff import PRICE, is_cheap, season

LOG = get_logger("plan")
WAW = ZoneInfo("Europe/Warsaw")
SLOT_H = 0.25


@dataclass
class Slot:
    start: str
    action: str          # charge | sell | self | block
    grid_kwh: float      # ladowanie z sieci (charge) albo sprzedaz z baterii (sell)
    price: float | None
    soc: float           # SOC na koniec slotu [%]
    pv: float
    load: float
    cheap: bool
    storm: bool
    reserve: float
    imp: float = 0.0     # pobor z sieci w slocie [kWh]
    exp: float = 0.0     # oddanie do sieci w slocie [kWh]
    why: str = ""        # powod decyzji (dla panelu)


def _sez(day) -> str:
    return "lato" if 4 <= day.month <= 9 else "zima"


def daily_cap(day, pv_day: float, p: dict) -> float:
    z = _sez(day)
    if pv_day < 0.3:
        lo, hi = sorted((p[f"los_min_wh_{z}"], p[f"los_max_wh_{z}"]))
        return round(random.Random(day.toordinal()).uniform(lo, hi) / 1000, 3)
    return pv_day * p[f"limit_sprzedazy_{z}"]


def arb_price(p: dict, z: str, flag: str = "arbitraz") -> float | None:
    """Minimalna RCE, przy ktorej oplaca sie kupic tanio i sprzedac (None = wylaczone przelacznikiem `flag`)."""
    if not p.get(f"{flag}_{z}"):
        return None
    cost = PRICE["cheap"] / (p["sprawnosc_baterii"] / 100) + p["koszt_cyklu_zl"]
    return (cost + p[f"arbitraz_zysk_{z}"]) / p["depozyt_mnoznik"]


def plan(slots: list[datetime], prices: dict, pv: dict, load: dict, weather: dict, soc_now: float,
         p: dict, cap_kwh: float, max_charge_w: float, max_sell_w: float) -> tuple[list[Slot], dict]:
    n = len(slots)
    if n == 0:
        return [], {"blad": "brak slotow"}
    res_min, res_storm, soc_max = p["soc_min"], p["soc_burza"], p["soc_max"]
    pct = lambda kwh: kwh / cap_kwh * 100          # noqa: E731
    kwh = lambda pc: pc / 100 * cap_kwh            # noqa: E731
    ch_slot = max_charge_w / 1000 * SLOT_H
    sell_slot = max_sell_w / 1000 * SLOT_H

    # --- zapas: burza -------------------------------------------------------------------------
    reserve = [res_min] * n
    pre = timedelta(hours=p["burza_wyprzedzenie_h"])
    storm_slots = [s for s in slots if weather.get(s, {}).get("storm")]
    for i, s in enumerate(slots):
        if any(st - pre <= s <= st + timedelta(minutes=15) for st in storm_slots):
            reserve[i] = max(res_min, res_storm)
    if storm_slots:
        LOG.info("Burza w prognozie od %s -> zapas %d%%", storm_slots[0].astimezone(WAW).strftime("%d.%m %H:%M"), res_storm)

    cheap = [is_cheap(s) for s in slots]
    price = [prices.get(s) for s in slots]
    pvk = [pv.get(s, 0.0) for s in slots]
    ld = [load.get(s, 0.0) for s in slots]

    # --- okna: [tania strefa][droga strefa do nastepnej taniej] --------------------------------
    blocks, i = [], 0
    while i < n:
        j = i
        while j < n and cheap[j] == cheap[i]:
            j += 1
        blocks.append((i, j, cheap[i]))
        i = j

    # --- limit sprzedazy na dzien ---------------------------------------------------------------
    pv_day: dict = {}
    for s, v in zip(slots, pvk):
        d = s.astimezone(WAW).date()
        pv_day[d] = pv_day.get(d, 0) + v
    cap_left = {d: daily_cap(d, v, p) for d, v in pv_day.items()}

    sell = [0.0] * n
    why_sell = [""] * n
    target = {}                                      # indeks bloku taniego -> docelowy SOC [%]
    soc_start = soc_now
    for bi, (a, b, is_ch) in enumerate(blocks):
        if is_ch:
            continue
        # okno drogie W = [a, b); poprzedni blok tani (jesli jest) laduje pod to okno
        need = sum(max(ld[k] - pvk[k], 0) for k in range(a, b))
        pv_in = sum(max(pvk[k] - ld[k], 0) for k in range(a, b))
        res_w = max(reserve[a:b]) if b > a else res_min
        z = season(slots[a])
        thr_t = p[f"prog_tania_{z}"]
        arb = arb_price(p, z) if bi > 0 and blocks[bi - 1][2] else None
        if arb is not None and arb < thr_t:
            thr_t = arb
        thr_d = p[f"prog_droga_{season(slots[a])}"]
        bezcen = p[f"prog_bezcen_{season(slots[a])}"]
        cand = sorted((k for k in range(a, b) if price[k] is not None), key=lambda k: -price[k])
        thr_of = {}
        # energia ponad potrzeby domu (z taniej strefy + nadwyzka PV)
        room_full = kwh(soc_max)
        if bi > 0 and blocks[bi - 1][2]:            # ile realnie da sie naladowac w poprzedniej taniej strefie
            pa, pb, _ = blocks[bi - 1]
            start_kwh = min(room_full, kwh(soc_start) + (pb - pa) * ch_slot)
        else:
            start_kwh = kwh(soc_start)
        spare = max(0.0, start_kwh + pv_in - need - kwh(res_w))
        planned, planned_pv = 0.0, 0.0
        spare_pv = min(pv_in, spare)                 # nadwyzka PV (bez energii z taniej strefy)
        first_pv = next((k for k in range(a, b) if pvk[k] > ld[k]), b)   # PV sprzedajemy dopiero po jej pojawieniu sie
        for k in cand:
            d = slots[k].astimezone(WAW).date()
            if cap_left.get(d, 0) <= 0:
                continue
            if price[k] >= thr_d:
                amt = min(sell_slot, cap_left[d])                       # drogo: sprzedaj nawet energie domu
                thr_of[k] = f"RCE {price[k]:.2f} >= prog droga {thr_d:.2f}"
            elif price[k] >= thr_t:
                amt = min(sell_slot, cap_left[d], spare - planned)
                if arb is not None and thr_t == arb:
                    gain = price[k] * p["depozyt_mnoznik"] - (arb * p["depozyt_mnoznik"] - p[f"arbitraz_zysk_{z}"])
                    thr_of[k] = f"dokupione tanio pod sprzedaz: RCE {price[k]:.2f} x {p['depozyt_mnoznik']:.2f}, zysk ~{gain:.2f} zl/kWh"
                else:
                    thr_of[k] = f"RCE {price[k]:.2f} >= prog tania {thr_t:.2f}, nadwyzka ponad potrzeby domu"
            elif price[k] >= bezcen and k >= first_pv and spare_pv - planned_pv > 0.01:
                amt = min(sell_slot, cap_left[d], spare_pv - planned_pv, spare - planned)
                planned_pv += max(amt, 0)
                thr_of[k] = f"nadwyzka PV w jednym z najdrozszych okienek (RCE {price[k]:.2f})"
            else:
                continue
            if amt <= 0.01:
                continue
            sell[k] = amt
            why_sell[k] = thr_of.get(k, "")
            planned += amt
            cap_left[d] -= amt
        # docelowy SOC na koniec poprzedniej taniej strefy
        if bi > 0 and blocks[bi - 1][2]:
            want = kwh(res_w) + need + planned - pv_in
            target[bi - 1] = min(soc_max, max(res_w, pct(want)))
        soc_start = res_w

    # --- sprzedaz w taniej strefie (w innych godzinach niz ladowanie) ------------------------------
    sell_h: dict[int, set] = {}                       # blok tani -> godziny zegarowe sprzedazy
    for bi, (a, b, is_ch) in enumerate(blocks):
        if not is_ch or b - a < 8:
            continue
        z = season(slots[a])
        arb = arb_price(p, z, "arbitraz_noc")
        if arb is None:
            continue
        hour = lambda k: slots[k].astimezone(WAW).replace(minute=0, second=0, microsecond=0)   # noqa: E731
        hours: dict = {}
        for k in range(a, b):
            hours.setdefault(hour(k), []).append(k)
        e0 = kwh(soc_now) if bi == 0 else kwh(res_min)
        tgt = target.get(bi, soc_max if bi == len(blocks) - 1 else res_min)

        def feasible(sel: set, amt: dict) -> bool:
            e = e0
            for hh, ks in hours.items():
                for k in ks:
                    if hh in sel:
                        e -= max(ld[k] - pvk[k], 0) + amt.get(k, 0)
                        if e < kwh(reserve[k]) - 1e-6:
                            return False
                    else:
                        e = min(kwh(soc_max), e + ch_slot + max(pvk[k] - ld[k], 0))
            return e >= kwh(tgt) - 1e-6
        ranked = sorted((hh for hh, ks in hours.items() if len(ks) == 4 and all(price[k] is not None and price[k] >= arb for k in ks)),
                        key=lambda hh: -sum(price[k] for k in hours[hh]))
        sel, amt = set(), {}
        for hh in ranked:
            d = hh.date()
            new = {k: min(sell_slot, max(cap_left.get(d, 0), 0) / 4) for k in hours[hh]}
            if sum(new.values()) < 0.05:
                continue
            if feasible(sel | {hh}, {**amt, **new}):
                sel.add(hh)
                amt.update(new)
                cap_left[d] -= sum(new.values())
        for k, v in amt.items():
            sell[k] = v
            gain = price[k] * p["depozyt_mnoznik"] - (arb * p["depozyt_mnoznik"] - p[f"arbitraz_zysk_{z}"])
            why_sell[k] = f"tania strefa: sprzedaz z baterii (RCE {price[k]:.2f}), laduje w innych godzinach, zysk ~{gain:.2f} zl/kWh"
        if sel:
            sell_h[bi] = sel
            LOG.info("Tania strefa od %s: sprzedaz w godzinach %s (%.2f kWh)", slots[a].astimezone(WAW).strftime("%d.%m %H:%M"),
                     ", ".join(h.strftime("%H:00") for h in sorted(sel)), sum(amt.values()))

    # --- symulacja slot po slocie (z przeplywami sieci) ---------------------------------------------
    out: list[Slot] = []
    soc = soc_now
    for bi, (a, b, is_ch) in enumerate(blocks):
        tgt = target.get(bi, soc_max if is_ch and bi == len(blocks) - 1 else None)
        sh = sell_h.get(bi, set())
        in_sh = lambda k: slots[k].astimezone(WAW).replace(minute=0, second=0, microsecond=0) in sh   # noqa: E731
        for k in range(a, b):
            e = kwh(soc)
            act, grid, imp, exp, why = "self", 0.0, 0.0, 0.0, ""
            bezcen = p[f"prog_bezcen_{season(slots[k])}"]
            net = pvk[k] - ld[k]
            if is_ch and sh and in_sh(k):                              # godzina sprzedazy: dom z baterii, bez ladowania
                e += net
                if e < kwh(reserve[k]):
                    imp += kwh(reserve[k]) - e
                    e = kwh(reserve[k])
            elif is_ch and sh:                                         # pozostale godziny: laduj pelna moca pod cel + sprzedaz
                imp += max(-net, 0)
                e += max(net, 0)
                ahead = sum(sell[j] + max(ld[j] - pvk[j], 0) for j in range(k + 1, b) if in_sh(j))
                want = min(kwh(soc_max), kwh(tgt if tgt is not None else res_min) + ahead)
                if want - e > 0.005:
                    grid = min(ch_slot, want - e)
                    e += grid
                    imp += grid
                    act = "charge"
                    why = f"tania strefa G12: laduje pod cel {tgt or res_min:.0f}% + sprzedaz w innej godzinie"
            elif is_ch:
                imp += max(-net, 0)                                    # dom z sieci w taniej strefie
                e += max(net, 0)
                if tgt is not None and soc < tgt - 0.5:
                    left = b - k
                    grid = min(ch_slot, (kwh(tgt) - e) / max(left, 1) * 2, kwh(tgt) - e)
                    if grid > 0.005:
                        e += grid
                        imp += grid
                        act = "charge"
                        why = f"tania strefa G12, cel {tgt:.0f}% (dom + sprzedaz do nastepnej taniej strefy, miejsce na PV)"
            else:
                e += net
                floor = kwh(reserve[k])
                if e < floor:                                          # brak w baterii -> dom z sieci
                    imp += floor - e
                    e = floor
            if sell[k] > 0:
                s_amt = min(sell[k], e - kwh(reserve[k]))
                if s_amt > 0.01:
                    e -= s_amt
                    exp += s_amt
                    act, grid, why = "sell", s_amt, why_sell[k]
            if e > cap_kwh:                                            # bateria pelna -> nadmiar PV
                over = e - cap_kwh
                e = cap_kwh
                if price[k] is not None and price[k] < bezcen:
                    act, why = "block", f"RCE {price[k]:.2f} < prog za bezcen {bezcen:.2f}, eksport zablokowany"
                else:
                    exp += over
            if act == "self":
                why = "zapas na burze" if reserve[k] > res_min else "autokonsumpcja"
            soc = pct(e)
            out.append(Slot(slots[k].isoformat(), act, round(grid, 3), price[k], round(soc, 1),
                            round(pvk[k], 3), round(ld[k], 3), cheap[k], reserve[k] > res_min, reserve[k],
                            round(imp, 3), round(exp, 3), why))

    summ = {
        "ladowanie_kwh": round(sum(s.grid_kwh for s in out if s.action == "charge"), 2),
        "sprzedaz_kwh": round(sum(s.grid_kwh for s in out if s.action == "sell"), 2),
        "przychod_zl": round(sum(s.grid_kwh * (s.price or 0) for s in out if s.action == "sell"), 2),
        "pv_kwh": round(sum(pvk), 2),
        "zuzycie_kwh": round(sum(ld), 2),
        "import_kwh": round(sum(s.imp for s in out), 2),
        "eksport_kwh": round(sum(s.exp for s in out), 2),
        "burza": bool(storm_slots),
        "horyzont_do": slots[-1].astimezone(WAW).strftime("%d.%m %H:%M"),
    }
    LOG.info("Plan: %d slotow, ladowanie %.2f kWh, sprzedaz %.2f kWh (~%.2f zl), PV %.2f, dom %.2f",
             n, summ["ladowanie_kwh"], summ["sprzedaz_kwh"], summ["przychod_zl"], summ["pv_kwh"], summ["zuzycie_kwh"])
    for s in out:
        if s.action != "self":
            LOG.debug("  %s %-6s %.3f kWh RCE %s SOC %.0f%%", s.start[11:16], s.action, s.grid_kwh,
                      f"{s.price:.2f}" if s.price is not None else "-", s.soc)
    return out, summ


def as_dicts(slots: list[Slot]) -> list[dict]:
    return [asdict(s) for s in slots]
