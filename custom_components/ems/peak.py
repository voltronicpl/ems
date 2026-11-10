"""„Pmax zakupu” (menu Tryb pracy na LCD) = Grid Peak Shaving: rejestr 278, bity 5:4 (11 = wlaczony, 10 = wylaczony),
wartosc w 291 [W]. Zaznaczony blokuje sprzedaz (falownik wraca 242 na „Limit wbudowany”).

EMS na czas sprzedazy (recznej i z planu) wylacza checkbox, po sprzedazy przywraca Twoja wartosc rejestru 278.
Nie ma osobnej encji w ESPHome – odczyt/zapis przez akcje dataloggera raw_read / raw_write (wynik w sensor.<dev>_surowy_odczyt).
Twoja wartosc 278 jest zapisywana na dysk (Store), wiec przezywa restart HA w trakcie sprzedazy.
"""
from __future__ import annotations

import asyncio
import re

from homeassistant.helpers.storage import Store

from .diag import get_logger
from .verify import dev_entity

LOG = get_logger("wykonanie")
REG, MASK, ON, OFF = 278, 0x30, 0x30, 0x20


class PeakShave:
    def __init__(self, hass, dev: str, entry_id: str) -> None:
        self.hass, self.dev = hass, dev
        self.store = Store(hass, 1, f"ems_pmax_zakupu_{entry_id}")
        self.saved: int | None = None          # Twoja wartosc 278 sprzed wylaczenia (None = nic nie zmienialismy)
        self._loaded = False

    async def _load(self) -> None:
        if not self._loaded:
            self.saved = (await self.store.async_load() or {}).get("r278")
            self._loaded = True

    async def _read(self) -> int | None:
        sid = dev_entity(self.hass, self.dev, "sensor", "surowy_odczyt")
        before = self.hass.states.get(sid)
        t0 = before.last_updated if before else None
        await self.hass.services.async_call("esphome", f"{self.dev}_raw_read", {"address": REG}, blocking=True)
        for _ in range(40):                                   # max 10 s
            await asyncio.sleep(0.25)
            st = self.hass.states.get(sid)
            if st and st.last_updated != t0 and st.state not in ("unknown", "unavailable", ""):
                txt = st.state
                m = re.search(r"=\s*(0x[0-9a-fA-F]+|\d+)", txt) or re.search(r"(0x[0-9a-fA-F]+|\d+)\s*$", txt)
                if m and (str(REG) in txt or "=" not in txt):
                    return int(m.group(1), 0)
                if m:
                    return int(m.group(1), 0)
        LOG.warning("Pmax zakupu: brak odczytu rejestru %d (sensor %s)", REG, sid)
        return None

    async def _write(self, v: int, why: str) -> None:
        await self.hass.services.async_call("esphome", f"{self.dev}_raw_write", {"address": REG, "value": v}, blocking=True)
        LOG.info("ZAPIS rejestr %d (Pmax zakupu): %d (0x%04X) – %s", REG, v, v, why)

    async def off_for_sell(self) -> None:
        """Sprzedaz: wylacz Pmax zakupu (zapamietaj Twoja wartosc)."""
        await self._load()
        if self.saved is not None:
            return                                            # juz wylaczone przez EMS
        v = await self._read()
        if v is None:
            return
        if v & MASK != ON:
            LOG.info("Pmax zakupu juz wylaczony (278 = 0x%04X) – nic nie zmieniam", v)
            return
        self.saved = v
        await self.store.async_save({"r278": v})
        await self._write((v & ~MASK) | OFF, "sprzedaz: Pmax zakupu blokuje eksport")

    async def restore(self) -> None:
        """Po sprzedazy: przywroc Twoja wartosc 278."""
        await self._load()
        if self.saved is None:
            return
        v, self.saved = self.saved, None
        await self._write(v, "koniec sprzedazy: przywracam Pmax zakupu")
        await self.store.async_save({})
