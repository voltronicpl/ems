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
            e["ost"] = {**rec, "o": now.isoformat()}
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
            if not self._hist_at or now - self._hist_at > timedelta(hours=6):
                self._hist = await load_forecast.history(self.hass, f"sensor.{self.dev}_obciazenie_moc_suma")
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
            pv_prev = pv_forecast.forecast(prev, self._weather, self.p)
            pv_now_w = self.r("pv_moc_suma", None)
            fact = pv_forecast.intraday_factor((pv_now_w or 0) / 1000 * 2, sum(pv_prev.values())) if pv_now_w is not None else 1.0
            pvk = pv_forecast.forecast(slots, self._weather, self.p, fact)

            coeff = self.p["wsp_temp"] or load_forecast.temp_coeff(self._hist, self._weather, self.p["weekend_od_godz"])
            ldk = load_forecast.forecast(slots, self._hist, self._weather, self.p, coeff)

            soc = self.r("bateria_soc", 50.0)
            ch_w, sell_w = self.limits()
            LOG.info("SOC %.0f%%, max ladowanie %.0f W, max sprzedaz %.0f W, ceny do %s",
                     soc, ch_w, sell_w, last.astimezone(WAW).strftime("%d.%m %H:%M"))
            res, summ = plan(slots, self._prices, pvk, ldk, self._weather, soc, self.p,
                             self.p["pojemnosc_wh"] / 1000, ch_w, sell_w)
            self.plan = as_dicts(res)
            self._log_forecast(now)
            self.summary = {**summ, "wsp_temp": round(coeff, 3), "korekta_pv": round(fact, 2)}
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
                await self.exec.apply(self.plan, self.p, ch_w, sell_w, self.current())
        except Exception as err:  # noqa: BLE001
            LOG.exception("Blad wykonania: %s", err)

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
