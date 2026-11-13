"""Symulacja magazynu (v0.6.57): brak / 15 kWh / 30 kWh na historii godzinowej (dom, PV, G12, RCE x depozyt).

Strategia (ta sama dla kazdej pojemnosci, z wiedza o zuzyciu danego dnia – backtest):
- nadwyzka PV -> bateria (do pelna), reszta eksport po RCE x mnoznik depozytu,
- tania strefa: dom z sieci; bateria doladowywana z sieci (0,2C, limit przylacza) do zapotrzebowania
  najblizszego drogiego bloku (do nastepnej taniej strefy),
- droga strefa: dom z baterii do SOC minimalnego,
- arbitraz: gdy RCE x depozyt >= prog, sprzedaz z baterii ponad potrzebe do konca drogiego bloku.
Koszt = zakup x G12 - eksport x RCE x depozyt (bilans godzinowy).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import prices
from .diag import get_logger
from .tariff import buy_price, is_cheap

LOG = get_logger("symulacja")
WAW = ZoneInfo("Europe/Warsaw")


def _sim(hours, load, pv, rce, cap, p):
    eta_c, eta_d = p["eta_c"], p["eta_d"]
    smin = cap * p["soc_min"] / 100
    soc = cap * 0.5
    rate_g = cap * 0.2
    rate = cap * 0.5
    grid_max = p["max_pobor"]
    dep, thr = p["dep"], p["prog"]
    out = {}
    n = len(hours)
    # zapotrzebowanie drogiego bloku zaczynajacego sie po danej godzinie (do nastepnej taniej)
    need_after = [0.0] * (n + 1)
    acc = 0.0
    for i in range(n - 1, -1, -1):
        h = hours[i]
        if is_cheap(h):
            acc = 0.0
        else:
            acc += max(load[i] - pv[i], 0.0)
        need_after[i] = acc
    for i, h in enumerate(hours):
        l, g = load[i], pv[i]
        r = rce.get(h, 0.35) * dep
        imp = exp = 0.0
        if cap <= 0:
            net = l - g
            imp, exp = max(net, 0.0), max(-net, 0.0)
        else:
            sur = g - l
            if sur > 0:
                c = min(sur, rate, (cap - soc) / eta_c)
                soc += c * eta_c
                exp += sur - c
            else:
                d = -sur
                if is_cheap(h):
                    imp += d
                else:
                    u = min(d, rate, max(soc - smin, 0.0) * eta_d)
                    soc -= u / eta_d
                    imp += d - u
            if is_cheap(h):
                # doladowanie pod najblizszy drogi blok
                j = i + 1
                while j < n and is_cheap(hours[j]):
                    j += 1
                want = min(cap, smin + (need_after[j] if j <= n else 0.0) / eta_d)
                if soc < want:
                    c = min(rate_g, (want - soc) / eta_c, max(grid_max - imp, 0.0))
                    soc += c * eta_c
                    imp += c
            elif r >= thr and soc > smin:
                spare = soc - smin - need_after[i + 1] / eta_d if i + 1 <= n else 0.0
                if spare > 0:
                    s = min(spare * eta_d, rate)
                    soc -= s / eta_d
                    exp += s
        cost = imp * buy_price(h) - exp * r
        out[h] = (cost, imp, exp)
    return out


async def run(hass, eng) -> dict | None:
    hist = eng._hist or {}
    pv_act = eng.learn.pv_act or {}
    hours = sorted(h for h in hist if h in pv_act or not pv_act)
    if len(hours) < 24 * 3:
        return None
    a = hours[0].astimezone(WAW).date()
    b = hours[-1].astimezone(WAW).date()
    q = await prices.fetch_days(hass, max(a, b - timedelta(days=400)), b)
    rce = defaultdict(list)
    for s, v in q.items():
        rce[s.replace(minute=0)].append(v)
    rce_h = {h: sum(v) / len(v) for h, v in rce.items()}
    P = eng.p
    p = {"eta_c": P.get("sprawnosc_ladowania", 93) / 100, "eta_d": P.get("sprawnosc_rozladowania", 93) / 100,
         "soc_min": P.get("soc_min", 25), "max_pobor": P.get("max_pobor_w", 12000) / 1000,
         "dep": P.get("depozyt_mnoznik", 1.23), "prog": 0.77 * P.get("depozyt_mnoznik", 1.23) / 1.23}
    load = [hist[h] / 1000 for h in hours]
    pv = [pv_act.get(h, 0.0) for h in hours]
    cap_now = P.get("pojemnosc_wh", 15000) / 1000
    res = {k: _sim(hours, load, pv, rce_h, c, p) for k, c in (("0", 0.0), ("15", cap_now), ("30", cap_now * 2))}
    days: dict = defaultdict(lambda: {"0": [0, 0, 0], "15": [0, 0, 0], "30": [0, 0, 0]})
    for k, m in res.items():
        for h, (c, i, e) in m.items():
            d = days[h.astimezone(WAW).date().isoformat()][k]
            d[0] += c; d[1] += i; d[2] += e
    rows = [{"d": d, **{f"k{k}": round(v[k][0], 2) for k in v}, **{f"i{k}": round(v[k][1], 1) for k in v}, **{f"e{k}": round(v[k][2], 1) for k in v}}
            for d, v in sorted(days.items())]
    LOG.info("Symulacja magazynu: %d dni, oszczednosc 15 vs 0: %.0f zl, 30 vs 15: %.0f zl",
             len(rows), sum(r["k0"] - r["k15"] for r in rows), sum(r["k15"] - r["k30"] for r in rows))
    return {"dni": rows, "poj": cap_now, "rce_dni": len({h.astimezone(WAW).date() for h in rce_h}), "at": datetime.now(timezone.utc).isoformat()}
