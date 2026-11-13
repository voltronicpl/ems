"""Obecnosc domownikow (v0.6.55): person.* / device_tracker.* -> liczba osob w domu (0/1/2) na godzine.

- model: zuzycie domu BEZ pompy ciepla przy 0 / 1 / 2 osobach (ogolnie i per godzina doby),
  typowa obecnosc (dzien tygodnia, godzina) -> prawdopodobienstwo 0/1/2,
  urzadzenia (zmywarka, pralka...): starty na tydzien przy 0 / 1 / 2 osobach.
- prognoza: historia juz zawiera typowa obecnosc, wiec mnoznik = r[n_teraz] / E[r] dla najblizszych godzin
  (wygasa przez 2 h), dalej 1. Przy < 7 dniach danych o obecnosci -> brak modelu (mnoznik 1).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .diag import get_logger

LOG = get_logger("obecnosc")
WAW = ZoneInfo("Europe/Warsaw")
HOME = ("home",)


def now_count(hass, ents: list) -> int | None:
    if not ents:
        return None
    n = sum(1 for e in ents if (s := hass.states.get(e)) and s.state in HOME)
    return min(n, 2)


async def history(hass, ents: list, days: int = 365) -> dict:
    """{godzina UTC: liczba osob w domu 0/1/2} – osoba 'w domu' w godzinie, gdy byla >= 30 min."""
    if not ents:
        return {}
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.history import get_significant_states
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    try:
        res = await get_instance(hass).async_add_executor_job(
            lambda: get_significant_states(hass, start, end, list(ents), None, True, False, True, True))
    except Exception as err:  # noqa: BLE001
        LOG.warning("Historia obecnosci: %s", err)
        return {}
    home: dict = defaultdict(float)                      # (h) -> suma osobo-godzin
    first = None
    for ent, sts in (res or {}).items():
        rows = []
        for s in sts:
            st = s.state if hasattr(s, "state") else s.get("state")
            t = s.last_changed if hasattr(s, "last_changed") else s.get("last_changed")
            if isinstance(t, str):
                t = datetime.fromisoformat(t)
            if t is None or st in (None, "unknown", "unavailable"):
                continue
            rows.append((max(t, start), st in HOME))
        if not rows:
            continue
        first = rows[0][0] if first is None else min(first, rows[0][0])
        rows.append((end, rows[-1][1]))
        for (a, on), (b, _) in zip(rows, rows[1:]):
            if not on or b <= a:
                continue
            h = a.replace(minute=0, second=0, microsecond=0)
            while h < b:
                h2 = h + timedelta(hours=1)
                home[h] += (min(b, h2) - max(a, h)).total_seconds() / 3600
                h = h2
    if first is None:
        return {}
    out, h = {}, first.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    while h < end - timedelta(hours=1):
        out[h] = min(2, int(home.get(h, 0.0) + 0.5))
        h += timedelta(hours=1)
    LOG.info("Historia obecnosci %s: %d h (od %s)", ents, len(out), first.astimezone(WAW).strftime("%d.%m.%Y"))
    return out


def _starts(hh: dict) -> list:
    """Godziny startu cykli urzadzenia (pierwsza godzina >= 0,05 kWh po co najmniej 2 h przerwy)."""
    out, last = [], None
    for h in sorted(hh):
        if hh[h] >= 0.05:
            if last is None or h - last > timedelta(hours=2):
                out.append(h)
            last = h
    return out


def model(base_hist_w: dict, pres: dict, dev_h: dict) -> dict | None:
    common = [h for h in base_hist_w if h in pres]
    if len({h.astimezone(WAW).date() for h in common}) < 7:
        return None
    s = defaultdict(float); n = defaultdict(int)
    sh = defaultdict(float); nh = defaultdict(int)
    for h in common:
        k = pres[h]; v = base_hist_w[h] / 1000; hr = h.astimezone(WAW).hour
        s[k] += v; n[k] += 1; sh[(k, hr)] += v; nh[(k, hr)] += 1
    tot = sum(s.values()) / max(sum(n.values()), 1)
    if tot <= 0:
        return None
    r = {}
    for k in (0, 1, 2):
        if n[k] >= 24:
            r[k] = round(min(2.0, max(0.2, s[k] / n[k] / tot)), 3)
    if not r:
        return None
    for k in (0, 1, 2):                                 # brak danych dla danej liczby osob -> najblizsza znana
        if k not in r:
            r[k] = r.get(1) or r.get(2 if k == 1 else 1) or 1.0
    godz = {k: [round(sh[(k, hr)] / nh[(k, hr)], 3) if nh[(k, hr)] >= 3 else None for hr in range(24)] for k in (0, 1, 2)}
    # typowa obecnosc: (dzien tyg, godzina) -> [p0, p1, p2] (90 dni, nowsze wazniejsze)
    today = datetime.now(WAW).date()
    tp = defaultdict(lambda: [0.0, 0.0, 0.0])
    for h, k in pres.items():
        loc = h.astimezone(WAW); age = (today - loc.date()).days
        if 0 < age <= 90:
            tp[(loc.weekday(), loc.hour)][k] += 0.98 ** age
    typ = {}
    for key, v in tp.items():
        sm = sum(v) or 1
        typ[f"{key[0]}-{key[1]}"] = [round(x / sm, 3) for x in v]
    hrs_n = {k: n[k] for k in (0, 1, 2)}
    dev = {}
    for name, hh in dev_h.items():
        st = [h for h in _starts(hh) if h in pres]
        if not st:
            continue
        c = defaultdict(int)
        for h in st:
            c[pres[h]] += 1
        rate = {k: (c[k] / hrs_n[k] * 168 if hrs_n[k] >= 24 else None) for k in (0, 1, 2)}
        avg = len(st) / max(sum(hrs_n.values()), 1) * 168
        dev[name] = {"tydz": {k: (round(v, 2) if v is not None else None) for k, v in rate.items()}, "sr": round(avg, 2),
                     "r": {k: (round(min(3.0, v / avg), 3) if v is not None and avg > 0 else 1.0) for k, v in rate.items()}}
    LOG.info("Model obecnosci: zuzycie (bez pompy) 0 os. x%.2f, 1 os. x%.2f, 2 os. x%.2f; godzin %s; urzadzenia %s",
             r[0], r[1], r[2], hrs_n, {k: v["tydz"] for k, v in dev.items()})
    return {"r": r, "godz": godz, "typ": typ, "godzin": hrs_n, "dev": dev, "sr_kwh_h": round(tot, 3)}


def _exp(m: dict, loc: datetime, r: dict) -> float:
    p = m["typ"].get(f"{loc.weekday()}-{loc.hour}")
    if not p:
        return 1.0
    return sum(p[k] * r[k] for k in (0, 1, 2)) or 1.0


def mult(slots: list, m: dict | None, n_now: int | None, now: datetime, dev: str | None = None) -> dict:
    """{slot: mnoznik}. Bliskie godziny wg obecnosci teraz (wygasa przez 2 h), dalej 1 (typowa obecnosc jest w historii)."""
    if not m or n_now is None:
        return {}
    r = m["r"] if dev is None else (m["dev"].get(dev) or {}).get("r")
    if not r:
        return {}
    r = {int(k): v for k, v in r.items()}
    out = {}
    for s in slots:
        lead = max((s - now).total_seconds() / 3600, 0)
        w = max(0.0, 1 - lead / 2)
        if w <= 0:
            continue
        e = _exp(m, s.astimezone(WAW), r)
        out[s] = 1 + w * (r[n_now] / e - 1)
    return out


def view(m: dict | None, pres: dict, base_hist_w: dict, a, b) -> dict | None:
    """Dane do Nauki dla okresu [a, b]: dzienne osobo-godziny vs zuzycie bez pompy, srednie per godzina."""
    if not m:
        return {"brak": True, "godzin_danych": len(pres)} if pres else None
    day = defaultdict(lambda: [0.0, 0, 0.0, 0])         # osoby-suma, godzin, kWh, godzin kWh
    sh = defaultdict(float); nh = defaultdict(int)
    for h, k in pres.items():
        d = h.astimezone(WAW).date()
        if a <= d <= b:
            day[d][0] += k; day[d][1] += 1
    for h, w in base_hist_w.items():
        loc = h.astimezone(WAW)
        if a <= loc.date() <= b:
            day[loc.date()][2] += w / 1000; day[loc.date()][3] += 1
            if h in pres:
                sh[(pres[h], loc.hour)] += w / 1000; nh[(pres[h], loc.hour)] += 1
    dzien = [{"d": d.isoformat(), "osoby": round(v[0] / v[1], 2) if v[1] else None, "dom": round(v[2], 2) if v[3] >= 20 else None}
             for d, v in sorted(day.items())]
    okres = {k: [round(sh[(k, hr)] / nh[(k, hr)], 3) if nh[(k, hr)] >= 2 else None for hr in range(24)] for k in (0, 1, 2)}
    return {**m, "dzien": dzien, "okres_godz": okres}
