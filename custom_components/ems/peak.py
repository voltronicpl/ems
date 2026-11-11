"""„Pmax zakupu” (menu Tryb pracy na LCD) = Grid Peak Shaving: rejestr 278, bity 5:4 (11 = wlaczony, 10 = wylaczony),
wartosc w 291 [W]. Zaznaczony blokuje sprzedaz (falownik wraca 242 na „Limit wbudowany”).

DECYZJA UZYTKOWNIKA (v0.6.35, zmienia v0.6.15): EMS STERUJE 278 – sprzedaz (algorytm i reczna) = ODZNACZONY,
wszystko inne (ladowanie, autokonsumpcja, trzymanie) = ZAZNACZONY z limitem 291 = `max_pobor_w`. Falownik sam pilnuje
poboru z sieci (EMS nie liczy juz mocy ladowania pod przylacze). Zapis tylko przy zmianie, odczyt kontrolny, 2 proby.
Przy wylaczeniu algorytmu wraca wartosc uzytkownika (Store ems_pmax_zakupu_<entry>).
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
REG, MASK, ON, OFF, REG_W = 278, 0x30, 0x30, 0x20, 291


class PeakShave:
    """Sterowanie Pmax zakupu (278 bity 5:4 + limit 291)."""

    def __init__(self, hass, dev: str, entry_id: str) -> None:
        self.hass, self.dev = hass, dev
        self.store = Store(hass, 1, f"ems_pmax_zakupu_{entry_id}")   # stary zapis z v0.6.11–0.6.14 (tylko do ostrzezenia)
        self.status: dict = {}
        self._chk = 0.0
        self._old_checked = False

    async def _read(self, reg: int = REG) -> int | None:
        """raw_read 278 -> wynik w text_sensorze 'Surowy odczyt' w formacie '278=10298 (0x283A)'.
        HA nie zmienia stanu, gdy tekst jest taki sam jak poprzednio, wiec patrzymy tez na last_reported
        i po 2 s akceptujemy aktualny tekst, jesli dotyczy rejestru 278."""
        sid = dev_entity(self.hass, self.dev, "sensor", "surowy_odczyt")
        before = self.hass.states.get(sid)
        mark = (before.last_updated, getattr(before, "last_reported", None)) if before else None
        await self.hass.services.async_call("esphome", f"{self.dev}_raw_read", {"address": reg}, blocking=True)
        for i in range(40):                                   # max 10 s
            await asyncio.sleep(0.25)
            st = self.hass.states.get(sid)
            if not st:
                continue
            fresh = (st.last_updated, getattr(st, "last_reported", None)) != mark or i >= 8
            m = re.match(rf"\s*{reg}\s*=\s*(\d+)", st.state or "")
            if fresh and m:
                return int(m.group(1))
        LOG.warning("Pmax zakupu: brak odczytu rejestru %d (sensor %s = '%s')", reg, sid, self.hass.states.get(sid).state if self.hass.states.get(sid) else "?")
        return None

    def _state(self, v: int | None, err: str | None = None) -> None:
        self.status = {"r278": f"0x{v:04X}" if v is not None else None, "wlaczony": None if v is None else (v & MASK) == ON,
                       "przez_ems": False, "ostrzezenie": err, "odczyt": datetime.now().isoformat(timespec="seconds")}

    async def _old_note_unused(self) -> None:
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

    # --- v0.6.35: sterowanie ------------------------------------------------------------------------
    async def _write(self, reg: int, val: int) -> None:
        await self.hass.services.async_call("esphome", f"{self.dev}_raw_write", {"address": reg, "value": int(val)}, blocking=True)
        LOG.info("ZAPIS rejestr %d = %d (0x%04X) – Pmax zakupu", reg, val, val)

    async def ensure(self, on: bool, limit_w: float) -> None:
        """Zaznacz (on) / odznacz Pmax zakupu; przy zaznaczeniu limit 291 = limit_w. Tylko przy zmianie stanu (pamiec + odczyt)."""
        want = (on, int(limit_w) if on else None)
        if getattr(self, "_want", None) == want and not (self.status or {}).get("ostrzezenie"):
            return
        if not getattr(self, "_saved", None):                     # Twoja wartosc przed EMS (raz)
            old = await self.store.async_load() or {}
            if "r278" not in old:
                v0 = await self._read()
                if v0 is not None:
                    old = {"r278": v0, "r291": await self._read(REG_W)}
                    await self.store.async_save(old)
            self._saved = old
        sw = dev_entity(self.hass, self.dev, "switch", "pmax_zakupu")
        nm = dev_entity(self.hass, self.dev, "number", "moc_szczytowa_sieci")
        if self.hass.states.get(sw) is not None:                   # YAML v5.6: przelacznik (278 bit 4) – zapis jak inne ustawienia
            if on and limit_w and self.hass.states.get(nm) is not None:
                try:
                    if abs(float(self.hass.states.get(nm).state) - limit_w) > 50:
                        await self.hass.services.async_call("number", "set_value", {"entity_id": nm, "value": int(limit_w)}, blocking=True)
                        LOG.info("ZAPIS %s -> %d W (limit Pmax zakupu)", nm, int(limit_w))
                except ValueError:
                    pass
            cur = self.hass.states.get(sw).state
            if cur != ("on" if on else "off"):
                await self.hass.services.async_call("switch", f"turn_{'on' if on else 'off'}", {"entity_id": sw}, blocking=True)
                LOG.info("ZAPIS %s: %s -> %s (Pmax zakupu %s)", sw, cur, "on" if on else "off", "kupno / limit" if on else "sprzedaz")
            self._want = want
            self.status = {"wlaczony": on, "przez_ems": True, "ostrzezenie": None, "encja": sw, "odczyt": datetime.now().isoformat(timespec="seconds")}
            return
        for attempt in (1, 2):
            v = await self._read()
            if v is None:
                self._state(None, "Brak odczytu Pmax zakupu (rejestr 278)")
                return
            if on and limit_w:
                lw = await self._read(REG_W)
                if lw is not None and abs(lw - int(limit_w)) > 50:
                    await self._write(REG_W, int(limit_w))
            nv = (v & ~MASK) | (ON if on else OFF)
            if nv != v:
                await self._write(REG, nv)
                await asyncio.sleep(1.5)
                chk = await self._read()
                if chk is None or (chk & MASK) != (nv & MASK):
                    LOG.warning("Pmax zakupu: falownik nie przyjal zapisu (proba %d, odczyt %s)", attempt, chk)
                    continue
                v = chk
            self._want = want
            self._state(v)
            self.status["przez_ems"] = True
            LOG.info("Pmax zakupu %s%s (278 = 0x%04X)", "ZAZNACZONY" if on else "ODZNACZONY (sprzedaz)", f", limit {int(limit_w)} W" if on else "", v)
            return
        self._state(None, f"Nie udało się {'zaznaczyć' if on else 'odznaczyć'} Pmax zakupu (rejestr 278) – sprawdź na LCD")
        LOG.error("%s", self.status["ostrzezenie"])

    async def restore(self) -> None:
        """Wylaczenie algorytmu: Twoja wartosc 278 / 291 sprzed EMS."""
        old = await self.store.async_load() or {}
        if "r278" not in old:
            return
        cur = await self._read()
        if cur is not None and (cur & MASK) != (old["r278"] & MASK):
            await self._write(REG, (cur & ~MASK) | (old["r278"] & MASK))
        if old.get("r291") is not None:
            await self._write(REG_W, old["r291"])
        LOG.info("Pmax zakupu przywrocony (278 bity 5:4 = %s)", "11" if (old["r278"] & MASK) == ON else "10")
        await self.store.async_save({})
        self._saved, self._want = None, None
