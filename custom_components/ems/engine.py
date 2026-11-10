"""Silnik EMS: laczy moduly (ceny, pogoda, PV, zuzycie, plan, wykonanie, reczne) i trzyma stan.

Cykle:
- co 15 min (i po wlaczeniu algorytmu / przycisku "Przelicz"): pobranie danych + nowy plan,
- co 1 min: postep zadania recznego + wykonanie planu na falowniku (gdy algorytm wlaczony).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store

from . import load_forecast, prices, pv_forecast, tariff, weather
from .const import MANUAL, PARAMS
from .diag import get_logger
from .executor import Executor
from .manual import ManualJob
from .sources import Sources
from .planner import as_dicts, plan

LOG = get_logger("silnik")
WAW = ZoneInfo("Europe/Warsaw")
SIGNAL = "ems_update"


class Engine:
    def __init__(self, hass: HomeAssistant, dev: str, entry_id: str) -> None:
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
        self._weather: dict = {}
        self._hist: dict = {}
        self._hist_at: datetime | None = None
        self._busy = False
        self._last_exec: datetime | None = None
        self.manual_log: list[dict] = []             # historia recznych zadan (14 dni)
        self._mstore = Store(hass, 1, f"ems_reczne_{entry_id}")
        self.src = Sources(hass, entry_id)                 # stare encje z HA do nauki
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
        if self._busy:
            return
        if not self.last_plan or now - self.last_plan >= timedelta(minutes=self.p["plan_co_min"]):
            self.hass.async_create_task(self._guard(self.replan(f"co {int(self.p['plan_co_min'])} min")))
        elif not self._last_exec or now - self._last_exec >= timedelta(seconds=self.p["zapis_co_s"]):
            self.hass.async_create_task(self._guard(self.execute()))

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
            if not self._prices or now.astimezone(WAW).minute < 15 or not why.startswith("co "):
                self._prices = await prices.fetch(self.hass, [today, today + timedelta(days=1)])
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
                self._pv_cal = await self._pv_calibration(now)
                self._hist_at = now

            start = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
            last = max((s for s in self._prices), default=start + timedelta(hours=24))
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

            wl = self._wx_learn or self._weather
            base_hist, pump_model = load_forecast.split_pump(self._hist, self._pump, wl)
            coeff = self.p["wsp_temp"] or load_forecast.temp_coeff(base_hist, wl, self.p["weekend_od_godz"])
            ldk = load_forecast.forecast(slots, base_hist, {**wl, **self._weather}, self.p, coeff)
            if pump_model:
                pmp = load_forecast.pump_forecast(slots, self._weather, pump_model)
                ldk = {k: v + pmp.get(k, 0.0) for k, v in ldk.items()}
                LOG.info("Pompa ciepla w prognozie: %.2f kWh w horyzoncie", sum(pmp.values()))

            soc = self.r("bateria_soc", 50.0)
            ch_w, sell_w = self.limits()
            LOG.info("SOC %.0f%%, max ladowanie %.0f W, max sprzedaz %.0f W, ceny do %s",
                     soc, ch_w, sell_w, last.astimezone(WAW).strftime("%d.%m %H:%M"))
            res, summ = plan(slots, self._prices, pvk, ldk, self._weather, soc, self.p,
                             self.p["pojemnosc_wh"] / 1000, ch_w, sell_w)
            self.plan = as_dicts(res)
            self._log_forecast(now)
            self.summary = {**summ, "wsp_temp": round(coeff, 3), "korekta_pv": round(fact, 2), "kalibracja_pv": round(self._pv_cal, 2),
                            "pompa_model": [round(x, 3) for x in pump_model] if pump_model else None}
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
        act = await self.src.hourly("pv", now - timedelta(days=365), now - timedelta(hours=1))
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
