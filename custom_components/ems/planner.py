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
   drogim oknie RCE x depozyt - (cena taniej G12 / (spr. ladowania x rozladowania) + koszt cyklu) >= arbitraz_zysk_<sezon>.
4c. Koszt energii w baterii (batcost.py): w biezacym oknie prog „tania” >= (koszt kWh w baterii / spr. rozl. + koszt cyklu + min. zysk) / depozyt.
4b. Sprzedaz w taniej strefie (arbitraz_noc_<sezon>): w taniej strefie sprzedaje z baterii w godzinach z najwyzszym
   RCE (ten sam warunek), a laduje w INNYCH godzinach zegarowych (bilansowanie godzinowe: pobor i oddanie
   w tej samej godzinie sie znosza). Na koniec strefy bateria i tak dochodzi do celu.
5. Burza: zapas 50% od N godzin przed burza do konca burzy.
6. RCE ponizej progu "za bezcen" -> blokada eksportu.
7. Straty baterii: do baterii trafia energia x sprawnosc_ladowania, z baterii ubywa energia / sprawnosc_rozladowania
   (ladowanie z sieci, nadwyzka PV, dom, sprzedaz). Limit mocy ladowania liczony po stronie baterii.
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


def eff(p: dict) -> tuple[float, float]:
    """(sprawnosc ladowania, sprawnosc rozladowania) jako ulamki. Energia w baterii = to, co weszlo x ladowanie;
    z baterii ubywa to, co wyszlo do domu / sieci / rozladowanie."""
    return (max(p.get("sprawnosc_ladowania", 93), 1) / 100, max(p.get("sprawnosc_rozladowania", 93), 1) / 100)


def arb_price(p: dict, z: str, flag: str = "arbitraz") -> float | None:
    """Minimalna RCE, przy ktorej oplaca sie kupic tanio i sprzedac (None = wylaczone przelacznikiem `flag`)."""
    if not p.get(f"{flag}_{z}"):
        return None
    cost = PRICE["cheap"] / (eff(p)[0] * eff(p)[1]) + p["koszt_cyklu_zl"]
    return (cost + p[f"arbitraz_zysk_{z}"]) / p["depozyt_mnoznik"]


def _sell_blocks(sell: list, why: list, price: list, a: int, b: int, mn: int) -> None:
    """Sprzedaz blokami min. `mn` slotow: bliskie kawalki (przerwa <= mn) sklejane, krotkie rozszerzane o najdrozsze
    sasiednie sloty; ta sama energia rozlozona rowno (nizsza moc, ta sama ilosc kWh)."""
    mn = max(mn, 1)
    runs, k = [], a
    while k < b:
        if sell[k] > 0:
            j = k
            while j < b and sell[j] > 0:
                j += 1
            if runs and k - runs[-1][1] <= mn:
                runs[-1][1] = j
            else:
                runs.append([k, j])
            k = j
        else:
            k += 1
    for r in runs:
        lo, hi = r
        while hi - lo < mn:
            l_ok = lo > a and price[lo - 1] is not None
            r_ok = hi < b and price[hi] is not None
            if not (l_ok or r_ok):
                break
            if r_ok and (not l_ok or price[hi] >= price[lo - 1]):
                hi += 1
            else:
                lo -= 1
        tot = sum(sell[lo:hi])
        seed = next((why[i] for i in range(lo, hi) if why[i]), "")
        for i in range(lo, hi):
            sell[i] = tot / (hi - lo)
            why[i] = seed + f" (blok sprzedazy {hi - lo} x 15 min)"


def plan(slots: list[datetime], prices: dict, pv: dict, load: dict, weather: dict, soc_now: float,
         p: dict, cap_kwh: float, max_charge_w: float, max_sell_w: float) -> tuple[list[Slot], dict]:
    n = len(slots)
    if n == 0:
        return [], {"blad": "brak slotow"}
    res_min, res_storm, soc_max = p["soc_min"], p["soc_burza"], p["soc_max"]
    pct = lambda kwh: kwh / cap_kwh * 100          # noqa: E731
    kwh = lambda pc: pc / 100 * cap_kwh            # noqa: E731
    ch_slot = max_charge_w / 1000 * SLOT_H          # max energii DO baterii na slot (moc ladowania po stronie baterii)
    soft = min(ch_slot, p.get("ladowanie_lagodne_c", 0.2) * cap_kwh * SLOT_H)   # lagodne ladowanie (0,2C) – szybciej tylko gdy trzeba
    ec, ed = eff(p)
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
        # energia, ktora JUZ jest w baterii (okno biezace): nie sprzedawaj ponizej jej kosztu (koszt kWh / sprawnosc + cykl + min. zysk)
        kb = p.get("koszt_baterii_zl")
        if bi == 0 and kb is not None:
            thr_k = (kb / ed + p["koszt_cyklu_zl"] + p[f"arbitraz_zysk_{z}"]) / p["depozyt_mnoznik"]
            if thr_k > thr_t:
                thr_t = thr_k
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
        # energia do oddania (AC) = co zostanie w baterii ponad zapas po stratach ladowania i rozladowania
        spare = max(0.0, (start_kwh + pv_in * ec - need / ed - kwh(res_w)) * ed)
        planned, planned_pv = 0.0, 0.0
        spare_pv = min(pv_in * ec * ed, spare)       # nadwyzka PV (bez energii z taniej strefy)
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
        _sell_blocks(sell, why_sell, price, a, b, int(p.get("tou_min_blok_min", 60) // 15))
        # docelowy SOC na koniec poprzedniej taniej strefy
        if bi > 0 and blocks[bi - 1][2]:
            want = kwh(res_w) + (need + planned) / ed - pv_in * ec      # w baterii, po stratach
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
                        e -= (max(ld[k] - pvk[k], 0) + amt.get(k, 0)) / ed
                        if e < kwh(reserve[k]) - 1e-6:
                            return False
                    else:
                        e = min(kwh(soc_max), e + ch_slot + max(pvk[k] - ld[k], 0) * ec)
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
                     ", ".join(h.astimezone(WAW).strftime("%H:00") for h in sorted(sel)), sum(amt.values()))

    # --- symulacja slot po slocie (z przeplywami sieci) ---------------------------------------------
    out: list[Slot] = []
    soc = soc_now
    for bi, (a, b, is_ch) in enumerate(blocks):
        tgt = target.get(bi, soc_max if is_ch and bi == len(blocks) - 1 else None)
        sh = sell_h.get(bi, set())
        in_sh = lambda k: slots[k].astimezone(WAW).replace(minute=0, second=0, microsecond=0) in sh   # noqa: E731
        for k in range(a, b):
            e = kwh(soc)                                               # energia W baterii [kWh]
            act, grid, imp, exp, why = "self", 0.0, 0.0, 0.0, ""
            bezcen = p[f"prog_bezcen_{season(slots[k])}"]
            net = pvk[k] - ld[k]
            over = 0.0                                                 # nadwyzka PV, ktora nie weszla do baterii [kWh AC]

            def store(e, ac):                                          # ladowanie z PV: do baterii trafia ac x ec
                put = min(ac * ec, max(cap_kwh - e, 0.0))
                return e + put, ac - put / ec

            def draw(e, ac, floor):                                    # dom z baterii: ubywa ac / ed, brak -> z sieci
                use = min(ac, max(e - floor, 0.0) * ed)
                return e - use / ed, ac - use

            if is_ch and sh and in_sh(k):                              # godzina sprzedazy: dom z baterii, bez ladowania
                if net >= 0:
                    e, over = store(e, net)
                else:
                    e, short = draw(e, -net, kwh(reserve[k]))
                    imp += short
            elif is_ch and sh:                                         # pozostale godziny: laduj pelna moca pod cel + sprzedaz
                imp += max(-net, 0)
                e, over = store(e, max(net, 0))
                ahead = sum(sell[j] + max(ld[j] - pvk[j], 0) for j in range(k + 1, b) if in_sh(j)) / ed
                want = min(kwh(soc_max), kwh(tgt if tgt is not None else res_min) + ahead)
                if want - e > 0.005:
                    left = max(sum(1 for j in range(k, b) if not in_sh(j)), 1)
                    need = (want - e) / left
                    put = min(ch_slot, max(soft, need), want - e)      # do baterii: lagodnie, szybciej gdy nie zdazy
                    grid = put / ec                                    # z sieci (ze stratami)
                    e += put
                    imp += grid
                    act = "charge"
                    why = f"tania strefa G12: laduje pod cel {tgt or res_min:.0f}% + sprzedaz w innej godzinie" + (f"; szybciej niz {p.get('ladowanie_lagodne_c', 0.2):.2g}C – inaczej nie zdazy" if need > soft + 1e-6 else "")
            elif is_ch:
                imp += max(-net, 0)                                    # dom z sieci w taniej strefie (bateria trzyma)
                e, over = store(e, max(net, 0))
                if k == a:                                             # jeden ciagly blok ladowania, koniec `ladowanie_zapas_min` przed koncem strefy
                    blk = None
                    if tgt is not None and kwh(tgt) - e > 0.005:
                        zap = int(p.get("ladowanie_zapas_min", 120) // 15)
                        if b - a < zap + 4:                            # krotka strefa (np. 13–15): zapas 30 min
                            zap = min(2, max(b - a - 1, 0))
                        end = b - zap
                        tot = kwh(tgt) - e
                        n_ch = max(4, -(-tot // max(soft, 1e-6)))      # min. 1 h, lagodnie 0,2C
                        if n_ch > end - a:                             # nie miesci sie -> zjada zapas, potem szybciej
                            end = b
                        n_ch = int(min(n_ch, end - a))
                        blk = (end - n_ch, end, min(ch_slot, tot / max(n_ch, 1)))
                if blk and blk[0] <= k < blk[1] and kwh(tgt) - e > 0.005:
                    rest = kwh(tgt) - e
                    put = min(ch_slot, max(blk[2], rest / (blk[1] - k)), rest)
                    grid = put / ec
                    e += put
                    imp += grid
                    act = "charge"
                    why = f"tania strefa G12, cel {tgt:.0f}%: ladowanie jednym blokiem {slots[blk[0]].astimezone(WAW):%H:%M}–{slots[blk[1] - 1].astimezone(WAW) + timedelta(minutes=15):%H:%M}" + (f" (szybciej niz {p.get('ladowanie_lagodne_c', 0.2):.2g}C – inaczej nie zdazy)" if blk[2] > soft + 1e-6 else "")
                else:
                    act = "hold"
                    why = "tania strefa G12: bateria trzyma, dom z sieci" + (" (po naladowaniu, do drogiej strefy)" if blk and k >= blk[1] else "")
            else:
                if net >= 0:
                    e, over = store(e, net)
                else:
                    e, short = draw(e, -net, kwh(reserve[k]))          # brak w baterii -> dom z sieci
                    imp += short
            if sell[k] > 0:
                s_amt = min(sell[k], max(e - kwh(reserve[k]), 0.0) * ed)
                if s_amt > 0.01:
                    e -= s_amt / ed
                    exp += s_amt
                    act, grid, why = "sell", s_amt, why_sell[k]
            if over > 1e-6:                                            # bateria pelna -> nadmiar PV
                if price[k] is not None and price[k] < bezcen:
                    act, why = "block", f"RCE {price[k]:.2f} < prog za bezcen {bezcen:.2f}, eksport zablokowany"
                else:
                    exp += over
            if act == "hold" and exp > 0:
                act = "self"
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
            LOG.debug("  %s %-6s %.3f kWh RCE %s SOC %.0f%%", datetime.fromisoformat(s.start).astimezone(WAW).strftime("%H:%M"), s.action, s.grid_kwh,
                      f"{s.price:.2f}" if s.price is not None else "-", s.soc)
    return out, summ


def as_dicts(slots: list[Slot]) -> list[dict]:
    return [asdict(s) for s in slots]
