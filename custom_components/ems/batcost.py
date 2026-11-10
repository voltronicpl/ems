"""Koszt energii w baterii (sredni zl/kWh, wazony zrodlem ladowania) – co 10 s z mocy dataloggera.

- ladowanie: z PV (nadwyzka PV ponad dom) = 0 zl, reszta z sieci po cenie G12 tej chwili (tania / droga),
- rozladowanie: zapas maleje proporcjonalnie (srednia i udzialy PV / tania / droga sie nie zmieniaja),
- zapas w kWh trzymany rowno z SOC x pojemnosc (korekta proporcjonalna),
- zapis w Store co 5 min (przezywa restart).
Uzycie: planner nie sprzedaje energii z baterii ponizej progu z kosztu (poza progiem „drogo” i nadwyzka PV).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from homeassistant.helpers.storage import Store

from .diag import get_logger
from .tariff import buy_price, is_cheap

LOG = get_logger("bateria")


class BatCost:
    def __init__(self, hass, entry_id: str) -> None:
        self.hass = hass
        self.store = Store(hass, 1, f"ems_koszt_baterii_{entry_id}")
        self.d = {"pv": 0.0, "tanio": 0.0, "drogo": 0.0, "zl": 0.0}   # kWh wg zrodla + koszt zl
        self._t = None
        self._saved = 0.0

    async def load(self) -> None:
        self.d.update(await self.store.async_load() or {})

    @property
    def kwh(self) -> float:
        return self.d["pv"] + self.d["tanio"] + self.d["drogo"]

    def avg(self) -> float | None:
        return self.d["zl"] / self.kwh if self.kwh > 0.05 else None

    def info(self) -> dict:
        k = self.kwh
        sh = {x: round(self.d[x] / k * 100) if k > 0.05 else 0 for x in ("pv", "tanio", "drogo")}
        a = self.avg()
        return {"zl_kwh": round(a, 3) if a is not None else None, "kwh": round(k, 2), "udzial": sh}

    def tick(self, soc: float | None, cap_kwh: float, bat_w: float | None, pv_w: float, load_w: float, eff_c: float) -> None:
        now = time.monotonic()
        dt = (now - self._t) / 3600 if self._t else 0.0
        self._t = now
        if soc is None or dt <= 0 or dt > 0.1:
            return
        if bat_w is not None and bat_w < -20:              # bateria_moc: + rozladowanie, - ladowanie
            ch = -bat_w / 1000 * dt                          # kWh AC do baterii
            pv_part = min(ch, max(0.0, (pv_w - load_w) / 1000 * dt))
            grid = ch - pv_part
            ts = datetime.now(timezone.utc)
            cheap = is_cheap(ts)
            self.d["pv"] += pv_part * eff_c
            self.d["tanio" if cheap else "drogo"] += grid * eff_c
            self.d["zl"] += grid * buy_price(ts)
        target = max(0.0, soc / 100 * cap_kwh)
        k = self.kwh
        if k > 0.001 and abs(target - k) > 0.001 and (target < k or bat_w is None or bat_w >= -20):
            f = target / k                                   # rozladowanie / korekta do SOC – proporcjonalnie
            for x in ("pv", "tanio", "drogo", "zl"):
                self.d[x] *= f
        elif k <= 0.001 and target > 0:
            self.d["tanio"] = target                         # start bez historii: zakladamy tania G12
            self.d["zl"] = target * buy_price(datetime.now(timezone.utc).replace(hour=2))
        if now - self._saved > 300:
            self._saved = now
            self.hass.async_create_task(self.store.async_save(self.d))
