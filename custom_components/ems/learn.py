"""Nauka (v0.6.32): modele skladnikow zuzycia, kalibracja PV per miesiac, historia wspolczynnikow, dni podobne.

- pompa ciepla: kWh/h = a + b*T + c*wiatr + d*naslonecznienie (regresja wieloraka, rok); bezpiecznik – model
  uczony na danych sprzed 14 dni i sprawdzany na ostatnich 14: gdy gorszy od prostego a + b*T, zostaje prosty,
- urzadzenia (zmywarka, pralka, ...): z licznika kWh (albo mocy) cykle = dni z energia >= 0,2 kWh; cykle / tydzien,
  kWh na cykl, dni tygodnia, godzina startu; prognoza = srednia kWh w (dzien tygodnia, godzina) z 120 dni (nowsze wazniejsze),
- baza domu = dom − pompa − urzadzenia (dalej load_forecast: dzien tygodnia, typ dnia, temperatura),
- PV: mnoznik fakt / prognoza z archiwum pogody osobno na kazdy miesiac (min. 3 kWh prognozy w miesiacu, inaczej roczny),
- snapshot wspolczynnikow raz na dobe (Store ems_nauka_<entry>) -> historia "bylo -> jest",
- dni podobne: temperatura, wiatr, naslonecznienie, pora roku (±30 dni od daty, kazdy rok), typ dnia.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers.storage import Store

from .diag import get_logger
from .load_forecast import day_type

LOG = get_logger("nauka")
WAW = ZoneInfo("Europe/Warsaw")
H = lambda ts: ts.replace(minute=0, second=0, microsecond=0)   # noqa: E731


def _solve(a: list[list[float]], b: list[float]) -> list[float] | None:
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-9:
            return None
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] for i in range(n)]


def regress(rows: list[tuple[list[float], float]], ridge: float = 1e-3) -> list[float] | None:
    """Najmniejsze kwadraty: rows = [(x, y)], x zawiera 1 na poczatku."""
    if not rows:
        return None
    k = len(rows[0][0])
    xtx = [[0.0] * k for _ in range(k)]
    xty = [0.0] * k
    for x, y in rows:
        for i in range(k):
            xty[i] += x[i] * y
            for j in range(k):
                xtx[i][j] += x[i] * x[j]
    for i in range(1, k):
        xtx[i][i] += ridge * len(rows)
    return _solve(xtx, xty)


def hour_wx(weather: dict) -> dict:
    """{godzina_utc: {temp, wind, gti}} – srednie z 15 min."""
    acc: dict = defaultdict(lambda: defaultdict(list))
    for ts, v in weather.items():
        for k in ("temp", "wind", "gti", "cloud"):
            if v.get(k) is not None:
                acc[H(ts)][k].append(v[k])
    return {h: {k: sum(a) / len(a) for k, a in d.items()} for h, d in acc.items()}


def _x(w: dict, full: bool) -> list[float] | None:
    if w.get("temp") is None:
        return None
    if not full:
        return [1.0, w["temp"]]
    return [1.0, w["temp"], w.get("wind") or 0.0, (w.get("gti") or 0.0) / 1000]


def pump_model(pump: dict, wx: dict) -> dict | None:
    """pump {h: kWh}. Zwraca {coef, full, mae_full, mae_simple, r2, n}."""
    pts = [(h, wx[h], v) for h, v in pump.items() if h in wx and wx[h].get("temp") is not None]
    if len(pts) < 72:
        return None
    cut = max(h for h, _, _ in pts) - timedelta(days=14)
    train = [p for p in pts if p[0] < cut] or pts
    test = [p for p in pts if p[0] >= cut]
    res = {}
    for full in (False, True):
        c = regress([(_x(w, full), v) for _, w, v in train])
        if c is None:
            continue
        pred = lambda w: max(sum(a * b for a, b in zip(c, _x(w, full))), 0.0)   # noqa: E731
        res[full] = sum(abs(pred(w) - v) for _, w, v in test) / len(test) if test else None
    use_full = res.get(True) is not None and (res.get(False) is None or res[True] <= res[False])
    coef = regress([(_x(w, use_full), v) for _, w, v in pts])                    # ostatecznie na calosci
    if coef is None:
        return None
    ys = [v for _, _, v in pts]
    my = sum(ys) / len(ys)
    sst = sum((y - my) ** 2 for y in ys) or 1e-9
    sse = sum((max(sum(a * b for a, b in zip(coef, _x(w, use_full))), 0.0) - v) ** 2 for _, w, v in pts)
    coef = coef + [0.0] * (4 - len(coef))
    out = {"coef": [round(x, 4) for x in coef], "pelny": use_full, "mae_pelny": res.get(True), "mae_prosty": res.get(False),
           "r2": round(1 - sse / sst, 3), "n": len(pts)}
    LOG.info("Pompa: %s model %.3f %+.3f×T %+.3f×wiatr %+.3f×nasl. (R² %.2f, MAE 14 dni: pelny %s / prosty %s)",
             "PELNY" if use_full else "prosty (pelny gorszy)", *coef, out["r2"],
             f"{res.get(True):.3f}" if res.get(True) is not None else "-", f"{res.get(False):.3f}" if res.get(False) is not None else "-")
    return out


def pump_forecast(slots: list[datetime], weather: dict, m: dict | None) -> dict:
    if not m:
        return {}
    wx = hour_wx(weather)
    a, b, c, d = m["coef"]
    out = {}
    for s in slots:
        w = wx.get(H(s))
        out[s] = max(a + b * w["temp"] + c * (w.get("wind") or 0) + d * (w.get("gti") or 0) / 1000, 0.0) / 4 if w and w.get("temp") is not None else 0.0
    return out


def device_stats(hourly: dict, wh: float) -> dict:
    """hourly {h: kWh}: cykle, kWh/cykl, dni tygodnia, godziny startu, profil (dzien tygodnia, godzina) -> kWh."""
    if not hourly:
        return {}
    day: dict = defaultdict(float)
    first_h: dict = {}
    for h in sorted(hourly):
        loc = h.astimezone(WAW)
        day[loc.date()] += hourly[h]
        if hourly[h] >= 0.05 and loc.date() not in first_h:
            first_h[loc.date()] = loc.hour
    days = sorted(day)
    span = max((days[-1] - days[0]).days + 1, 1)
    cyc = [d for d in days if day[d] >= 0.2]
    wd = [0] * 7
    hrs = [0] * 24
    for d in cyc:
        wd[d.weekday()] += 1
        if d in first_h:
            hrs[first_h[d]] += 1
    today = datetime.now(WAW).date()
    prof: dict = defaultdict(list)
    for h, v in hourly.items():
        loc = h.astimezone(WAW)
        age = (today - loc.date()).days
        if 0 < age <= 120:
            prof[(loc.weekday(), loc.hour)].append((v, 0.985 ** age))
    pr = device_profile_l(hourly)
    cm: dict = defaultdict(int)
    for d in cyc:
        cm[d.month] += 1
    mdays: dict = defaultdict(set)
    for d in days:
        mdays[d.month].add(d)
    gaps = [(b - a).days for a, b in zip(cyc, cyc[1:])]
    return {"dni": span, "od": days[0].isoformat(), "cykle": len(cyc), "cykle_tydz": round(len(cyc) / span * 7, 2),
            "kwh_cykl": round(sum(day[d] for d in cyc) / len(cyc), 3) if cyc else 0, "co_ile_dni": round(sum(gaps) / len(gaps), 1) if gaps else None,
            "dni_tyg": wd, "godz_startu": hrs, "kwh_rok": round(sum(day.values()) / span * 365, 1), "profil": pr,
            "cykle_tydz_mies": {m: round(cm[m] / len(mdays[m]) * 7, 2) for m in mdays if len(mdays[m]) >= 7},
            "kalendarz": {d.isoformat(): round(day[d], 2) for d in days[-120:] if day[d] >= 0.05}}


def device_forecast(slots: list[datetime], st: dict) -> dict:
    pr = st.get("profil") or {}
    out = {}
    for s in slots:
        loc = s.astimezone(WAW)
        out[s] = pr.get(f"{loc.weekday()}-{loc.hour}", 0.0) / 4
    return out


def pv_month_cal(act: dict, fc_h: dict) -> dict:
    """{miesiac: mnoznik} fakt / prognoza (archiwum pogody)."""
    sa, sf = defaultdict(float), defaultdict(float)
    for h, a in act.items():
        f = fc_h.get(h)
        if f is None or (a < 0.02 and f < 0.02):
            continue
        m = h.astimezone(WAW).month
        sa[m] += a
        sf[m] += f
    return {m: round(min(1.6, max(0.3, sa[m] / sf[m])), 3) for m in sf if sf[m] >= 3}


def daily(hist_w: dict) -> dict:
    d: dict = defaultdict(float)
    for h, w in hist_w.items():
        d[h.astimezone(WAW).date()] += w / 1000
    return d


def similar(day0: date, feats: dict, k: int = 10) -> list[dict]:
    """feats {data: {t, wiatr, nasl, typ, dom, pv}} -> najbardziej podobne dni."""
    f0 = feats.get(day0)
    if not f0 or f0.get("t") is None:
        return []
    out = []
    for d, f in feats.items():
        if d == day0 or f.get("t") is None or f.get("dom") is None:
            continue
        doy = abs((d.timetuple().tm_yday - day0.timetuple().tm_yday + 182) % 365 - 182)
        dt, dw = abs(f["t"] - f0["t"]), abs((f.get("wiatr") or 0) - (f0.get("wiatr") or 0))
        n0, n1 = f0.get("nasl") or 0, f.get("nasl") or 0
        dn = abs(n1 - n0) / max(n0, n1, 0.5)
        if doy > 30 or dt > 3 or dw > 2 or dn > 0.3 or f["typ"] != f0["typ"]:
            continue
        sc = 100 - (dt / 3 * 30 + dw / 2 * 20 + dn / 0.3 * 25 + doy / 30 * 25) / 1.0
        out.append({"data": d.isoformat(), "podobienstwo": round(max(sc, 0)), **{x: (round(f[x], 2) if isinstance(f.get(x), float) else f.get(x)) for x in ("t", "wiatr", "nasl", "dom", "pv", "typ")}})
    return sorted(out, key=lambda x: -x["podobienstwo"])[:k]


class Learn:
    """Stan nauki silnika: modele + historia wspolczynnikow."""

    def __init__(self, hass, entry_id: str) -> None:
        self.store = Store(hass, 1, f"ems_nauka_{entry_id}")
        self.snap: dict = {}
        self.pump: dict | None = None
        self.dev: dict = {}           # nazwa -> stats
        self.dev_h: dict = {}         # nazwa -> {h: kWh}
        self.pv_cal_m: dict = {}
        self.pv_act: dict = {}        # {h: kWh} fakt PV (stara encja / datalogger)
        self.pv_day: dict = {}        # {data: {r, f, p, pogoda}} kalibracja PV dnia
        self.pv_mult_now: dict = {}   # mnozniki PV uzyte w biezacym planie
        self.at: str | None = None

    async def load(self) -> None:
        self.snap = (await self.store.async_load() or {}).get("dni", {})

    def snapshot(self, eng) -> None:
        """Raz na dobe (pierwsze przeliczenie po polnocy): wspolczynniki + blad prognozy z wczoraj."""
        today = datetime.now(WAW).date()
        key = today.isoformat()
        if key in self.snap:
            return
        y = today - timedelta(days=1)
        fd = fp = 0.0
        for k, v in eng.fc_log.items():
            if datetime.fromisoformat(k).astimezone(WAW).date() == y:
                r = v.get("dzien") or v.get("rano") or {}
                fd += r.get("load") or 0
                fp += r.get("pv") or 0
        ad = daily(eng._hist).get(y)
        ap = sum(v for h, v in self.pv_act.items() if h.astimezone(WAW).date() == y) if self.pv_act else None
        s = eng.summary or {}
        self.snap[key] = {
            "kal_pv": s.get("kalibracja_pv"), "kal_pv_m": self.pv_cal_m, "wsp_temp": s.get("wsp_temp"),
            "pompa": self.pump["coef"] if self.pump else None, "pompa_pelny": self.pump.get("pelny") if self.pump else None,
            "pompa_r2": self.pump.get("r2") if self.pump else None,
            "urz": {n: {"cykle_tydz": d.get("cykle_tydz"), "kwh_cykl": d.get("kwh_cykl")} for n, d in self.dev.items()},
            "wczoraj": {"dom_f": round(ad, 2) if ad else None, "dom_p": round(fd, 2) if fd else None,
                        "pv_f": round(ap, 2) if ap is not None else None, "pv_p": round(fp, 2) if fp else None},
            "dni_hist": len({h.astimezone(WAW).date() for h in eng._hist}),
        }
        self.store.async_delay_save(lambda: {"dni": self.snap}, 5)
        LOG.info("Snapshot nauki %s: %s", key, self.snap[key])


class LearnView(HomeAssistantView):
    """GET /api/ems/nauka?dzien=YYYY-MM-DD -> wszystko do zakladki Nauka."""

    url = "/api/ems/nauka"
    name = "api:ems:nauka"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        e = [v for k, v in hass.data.get("ems", {}).items() if not k.startswith("_")]
        if not e:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        eng = e[0]
        L = eng.learn
        try:
            d0 = date.fromisoformat(request.query.get("dzien", "")) if request.query.get("dzien") else datetime.now(WAW).date()
        except ValueError:
            d0 = datetime.now(WAW).date()
        wx = hour_wx(eng._wx_learn or eng._weather)
        wh = eng.p.get("weekend_od_godz", 15)
        dom_d = daily(eng._hist)
        pv_d: dict = defaultdict(float)
        for h, v in L.pv_act.items():
            pv_d[h.astimezone(WAW).date()] += v
        pump_d: dict = defaultdict(float)
        for h, v in eng._pump.items():
            pump_d[h.astimezone(WAW).date()] += v / 1000
        wxd: dict = defaultdict(lambda: defaultdict(list))
        for h, w in wx.items():
            dd = h.astimezone(WAW).date()
            for k in ("temp", "wind", "gti"):
                if w.get(k) is not None:
                    wxd[dd][k].append(w[k])
        feats = {}
        for dd in set(dom_d) | set(wxd):
            w = wxd.get(dd, {})
            t = w.get("temp")
            feats[dd] = {"t": sum(t) / len(t) if t else None, "wiatr": sum(w["wind"]) / len(w["wind"]) if w.get("wind") else None,
                         "nasl": sum(w["gti"]) / 1000 if w.get("gti") else None,
                         "typ": "weekend" if day_type(datetime.combine(dd, datetime.min.time(), WAW).replace(hour=12), wh) == "weekend" else "roboczy",
                         "dom": round(dom_d[dd], 2) if dd in dom_d else None, "pv": round(pv_d[dd], 2) if dd in pv_d else None,
                         "pompa": round(pump_d[dd], 2) if dd in pump_d else None}
        # prognoza z poczatku dnia (fc_log, 15 dni) i godzinowo dla wybranego dnia
        fc_day: dict = defaultdict(lambda: {"dom": 0.0, "pv": 0.0})
        hours = {i: {"dom_f": None, "pv_f": None, "dom_p": None, "pv_p": None, "dom_o": None} for i in range(24)}
        for k, v in eng.fc_log.items():
            ts = datetime.fromisoformat(k)
            loc = ts.astimezone(WAW)
            r = v.get("dzien") or v.get("rano") or {}
            o = v.get("ost") or {}
            fc_day[loc.date()]["dom"] += r.get("load") or 0
            fc_day[loc.date()]["pv"] += r.get("pv") or 0
            if loc.date() == d0:
                hh = hours[loc.hour]
                hh["dom_p"] = (hh["dom_p"] or 0) + (r.get("load") or 0)
                hh["pv_p"] = (hh["pv_p"] or 0) + (r.get("pv") or 0)
                hh["dom_o"] = (hh["dom_o"] or 0) + (o.get("load") or 0)
        for h, w in eng._hist.items():
            loc = h.astimezone(WAW)
            if loc.date() == d0:
                hours[loc.hour]["dom_f"] = round(w / 1000, 3)
        for h, v in L.pv_act.items():
            loc = h.astimezone(WAW)
            if loc.date() == d0:
                hours[loc.hour]["pv_f"] = round(v, 3)
        # wspolczynniki dnia: kalibracja PV dnia, model pompy (warstwy) vs fakt
        pm_d: dict = defaultdict(float)
        if L.pump:
            for h in eng._pump:
                w = wx.get(h)
                if w and w.get("temp") is not None:
                    pm_d[h.astimezone(WAW).date()] += _pred(pump_coef(L.pump, h) if L.pump.get("warstwy", True) else L.pump["coef"], w)
        for dd, f in feats.items():
            x = L.pv_day.get(dd)
            f["kal_pv"] = x["r"] if x else None
            f["pompa_m"] = round(pm_d[dd], 2) if dd in pm_d else None
            f["kwh_na_st"] = round(f["pompa"] / max(18 - f["t"], 1), 3) if f.get("pompa") is not None and f.get("t") is not None and f["t"] < 15 else None
        days = sorted(feats)
        ser = [{"data": dd.isoformat(), **feats[dd], "dom_p": round(fc_day[dd]["dom"], 2) if dd in fc_day else None,
                "pv_p": round(fc_day[dd]["pv"], 2) if dd in fc_day else None} for dd in days if dd <= datetime.now(WAW).date()]
        # probka pompy do wykresu (max 400 punktow)
        pts = [(wx[h]["temp"], wx[h].get("wind") or 0, v / 1000) for h, v in eng._pump.items() if h in wx and wx[h].get("temp") is not None]
        step = max(1, len(pts) // 400)
        # profil dobowy wg pory roku: (sezon, typ, godzina) -> kW
        prof: dict = defaultdict(list)
        for h, w in eng._hist.items():
            loc = h.astimezone(WAW)
            sez = "zima" if loc.month in (11, 12, 1, 2, 3) else "lato" if loc.month in (5, 6, 7, 8) else "przejsciowy"
            typ = "weekend" if day_type(loc, wh) == "weekend" else "roboczy"
            prof[f"{sez}|{typ}"].append((loc.hour, w / 1000))
        profil = {k: [round(sum(v for h, v in a if h == i) / max(sum(1 for h, _ in a if h == i), 1), 3) for i in range(24)] for k, a in prof.items()}
        return self.json({
            "dzien": d0.isoformat(), "przeliczono": L.at, "snapshoty": L.snap, "seria": ser, "godziny": [hours[i] for i in range(24)],
            "pompa": {k: v for k, v in (L.pump or {}).items() if k not in ("mies", "sez")} if L.pump else None, "pompa_pkt": [[round(a, 1), round(b, 1), round(c, 3)] for a, b, c in pts[::step]],
            "urzadzenia": {n: {k: v for k, v in d.items() if k != "profil"} for n, d in L.dev.items()},
            "pv_kal_m": L.pv_cal_m, "kal_pv": (eng.summary or {}).get("kalibracja_pv"), "wsp_temp": (eng.summary or {}).get("wsp_temp"),
            "profil": profil, "podobne": similar(d0, feats), "dzien_cechy": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in feats.get(d0, {}).items()},
            "dni_hist": len(dom_d), "bezpiecznik": (eng.summary or {}).get("nauka_bezpiecznik"), "pv_mnozniki": L.pv_mult_now,
            "pompa_warstwy": {"mies": {str(k): v for k, v in (L.pump or {}).get("mies", {}).items()}, "sez": (L.pump or {}).get("sez", {}),
                              "uzywa": "warstwy" if (L.pump or {}).get("warstwy") else "roczny", "mae_warstwy": (L.pump or {}).get("mae_warstwy"), "mae_roczny": (L.pump or {}).get("mae_roczny")},
        })


# ---- v0.6.33: algorytm "per wszystko" – dni podobne + miesiac + sezon + rok, mieszane wg ilosci danych ----------------
SEZ = {m: ("zima" if m in (11, 12, 1, 2, 3) else "lato" if m in (5, 6, 7, 8) else "przejsciowy") for m in range(1, 13)}


def day_wx(wx_h: dict) -> dict:
    """{data_lokalna: {t, wiatr, nasl, chmury}} z godzinowej pogody."""
    acc: dict = defaultdict(lambda: defaultdict(list))
    for h, w in wx_h.items():
        d = h.astimezone(WAW).date()
        for k, kk in (("temp", "t"), ("wind", "wiatr"), ("cloud", "chmury")):
            if w.get(k) is not None:
                acc[d][kk].append(w[k])
        if w.get("gti") is not None:
            acc[d]["nasl"].append(w["gti"] / 1000)
    return {d: {k: (sum(a) if k == "nasl" else sum(a) / len(a)) for k, a in v.items()} for d, v in acc.items()}


def pv_days(act: dict, fc_h: dict, wxd: dict) -> dict:
    """{data: {r: fakt/prognoza, f, p, ...pogoda}} – dni z prognoza >= 0,5 kWh."""
    a, f = defaultdict(float), defaultdict(float)
    for h, v in act.items():
        if h in fc_h:
            d = h.astimezone(WAW).date()
            a[d] += v
            f[d] += fc_h[h]
    return {d: {"r": round(min(2.0, max(0.1, a[d] / f[d])), 3), "f": round(a[d], 2), "p": round(f[d], 2), **wxd.get(d, {})} for d in f if f[d] >= 0.5}


def pv_mult(day: date, fw: dict, pvd: dict, cal_m: dict, cal_y: float) -> tuple[float, int]:
    """Mnoznik PV na dzien `day` przy prognozie pogody fw: dni podobne (±30 dni roku, chmury ±20 %, nasl. ±30 %, T ±5 °C)
    zmieszane z miesiecznym (a ten z rocznym) – waga podobnych = n / (n + 5)."""
    base = cal_m.get(day.month, cal_y) if cal_m else cal_y
    sim = []
    for d, x in pvd.items():
        doy = abs((d.timetuple().tm_yday - day.timetuple().tm_yday + 182) % 365 - 182)
        if doy > 30:
            continue
        if fw.get("chmury") is not None and x.get("chmury") is not None and abs(fw["chmury"] - x["chmury"]) > 20:
            continue
        n0, n1 = fw.get("nasl") or 0, x.get("nasl") or 0
        if max(n0, n1) > 0.3 and abs(n1 - n0) / max(n0, n1) > 0.3:
            continue
        if fw.get("t") is not None and x.get("t") is not None and abs(fw["t"] - x["t"]) > 5:
            continue
        sim.append((x["r"], 1 - doy / 45))
    if not sim:
        return base, 0
    s = sum(r * w for r, w in sim) / sum(w for _, w in sim)
    k = len(sim) / (len(sim) + 5)
    return round(k * s + (1 - k) * base, 3), len(sim)


def pump_layers(pump: dict, wx: dict) -> dict | None:
    """Pompa: model roczny (z bezpiecznikiem) + modele miesiac / sezon (te same zmienne, min. 168 h)."""
    y = pump_model(pump, wx)
    if not y:
        return None
    full = y["pelny"]
    by_m, by_s = defaultdict(list), defaultdict(list)
    for h, v in pump.items():
        w = wx.get(h)
        if not w or w.get("temp") is None:
            continue
        m = h.astimezone(WAW).month
        by_m[m].append((_x(w, full), v))
        by_s[SEZ[m]].append((_x(w, full), v))
    pad = lambda c: (c + [0.0] * 4)[:4]   # noqa: E731
    mies = {m: {"coef": [round(x, 4) for x in pad(c)], "n": len(r)} for m, r in by_m.items() if len(r) >= 168 and (c := regress(r, 0.01))}
    sez = {s: {"coef": [round(x, 4) for x in pad(c)], "n": len(r)} for s, r in by_s.items() if len(r) >= 168 and (c := regress(r, 0.01))}
    y.update(mies=mies, sez=sez)
    # bezpiecznik warstw: mieszanka vs sam roczny na ostatnich 14 dniach
    last = max(pump)
    test = [(h, wx[h], v) for h, v in pump.items() if h >= last - timedelta(days=14) and h in wx and wx[h].get("temp") is not None]
    if test:
        e_y = sum(abs(_pred(y["coef"], w) - v) for _, w, v in test) / len(test)
        e_l = sum(abs(_pred(pump_coef(y, h), w) - v) for h, w, v in test) / len(test)
        y["warstwy"] = e_l <= e_y
        y["mae_warstwy"], y["mae_roczny"] = round(e_l, 4), round(e_y, 4)
        LOG.info("Pompa warstwy (miesiac/sezon/rok): MAE 14 dni %.3f vs sam roczny %.3f -> %s", e_l, e_y, "warstwy" if y["warstwy"] else "roczny")
    else:
        y["warstwy"] = True
    return y


def _pred(c: list, w: dict) -> float:
    return max(c[0] + c[1] * w["temp"] + c[2] * (w.get("wind") or 0) + c[3] * (w.get("gti") or 0) / 1000, 0.0)


def pump_coef(m: dict, ts: datetime) -> list:
    """Wspolczynniki na chwile ts: miesiac (waga n/(n+500)), sezon (n/(n+1000)), reszta = roczny."""
    mo = ts.astimezone(WAW).month
    out, rest = [0.0] * 4, 1.0
    for lay, key, k in (("mies", mo, 500), ("sez", SEZ[mo], 1000)):
        x = (m.get(lay) or {}).get(key)
        if x:
            w = rest * x["n"] / (x["n"] + k)
            out = [o + w * c for o, c in zip(out, x["coef"])]
            rest -= w
    return [o + rest * c for o, c in zip(out, m["coef"])]


def pump_forecast_l(slots: list[datetime], weather: dict, m: dict | None) -> dict:
    if not m:
        return {}
    wx = hour_wx(weather)
    use = m.get("warstwy", True)
    out = {}
    for s in slots:
        w = wx.get(H(s))
        out[s] = _pred(pump_coef(m, s) if use else m["coef"], w) / 4 if w and w.get("temp") is not None else 0.0
    return out


def temp_coeff_l(hist: dict, weather: dict, wh: float, month: int, fn) -> tuple[float, str]:
    """Wsp. temperatury: miesiac (min. 14 dni) -> sezon -> rok; fn = load_forecast.temp_coeff."""
    for lab, sel in ((f"miesiac {month}", lambda m: m == month), (f"sezon {SEZ[month]}", lambda m: SEZ[m] == SEZ[month])):
        sub = {h: w for h, w in hist.items() if sel(h.astimezone(WAW).month)}
        if len({h.astimezone(WAW).date() for h in sub}) >= 14:
            c = fn(sub, weather, wh)
            if c > 0:
                return c, lab
    return fn(hist, weather, wh), "rok"


def device_profile_l(hourly: dict) -> dict:
    """Profil urzadzenia: 120 dni (nowsze wazniejsze) 70 % + ten sam okres rok temu (±30 dni) 30 %, gdy jest."""
    today = datetime.now(WAW).date()
    rec, ly = defaultdict(list), defaultdict(list)
    for h, v in hourly.items():
        loc = h.astimezone(WAW)
        age = (today - loc.date()).days
        k = (loc.weekday(), loc.hour)
        if 0 < age <= 120:
            rec[k].append((v, 0.985 ** age))
        elif 335 <= age <= 395:
            ly[k].append((v, 1.0))
    keys = set(rec) | set(ly)
    wa = lambda a: sum(v * w for v, w in a) / sum(w for _, w in a) if a else None   # noqa: E731
    out = {}
    for k in keys:
        a, b = wa(rec.get(k)), wa(ly.get(k))
        out[f"{k[0]}-{k[1]}"] = (0.7 * a + 0.3 * b) if a is not None and b is not None else (a if a is not None else b * 0.5)
    return out
