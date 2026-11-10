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
        self.status: dict = {}                  # dla panelu: stan, ostrzezenie
        self._loaded = False

    async def _load(self) -> None:
        if not self._loaded:
            self.saved = (await self.store.async_load() or {}).get("r278")
            self._loaded = True

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

    async def _write(self, v: int, why: str) -> None:
        await self.hass.services.async_call("esphome", f"{self.dev}_raw_write", {"address": REG, "value": v}, blocking=True)
        LOG.info("ZAPIS rejestr %d (Pmax zakupu): %d (0x%04X) – %s", REG, v, v, why)

    def _state(self, v: int | None, err: str | None = None) -> None:
        from datetime import datetime
        self.status = {"r278": f"0x{v:04X}" if v is not None else None, "wlaczony": None if v is None else (v & MASK) == ON,
                       "przez_ems": self.saved is not None, "ostrzezenie": err, "odczyt": datetime.now().isoformat(timespec="seconds")}

    async def _set(self, v: int, why: str) -> bool:
        """Zapis 278 ze sprawdzeniem: odczyt po zapisie, porownanie bitow 5:4, jedna ponowna proba."""
        for attempt in (1, 2):
            await self._write(v, why if attempt == 1 else why + " (ponownie)")
            await asyncio.sleep(1.5)
            got = await self._read()
            if got is not None and (got & MASK) == (v & MASK):
                LOG.info("POTWIERDZONO rejestr %d = 0x%04X (Pmax zakupu %s)", REG, got, "włączony" if (got & MASK) == ON else "wyłączony")
                self._state(got)
                return True
            LOG.warning("Rejestr %d po zapisie: %s (chcialem 0x%04X)", REG, f"0x{got:04X}" if got is not None else "brak odczytu", v)
        self._state(got, "Nie udało się " + ("wyłączyć" if (v & MASK) == OFF else "przywrócić") + " Pmax zakupu – sprawdź na LCD (Tryb pracy)")
        LOG.error("Pmax zakupu: zapis 0x%04X NIE potwierdzony po 2 probach", v)
        return False

    async def off_for_sell(self) -> None:
        """Sprzedaz: wylacz Pmax zakupu (zapamietaj Twoja wartosc). W trakcie sprzedazy co 5 min sprawdza, czy nikt go nie wlaczyl."""
        import time
        await self._load()
        if self.saved is not None or getattr(self, "_off_ok", False):
            if time.monotonic() - getattr(self, "_chk", 0) < 300:
                return
            self._chk = time.monotonic()
            v = await self._read()
            if v is None:
                return
            if (v & MASK) == ON:
                LOG.warning("Pmax zakupu znowu WLACZONY w trakcie sprzedazy (278 = 0x%04X) – wylaczam", v)
                if self.saved is None:
                    self.saved = v
                    await self.store.async_save({"r278": v})
                await self._set((v & ~MASK) | OFF, "sprzedaz: ktos wlaczyl Pmax zakupu")
            else:
                self._state(v)
            return
        self._chk = time.monotonic()
        v = await self._read()
        if v is None:
            self._state(None, "Brak odczytu Pmax zakupu (rejestr 278) – sprzedaż może nie ruszyć")
            return
        if v & MASK != ON:
            LOG.info("Pmax zakupu juz wylaczony (278 = 0x%04X) – nic nie zmieniam", v)
            self._off_ok = True
            self._state(v)
            return
        self.saved = v
        await self.store.async_save({"r278": v})
        await self._set((v & ~MASK) | OFF, "sprzedaz: Pmax zakupu blokuje eksport")

    async def restore(self) -> None:
        """Po sprzedazy: przywroc Twoja wartosc 278 (ze sprawdzeniem)."""
        await self._load()
        self._off_ok = False
        if self.saved is None:
            return
        v = self.saved
        if await self._set(v, "koniec sprzedazy: przywracam Pmax zakupu"):
            self.saved = None
            await self.store.async_save({})
            self._state(v)
        else:
            self.saved = None                       # nie ponawiamy w petli; ostrzezenie zostaje w panelu
            await self.store.async_save({})
