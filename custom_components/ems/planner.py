"""Algorytm planowania EMS (sloty 15 min, horyzont: tak daleko, jak sa ceny RCE - dzis + jutro).

Zasady (spec 7 / 7a):
1. Prognoza na slot: zuzycie domu i produkcja PV.
2. W taniej strefie G12 laduj baterie tylko do poziomu, ktory pokryje dom + zaplanowana sprzedaz do
   nastepnej taniej strefy, z miejscem na nadwyzke PV (max 98%).
3. Sprzedaz w najdrozszych slotach RCE, rozbita na wiele okienek:
   - energia kupiona tanio: RCE >= prog_tania,
   - nadwyzka PV: najdrozsze wolne okienka, nigdy ponizej progu "za bezcen",
   - powyzej prog_droga sprzedaje nawet energie potrzebna domowi (dom dobierze z sieci).
4. Limit sprzedazy dziennie: lato 1,5x / zima 2x prognozy PV; dzien bez PV -> losowo 1-4 kWh.
5. Burza: zapas 50% od N godzin przed burza do konca burzy.
6. RCE ponizej progu "za bezcen" -> blokada eksportu.
"""
from __future__ import annotations

import random
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .diag import get_logger
from .tariff import is_cheap, season

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


def daily_cap(day, pv_day: float, p: dict) -> float:
    if pv_day < 0.3:
        rnd = random.Random(day.toordinal())
        return round(rnd.uniform(1, 4), 3)
    return pv_day * p[f"limit_sprzedazy_{'lato' if 4 <= day.month <= 9 else 'zima'}"]


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
    target = {}                                      # indeks bloku taniego -> docelowy SOC [%]
    soc_start = soc_now
    for bi, (a, b, is_ch) in enumerate(blocks):
        if is_ch:
            continue
        # okno drogie W = [a, b); poprzedni blok tani (jesli jest) laduje pod to okno
        need = sum(max(ld[k] - pvk[k], 0) for k in range(a, b))
        pv_in = sum(max(pvk[k] - ld[k], 0) for k in range(a, b))
        res_w = max(reserve[a:b]) if b > a else res_min
        thr_t = p[f"prog_tania_{season(slots[a])}"]
        thr_d = p[f"prog_droga_{season(slots[a])}"]
        bezcen = p[f"prog_bezcen_{season(slots[a])}"]
        cand = sorted((k for k in range(a, b) if price[k] is not None), key=lambda k: -price[k])
        # energia ponad potrzeby domu (z taniej strefy + nadwyzka PV)
        room_full = kwh(soc_max)
        start_kwh = room_full if bi > 0 and blocks[bi - 1][2] else kwh(soc_start)
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
            elif price[k] >= thr_t:
                amt = min(sell_slot, cap_left[d], spare - planned)
            elif price[k] >= bezcen and k >= first_pv and spare_pv - planned_pv > 0.01:
                amt = min(sell_slot, cap_left[d], spare_pv - planned_pv, spare - planned)
                planned_pv += max(amt, 0)
            else:
                continue
            if amt <= 0.01:
                continue
            sell[k] = amt
            planned += amt
            cap_left[d] -= amt
        # docelowy SOC na koniec poprzedniej taniej strefy
        if bi > 0 and blocks[bi - 1][2]:
            want = kwh(res_w) + need + planned - pv_in
            target[bi - 1] = min(soc_max, max(res_w, pct(want)))
        soc_start = res_w

    # --- symulacja slot po slocie ----------------------------------------------------------------
    out: list[Slot] = []
    soc = soc_now
    for bi, (a, b, is_ch) in enumerate(blocks):
        tgt = target.get(bi, soc_max if is_ch and bi == len(blocks) - 1 else None)
        for k in range(a, b):
            e = kwh(soc)
            act, grid = "self", 0.0
            if is_ch and tgt is not None and soc < tgt - 0.5:
                left = b - k
                grid = min(ch_slot, (kwh(tgt) - e) / max(left, 1) * 2, kwh(tgt) - e)
                e += grid
                act = "charge"
            net = pvk[k] - ld[k]
            if is_ch:
                e += max(net, 0)                                   # dom z sieci, nadwyzka PV do baterii
            else:
                e += net
            if sell[k] > 0:
                s_amt = min(sell[k], e - kwh(reserve[k]))
                if s_amt > 0.01:
                    e -= s_amt
                    act, grid = "sell", s_amt
            bezcen = p[f"prog_bezcen_{season(slots[k])}"]
            if act == "self" and price[k] is not None and price[k] < bezcen and e >= kwh(soc_max):
                act = "block"
            e = max(min(e, cap_kwh), kwh(min(reserve[k], soc)) if not is_ch else 0)
            soc = pct(e)
            out.append(Slot(slots[k].isoformat(), act, round(grid, 3), price[k], round(soc, 1),
                            round(pvk[k], 3), round(ld[k], 3), cheap[k], reserve[k] > res_min, reserve[k]))

    summ = {
        "ladowanie_kwh": round(sum(s.grid_kwh for s in out if s.action == "charge"), 2),
        "sprzedaz_kwh": round(sum(s.grid_kwh for s in out if s.action == "sell"), 2),
        "przychod_zl": round(sum(s.grid_kwh * (s.price or 0) for s in out if s.action == "sell"), 2),
        "pv_kwh": round(sum(pvk), 2),
        "zuzycie_kwh": round(sum(ld), 2),
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
