"""„Pmax zakupu” (menu Tryb pracy na LCD) = Grid Peak Shaving: rejestr 278, bity 5:4 (11 = wlaczony, 10 = wylaczony),
wartosc w 291 [W]. Zaznaczony blokuje sprzedaz (falownik wraca 242 na „Limit wbudowany”).

DECYZJA UZYTKOWNIKA (v0.6.15): EMS NIGDY tego nie zapisuje – ani algorytm, ani reczne zlecenia. Tylko sprawdza (raw_read)
i ostrzega w logu i panelu, gdy przy sprzedazy Pmax zakupu jest wlaczony (trzeba go wylaczyc na LCD).
"""
from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime

from homeassistant.helpers.storage import Store

from .diag import get_logger
from .verify import dev_entity

LOG = get_logger("wykonanie")
REG, MASK, ON = 278, 0x30, 0x30


class PeakShave:
    """Tylko odczyt rejestru 278 – bez zapisu."""

    def __init__(self, hass, dev: str, entry_id: str) -> None:
        self.hass, self.dev = hass, dev
        self.store = Store(hass, 1, f"ems_pmax_zakupu_{entry_id}")   # stary zapis z v0.6.11–0.6.14 (tylko do ostrzezenia)
        self.status: dict = {}
        self._chk = 0.0
        self._old_checked = False

    async def _read(self) -> int | None:
        """raw_read 278 -> wynik w text_sensorze 'Surowy odczyt' w formacie '278=10298 (0x283A)'.
        HA nie zmienia stanu, gdy tekst jest taki sam jak poprzednio, wiec patrzymy tez na last_reported
        i po 2 s akceptujemy aktualny tekst, jesli dotyczy rejestru 278."""
        sid = dev_entity(self.hass, self.dev, "sensor", "surowy_odczyt")
        before = self.hass.states.get(sid)
        mark = (before.last_updated, getattr(before, "last_reported", None)) if before else None
        await self.hass.services.async_call("esphome", f"{self.dev}_raw_read", {"address": REG}, blocking=True)
        for i in range(40):                                   # max 10 s
            await asyncio.sleep(0.25)
            st = self.hass.states.get(sid)
            if not st:
                continue
            fresh = (st.last_updated, getattr(st, "last_reported", None)) != mark or i >= 8
            m = re.match(rf"\s*{REG}\s*=\s*(\d+)", st.state or "")
            if fresh and m:
                return int(m.group(1))
        LOG.warning("Pmax zakupu: brak odczytu rejestru %d (sensor %s = '%s')", REG, sid, self.hass.states.get(sid).state if self.hass.states.get(sid) else "?")
        return None

    def _state(self, v: int | None, err: str | None = None) -> None:
        self.status = {"r278": f"0x{v:04X}" if v is not None else None, "wlaczony": None if v is None else (v & MASK) == ON,
                       "przez_ems": False, "ostrzezenie": err, "odczyt": datetime.now().isoformat(timespec="seconds")}

    async def _old_note(self) -> None:
        """Jesli EMS 0.6.11–0.6.14 kiedys zmienil 278 i nie przywrocil – tylko informacja w logu (bez zapisu)."""
        if self._old_checked:
            return
        self._old_checked = True
        old = (await self.store.async_load() or {}).get("r278")
        if old is not None:
            LOG.warning("Uwaga: wczesniejsza wersja EMS zmienila Pmax zakupu (Twoja wartosc 278 byla 0x%04X). EMS juz tego NIE zapisuje – sprawdz na LCD.", old)
            await self.store.async_save({})

    async def check_for_sell(self) -> None:
        """Sprzedaz: sprawdz (co 5 min), czy Pmax zakupu nie blokuje eksportu. Bez zapisu."""
        await self._old_note()
        if time.monotonic() - self._chk < 300:
            return
        self._chk = time.monotonic()
        v = await self._read()
        if v is None:
            self._state(None, "Brak odczytu Pmax zakupu (rejestr 278) – nie wiem, czy blokuje sprzedaż")
            return
        LOG.info("Sprawdzenie Pmax zakupu: 278 = 0x%04X -> %s", v, "WLACZONY" if (v & MASK) == ON else "wylaczony")
        if (v & MASK) == ON:
            msg = "Pmax zakupu jest WŁĄCZONY – blokuje sprzedaż. Wyłącz go na LCD (Tryb pracy); EMS go nie zmienia."
            if not (self.status or {}).get("wlaczony"):
                LOG.warning("%s (278 = 0x%04X)", msg, v)
            self._state(v, msg)
        else:
            self._state(v)

    def idle(self) -> None:
        """Poza sprzedaza: nastepna sprzedaz sprawdzi od razu."""
        self._chk = 0.0
