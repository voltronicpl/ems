"""Silnik EMS: laczy moduly (ceny, pogoda, PV, zuzycie, plan, wykonanie, reczne) i trzyma stan.

Cykle:
- co 15 min (i po wlaczeniu algorytmu / przycisku "Przelicz"): pobranie danych + nowy plan,
- co 1 min: postep zadania recznego + wykonanie planu na falowniku (gdy algorytm wlaczony).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store

from . import learn, load_forecast, prices, pv_forecast, tariff, weather
from .learn import Learn
from .const import MANUAL, PARAMS
from .diag import get_logger
from .executor import Executor
from .manual import ManualJob
from .sources import Sources
from .batcost import BatCost
from .planner import as_dicts, plan

LOG = get_logger("silnik")
WAW = ZoneInfo("Europe/Warsaw")
SIGNAL = "ems_update"


class Engine:
    def __init__(self, hass: HomeAssistant, dev: str, entry_id: str) -> None:
        self.pge = None                                # rozliczenie PGE (pge_link.start)
        self.hass, self.dev, self.entry_id = hass, dev, entry_id
        self.p = {k: v[5] for k, v in {**PARAMS, **MANUAL}.items()}
        self.enabled = False
        self.plan: list[dict] = []
        self.summary: dict = {}
        self.forecast: dict = {}
        self.manual: ManualJob | None = None
        self.exec = Executor(hass, dev, entry_id)
        self.last_plan: datetime | None = None
        self.error: str | None = None
        self._unsubs = []
        self._prices: dict = {}
        self._prices_est: dict = {}
        self._weather: dict = {}
        self._hist: dict = {}
        self._hist_at: datetime | None = None
        self._busy = False
        self.guard_warn: str | None = None
        self.guard_n = 0
        self._last_exec: datetime | None = None
        self.manual_log: list[dict] = []             # historia recznych zadan (14 dni)
        self._mstore = Store(hass, 1, f"ems_reczne_{entry_id}")
        self.bat = BatCost(hass, entry_id)                 # koszt energii w baterii
        self.src = Sources(hass, entry_id)                 # stare encje z HA do nauki
        self.learn = Learn(hass, entry_id)                 # nauka: modele skladnikow, historia wspolczynnikow
        self._pump: dict = {}
        self._pv_cal = 1.0
        self._wx_learn: dict = {}
        self.fc_log: dict = {}                       # slot ISO -> {"rano": {...}, "ost": {...}} (14 dni) – prognoza vs fakt
        self._fstore = Store(hass, 1, f"ems_prognozy_{entry_id}")

    # --- odczyty z dataloggera -----------------------------------------------------------------
    def r(self, key: str, default=None):
        st = self.hass.states.get(f"sensor.{self.dev}_{key}")
        try:
            return float(st.state)
        except (AttributeError, ValueError, TypeError):
            return default

    def limits(self) -> tuple[float, float]:
        """Max moc ladowania i sprzedazy [W] w ramach limitow twardych + limitu BMS (temperatura)."""
        v = self.r("bateria_napiecie", 51.2) or 51.2
        def n(k, d):
            st = self.hass.states.get(f"number.{self.dev}_{k}")
            try:
                return float(st.state)
            except (AttributeError, ValueError, TypeError):
                return d
        a_ch = min(n("limit_twardy_max_prad_ladowania_baterii", 50), n("limit_twardy_prad_ladowania_z_sieci", 50))
        bms = self.r("bms_prad_ladowania")
        if bms:
            a_ch = min(a_ch, bms)
        sell_w = min(n("limit_twardy_max_moc_sprzedazy", 3000), n("limit_twardy_max_prad_rozladowania_baterii", 50) * v)
        return a_ch * v, sell_w

    # --- historia recznych ----------------------------------------------------------------------
    async def _load_log(self) -> None:
        self.manual_log = (await self._mstore.async_load() or {}).get("wpisy", [])
        self.fc_log = (await self._fstore.async_load() or {}).get("sloty", {})
        await self.src.load()
        await self.learn.load()
        await self.bat.load()
        self.push()

    def _price_now(self, kind: str) -> float | None:
        now = datetime.now(timezone.utc)
        if kind == "buy":
            return tariff.buy_price(now)
        slot = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
        rce = self._prices.get(slot)
        return None if rce is None else rce * self.p["depozyt_mnoznik"]

    def _finish_manual(self, reason: str | None = None) -> None:
        if not self.manual:
            return
        rec = self.manual.record(reason)
        LOG.info("Reczne zapisane: %s", rec)
        cut = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        self.manual_log = [r for r in self.manual_log if r["od"] >= cut] + [rec]
        self._mstore.async_delay_save(lambda: {"wpisy": self.manual_log}, 1)
        self.manual = None

    def _log_forecast(self, now: datetime) -> None:
        """Zapamietuje prognoze kazdego przyszlego slotu: 'rano' = pierwsza (najwczesniejsza), 'ost' = ostatnia przed slotem."""
        cur = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
        for s in self.plan:
            if datetime.fromisoformat(s["start"]) < cur:
                continue
            rec = {k: s.get(k) for k in ("pv", "load", "soc", "action", "grid_kwh", "imp", "exp", "price")}
            e = self.fc_log.setdefault(s["start"], {})
            e.setdefault("rano", {**rec, "o": now.isoformat()})
            # "dzien" = prognoza z poczatku dnia (pierwsze przeliczenie po polnocy w dniu slotu)
            if "dzien" not in e and now.astimezone(WAW).date() == datetime.fromisoformat(s["start"]).astimezone(WAW).date():
                e["dzien"] = {**rec, "o": now.isoformat()}
            e["ost"] = {**rec, "o": now.isoformat()}
            # kazda aktualizacja w trakcie: [czas, pv, load, soc] gdy zmiana > 3 % (max 40 na slot)
            hh = e.setdefault("h", [])
            last = hh[-1] if hh else None
            v = [now.isoformat(), round(rec["pv"] or 0, 4), round(rec["load"] or 0, 4), round(rec["soc"] or 0, 1)]
            if not last or any(abs(a - b) > 0.03 * max(abs(b), 0.01) for a, b in zip(v[1:3], last[1:3])) or abs(v[3] - last[3]) > 1:
                hh.append(v)
                del hh[:-40]
        cut = (now - timedelta(days=15)).isoformat()
        self.fc_log = {k: v for k, v in self.fc_log.items() if k >= cut}
        self._fstore.async_delay_save(lambda: {"sloty": self.fc_log}, 30)

    def manual_today(self) -> dict:
        """Suma recznych dzis (z zadaniem w toku): {kup: {kwh, zl, n}, sprzedaj: {...}, wpisy: [...]}."""
        d0 = datetime.now(WAW).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
        rows = [r for r in self.manual_log if r["od"] >= d0]
        if self.manual:
            rows = rows + [{**self.manual.record("w toku"), "do": None}]
        out = {"kup": {"kwh": 0.0, "zl": 0.0, "n": 0}, "sprzedaj": {"kwh": 0.0, "zl": 0.0, "n": 0}}
        for r in rows:
            o = out[r["typ"]]
            o["kwh"] += r["zrobione_kwh"]; o["zl"] += r["zl"]; o["n"] += 1
        for o in out.values():
            o["kwh"], o["zl"] = round(o["kwh"], 3), round(o["zl"], 2)
        out["wpisy"] = rows
        return out

    # --- cykle --------------------------------------------------------------------------------
    async def reload_pge(self, settings: dict) -> None:
        """Nowe ustawienia rozliczenia PGE: nowy PGELedger na tych samych danych, sensory zostaja podpiete."""
        from .pge.coordinator import PGELedger
        old = self.pge
        await old.async_shutdown()
        new = PGELedger(self.hass, settings, old.store.key)
        new.cfg_store, new.listeners, new.ems, new.extra = old.cfg_store, old.listeners, old.ems, getattr(old, 'extra', {})
        await new.async_load()
        self.pge = new
        new._notify()

    def start(self) -> None:
        self.hass.async_create_task(self._load_log())
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, timedelta(seconds=10)))
        self.hass.async_create_task(self.replan("start"))

    def stop(self) -> None:
        for u in self._unsubs:
            u()
        self._unsubs.clear()

    @callback
    def _tick(self, _now) -> None:
        now = datetime.now(timezone.utc)
        try:
            self.bat.tick(self.r("bateria_soc"), self.p["pojemnosc_wh"] / 1000, self.r("bateria_moc"), self.r("pv_moc_suma", 0.0) or 0.0,
                          self.r("obciazenie_moc_suma", 0.0) or 0.0, self.p.get("sprawnosc_ladowania", 93) / 100)
        except Exception as err:  # noqa: BLE001
            LOG.debug("koszt baterii: %s", err)
        try:
            self._guard_check()
        except Exception as err:  # noqa: BLE001
            LOG.debug("straznik: %s", err)
        if self._busy:
            return
        if not self.last_plan or now - self.last_plan >= timedelta(minutes=self.p["plan_co_min"]):
            self.hass.async_create_task(self._guard(self.replan(f"co {int(self.p['plan_co_min'])} min")))
        elif not self._last_exec or now - self._last_exec >= timedelta(seconds=self.p["zapis_co_s"]):
            self.hass.async_create_task(self._guard(self.execute()))

    def _guard_check(self) -> None:
        """Straznik zgodnosci (v0.6.35): przy kazdym NOWYM odczycie dataloggera porownuje falownik z planem.
        Bateria laduje z sieci, a plan nie ma ladowania / oddaje do sieci, a plan nie ma sprzedazy -> po 3 odczytach
        z rzedu: nowy plan ze stanu faktycznego + przepisanie TOU. Po 2 interwencjach bez skutku -> WYLACZA algorytm
        (snapshot = Twoje ustawienia wracaja) + ostrzezenie w Przegladzie."""
        st = self.hass.states.get(f"sensor.{self.dev}_bateria_moc")
        mark = st.last_updated if st else None
        if mark is None or mark == getattr(self, "_g_mark", None):
            return
        self._g_mark = mark
        if not self.enabled or self.manual or not self.plan:
            self._g_bad = 0                                  # ostrzezenie o wylaczeniu zostaje widoczne
            return
        act = (self.current() or {}).get("action", "self")
        bat, grid = self.r("bateria_moc"), self.r("siec_moc_suma")
        if bat is None or grid is None:
            return
        bad = None
        if act != "charge" and bat < -300 and grid > 300:
            bad = f"bateria ładuje {-bat:.0f} W z sieci (pobór {grid:.0f} W), a plan: {act}"
        elif act != "sell" and grid < -300 and bat > 300:
            bad = f"bateria oddaje do sieci {-grid:.0f} W, a plan: {act}"
        if not bad:
            if getattr(self, "_g_bad", 0):
                LOG.info("[straznik] zgodnie z planem")
            self._g_bad, self._g_fix = 0, 0
            self.guard_warn = None
            return
        self._g_bad = getattr(self, "_g_bad", 0) + 1
        LOG.warning("[straznik] niezgodnosc %d/3: %s", self._g_bad, bad)
        if self._g_bad < 3 or self._busy:
            return
        self._g_bad = 0
        self._g_fix = getattr(self, "_g_fix", 0) + 1
        self.guard_n = getattr(self, "guard_n", 0) + 1
        if self._g_fix > 2:
            self.guard_warn = f"Strażnik WYŁĄCZYŁ algorytm: {bad}. 2× nowy plan + przepisanie TOU nie pomogło – przywrócone Twoje ustawienia, sprawdź na LCD."
            LOG.error("[straznik] %s", self.guard_warn)
            self._g_fix = 0
            self.hass.async_create_task(self.set_enabled(False))
            return
        LOG.warning("[straznik] interwencja %d: nowy plan ze stanu faktycznego + przepisanie TOU", self._g_fix)
        self.exec.last_points = None
        self.exec.force = True                              # przepisz WSZYSTKIE punkty TOU, nawet jesli HA pokazuje to samo
        self.hass.async_create_task(self._guard(self.replan("straznik: niezgodnosc z planem")))

    async def _guard(self, coro) -> None:
        self._busy = True
        try:
            await coro
        finally:
            self._busy = False

    def push(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL)

    async def replan(self, why: str) -> None:
        try:
            LOG.info("=== Przeliczanie planu (%s) ===", why)
            now = datetime.now(timezone.utc)
            today = now.astimezone(WAW).date()
            tomorrow = today + timedelta(days=1)
            has_tm = any(k.astimezone(WAW).date() == tomorrow for k in self._prices)
            # ceny: co godzine; a od 13:30, gdy jutra jeszcze nie ma – przy kazdym przeliczeniu (PSE publikuje ok. 13:50)
            if not self._prices or now.astimezone(WAW).minute < 15 or not why.startswith("co ") or (not has_tm and now.astimezone(WAW).hour * 60 + now.astimezone(WAW).minute >= 810):
                got = await prices.fetch(self.hass, [today, tomorrow])
                if got:
                    self._prices = got
                if any(k.astimezone(WAW).date() == tomorrow for k in self._prices) and not has_tm:
                    LOG.info("RCE na jutro pobrane z PSE o %s – plan wstepny zastapiony", now.astimezone(WAW).strftime("%H:%M"))
            self._prices_est = {}
            if not any(k.astimezone(WAW).date() == tomorrow for k in self._prices):
                try:
                    self._prices_est = await prices.estimate(self.hass, self._prices, tomorrow)
                except Exception as err:  # noqa: BLE001
                    LOG.warning("RCE szacowane: blad (%s)", err)
            pr_all = {**self._prices_est, **self._prices}
            lat, lon = self.hass.config.latitude, self.hass.config.longitude
            self._weather = await weather.fetch(self.hass, lat, lon, self.p["pv_nachylenie"], self.p["pv_azymut"]) or self._weather
            if not self._hist_at or now - self._hist_at > timedelta(hours=1):
                lat, lon = self.hass.config.latitude, self.hass.config.longitude
                arch = await weather.fetch_archive(self.hass, lat, lon, self.p["pv_nachylenie"], self.p["pv_azymut"], 365)
                self._wx_learn = {**arch, **self._weather}          # pogoda do nauki: rok archiwum + 28 dni z prognozy (nowsze wygrywa)
                self._hist = await load_forecast.history(self.hass, f"sensor.{self.dev}_obciazenie_moc_suma", 365)
                old = await self.src.hourly("dom", now - timedelta(days=365), now)        # stare encje: dluzsza historia
                if old:
                    merged = {h: v * 1000 for h, v in old.items()}
                    n_dl = len(self._hist)
                    merged.update(self._hist)                                          # datalogger ma pierwszenstwo
                    self._hist = merged
                    LOG.info("Historia zuzycia: %d h (datalogger %d h + stara encja %d h)", len(merged), n_dl, len(old))
                self._pump = {h: v * 1000 for h, v in (await self.src.hourly("pompa", now - timedelta(days=365), now)).items()}
                pv_act = await self.src.hourly("pv", now - timedelta(days=365), now - timedelta(hours=1))
                if not pv_act:                                                         # brak starej encji -> PV z dataloggera
                    pv_act = {h: w / 1000 for h, w in (await load_forecast.history(self.hass, f"sensor.{self.dev}_pv_moc_suma", 365)).items()}
                self.learn.pv_act = pv_act
                self._pv_cal = await self._pv_calibration(now)
                wxh = learn.hour_wx(self._wx_learn)
                self.learn.pump = learn.pump_layers({h: v / 1000 for h, v in self._pump.items()}, wxh) if self._pump else None
                devs = {}
                for d in self.src.dev:
                    hh = await self.src.hourly_ent(d.get("kwh") or d.get("moc"), now - timedelta(days=365), now)
                    if hh:
                        self.learn.dev_h[d["nazwa"]] = hh
                        devs[d["nazwa"]] = {**learn.device_stats(hh, self.p["weekend_od_godz"]), "ikona": d.get("ikona", "🔌")}
                        LOG.info("Urzadzenie %s: %s cykli/tydz, %s kWh/cykl, co %s dni", d["nazwa"], devs[d["nazwa"]].get("cykle_tydz"),
                                 devs[d["nazwa"]].get("kwh_cykl"), devs[d["nazwa"]].get("co_ile_dni"))
                self.learn.dev = devs
                self.learn.at = now.isoformat()
                self._hist_at = now

            start = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
            last = max((s for s in pr_all), default=start + timedelta(hours=24))
            last = max(last, start + timedelta(hours=12))
            slots, t = [], start
            while t <= last:
                slots.append(t)
                t += timedelta(minutes=15)

            # korekta PV w trakcie dnia
            prev = [start - timedelta(minutes=15 * i) for i in range(1, 9)]
            pp = {**self.p, "pv_sprawnosc": self.p["pv_sprawnosc"] * self._pv_cal}     # kalibracja z produkcji PV (stara encja)
            pv_prev = pv_forecast.forecast(prev, self._weather, pp)
            pv_now_w = self.r("pv_moc_suma", None)
            fact = pv_forecast.intraday_factor((pv_now_w or 0) / 1000 * 2, sum(pv_prev.values())) if pv_now_w is not None else 1.0
            pvk = pv_forecast.forecast(slots, self._weather, pp, fact)
            if self._pv_cal and (self.learn.pv_cal_m or self.learn.pv_day):        # kalibracja PV: dni podobne + miesiac + rok
                fwd = learn.day_wx(learn.hour_wx(self._weather))
                mult = {}
                for d in {s.astimezone(WAW).date() for s in pvk}:
                    mult[d] = learn.pv_mult(d, fwd.get(d, {}), self.learn.pv_day, self.learn.pv_cal_m, self._pv_cal)
                    LOG.info("PV %s: mnoznik x%.2f (dni podobnych: %d)", d, *mult[d])
                self.learn.pv_mult_now = {d.isoformat(): v for d, v in mult.items()}
                pvk = {s: v * mult[s.astimezone(WAW).date()][0] / self._pv_cal for s, v in pvk.items()}

            wl = self._wx_learn or self._weather
            # zuzycie ze skladnikow: baza (dom − pompa − urzadzenia) + pompa (T, wiatr, slonce) + urzadzenia (profil cykli)
            pm = self.learn.pump
            sub = defaultdict(float)
            if pm:
                for h, w in self._pump.items():
                    sub[h] += w
            for hh in self.learn.dev_h.values():
                for h, v in hh.items():
                    sub[h] += v * 1000
            base_hist = {h: max(w - sub.get(h, 0.0), 0.0) for h, w in self._hist.items()}
            coeff, c_lab = (self.p["wsp_temp"], "reczny") if self.p["wsp_temp"] else learn.temp_coeff_l(base_hist, wl, self.p["weekend_od_godz"], now.astimezone(WAW).month, load_forecast.temp_coeff)
            LOG.info("Wsp. temperatury %.3f kWh/°C (%s)", coeff, c_lab)
            ldk = load_forecast.forecast(slots, base_hist, {**wl, **self._weather}, self.p, coeff)
            pump_model = pm["coef"] if pm else None
            if pm:
                pmp = learn.pump_forecast_l(slots, {**wl, **self._weather}, pm)
                ldk = {k: v + pmp.get(k, 0.0) for k, v in ldk.items()}
                LOG.info("Pompa ciepla w prognozie: %.2f kWh w horyzoncie (%s)", sum(pmp.values()), "T + wiatr + slonce" if pm.get("pelny") else "tylko T")
            for n, st in self.learn.dev.items():
                dv = learn.device_forecast(slots, st)
                ldk = {k: v + dv.get(k, 0.0) for k, v in ldk.items()}
                LOG.info("%s w prognozie: %.2f kWh w horyzoncie", n, sum(dv.values()))

            soc = self.r("bateria_soc", 50.0)
            ch_w, sell_w = self.limits()
            LOG.info("SOC %.0f%%, max ladowanie %.0f W, max sprzedaz %.0f W, ceny do %s",
                     soc, ch_w, sell_w, last.astimezone(WAW).strftime("%d.%m %H:%M"))
            bc = self.bat.avg()
            res, summ = plan(slots, pr_all, pvk, ldk, self._weather, soc, {**self.p, "koszt_baterii_zl": bc},
                             self.p["pojemnosc_wh"] / 1000, ch_w, sell_w)
            self.plan = as_dicts(res)
            if self._prices_est:                                   # plan wstepny: sloty na szacowanej RCE
                for d in self.plan:
                    if datetime.fromisoformat(d["start"]) in self._prices_est:
                        d["est"] = True
            self._log_forecast(now)
            self.summary = {**summ, "rce_szacowane": bool(self._prices_est), "koszt_baterii": self.bat.info(), "wsp_temp": round(coeff, 3), "korekta_pv": round(fact, 2), "kalibracja_pv": round(self._pv_cal, 2),
                            "pompa_model": [round(x, 3) for x in pump_model] if pump_model else None,
                            "nauka_bezpiecznik": {"pompa": ("pelny" if pm.get("pelny") else "prosty") if pm else None}}
            self.learn.snapshot(self)
            self.last_plan = now
            self.error = None
        except Exception as err:  # noqa: BLE001
            self.error = str(err)
            self.last_plan = datetime.now(timezone.utc)          # nie powtarzaj co 10 s - nastepna proba w kolejnym cyklu
            LOG.exception("Blad przeliczania planu: %s", err)
        self.push()
        await self.execute()

    async def execute(self) -> None:
        self._last_exec = datetime.now(timezone.utc)
        try:
            ch_w, sell_w = self.limits()
            if self.manual:
                key = "energia_bateria_ladowanie_dzisiaj" if self.manual.kind == "buy" else "energia_siec_export_dzisiaj"
                self.manual.watch(self.r("bateria_moc"), self.r("siec_moc_suma"))
                if self.manual.progress(self.r(key), self.r("bateria_soc"), self.p, self._price_now(self.manual.kind)):
                    self._finish_manual()
                    if self.enabled:
                        await self.exec.apply(self.plan, self.p, ch_w, sell_w, self.current())
                    else:
                        await self.exec.restore()
                else:
                    mp = self.manual.as_plan(self.p)
                    await self.exec.apply(mp, self.p, ch_w, sell_w, mp[0])
                self.push()
                return
            if self.enabled and self.plan:
                cur = self.current()
                await self.exec.apply(self.plan, self.p, ch_w, sell_w, cur)
                self._check_sell(cur)
        except Exception as err:  # noqa: BLE001
            LOG.exception("Blad wykonania: %s", err)

    async def _pv_calibration(self, now: datetime) -> float:
        """Fakt PV (stara encja 'pv') / prognoza PV z pogody wstecz (rok, archiwum Open-Meteo) -> mnoznik sprawnosci, 0,5-1,5."""
        act = self.learn.pv_act
        wl = self._wx_learn or self._weather
        if not act or not wl:
            return 1.0
        slots = [h + timedelta(minutes=15 * i) for h in act for i in range(4)]
        slots = [s for s in slots if s in wl]
        fc = pv_forecast.forecast(slots, wl, self.p)
        fh: dict = {}
        for s, v in fc.items():
            h = s.replace(minute=0)
            fh[h] = fh.get(h, 0.0) + v
        self.learn.pv_cal_m = learn.pv_month_cal(act, fh)
        self.learn.pv_day = learn.pv_days(act, fh, learn.day_wx(learn.hour_wx(wl)))
        if self.learn.pv_cal_m:
            LOG.info("Kalibracja PV per miesiac: %s", ", ".join(f"{m}: x{v:.2f}" for m, v in sorted(self.learn.pv_cal_m.items())))
        pairs = [(act[h], fh[h]) for h in act if h in fh and (act[h] > 0.02 or fh[h] > 0.02)]
        sa, sf = sum(a for a, _ in pairs), sum(f for _, f in pairs)
        if sf < 5:
            LOG.info("Kalibracja PV: za malo danych (prognoza %.1f kWh) – bez zmian", sf)
            return 1.0
        k = min(1.5, max(0.5, sa / sf))
        LOG.info("Kalibracja PV z %d h: fakt %.1f kWh / prognoza %.1f kWh -> x%.2f", len(pairs), sa, sf, k)
        return k

    def _check_sell(self, cur: dict | None) -> None:
        """Slot sprzedazy z planu: po 3 min sprawdza, czy cos faktycznie idzie do sieci; jesli nie - jeden wpis w logu ze stanem TOU."""
        if not cur or cur.get("action") != "sell":
            return
        t = datetime.fromisoformat(cur["start"])
        if datetime.now(timezone.utc) - t < timedelta(minutes=3) or getattr(self, "_sell_warned", None) == cur["start"]:
            return
        grid = self.r("siec_moc_suma")
        if grid is not None and grid < -50:
            return
        self._sell_warned = cur["start"]
        g = lambda dom, k: (self.hass.states.get(f"{dom}.{self.dev}_{k}") or type("x", (), {"state": "?"})).state  # noqa: E731
        pts = [f"p{i}: start {g('number', f'tou_{i}_start_hhmm')} moc {g('number', f'tou_{i}_moc')} SOC {g('number', f'tou_{i}_soc')} "
               f"sieć {g('switch', f'tou_{i}_ladowanie_z_sieci')} autokons.do {g('number', f'tou_{i}_autokonsumpcja_do')} sprzedaj.do {g('number', f'tou_{i}_sprzedaj_do')}" for i in range(1, 7)]
        LOG.warning("SPRZEDAZ nie idzie: slot %s, siec %s W, bateria %s W, SOC %s%%, tryb eksportu '%s', sprzedaj nadwyzke PV %s, max moc sprzedazy %s W, "
                    "max moc sprzedazy z PV %s W, priorytet '%s', harmonogram %s | %s",
                    cur["start"], grid, self.r("bateria_moc"), self.r("bateria_soc"), g("select", "tryb_limitu_eksportu"), g("switch", "sprzedaj_nadwyzke_pv"),
                    g("number", "limit_twardy_max_moc_sprzedazy"), g("number", "max_moc_sprzedazy_z_pv"), g("select", "priorytet_energii"),
                    g("switch", "harmonogram_tou"), " | ".join(pts))

    def current(self) -> dict | None:
        now = datetime.now(timezone.utc)
        for s in self.plan:
            t = datetime.fromisoformat(s["start"])
            if t <= now < t + timedelta(minutes=15):
                return s
        return None

    # --- akcje z UI ---------------------------------------------------------------------------
    async def set_enabled(self, on: bool) -> None:
        if on == self.enabled:
            return
        self.enabled = on
        LOG.info("ALGORYTM %s", "WLACZONY" if on else "WYLACZONY")
        if on:
            self.guard_warn, self._g_fix, self._g_bad = None, 0, 0
            await self.exec.snapshot()
            await self.replan("wlaczenie algorytmu")
        elif not self.manual:
            await self.exec.restore()
        self.push()

    async def start_manual(self, kind: str) -> None:
        kwh = self.p["kup_wh" if kind == "buy" else "sprzedaj_wh"] / 1000
        if kwh <= 0:
            LOG.warning("Reczne %s: ilosc 0 kWh - pomijam", kind)
            return
        if self.manual:
            self._finish_manual("zastapione")
        elif not self.enabled:
            await self.exec.snapshot()
        key = "energia_bateria_ladowanie_dzisiaj" if kind == "buy" else "energia_siec_export_dzisiaj"
        self.manual = ManualJob(kind, kwh, self.r(key, 0.0))
        self.exec._exp_rej, self.exec._exp_set, self.exec.sell_warn = 0, False, None     # nowe zlecenie = nowa proba sprzedazy
        if self.enabled:
            LOG.info("Algorytm w czuwaniu (standby) do konca recznego zlecenia – reczne ma pierwszenstwo")
        await self.execute()

    async def stop_manual(self) -> None:
        if self.manual:
            LOG.info("Reczne zadanie przerwane przez uzytkownika")
            self._finish_manual("przerwane")
            if self.enabled:
                await self.execute()
            else:
                await self.exec.restore()
            self.push()
