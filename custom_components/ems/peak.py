"""„Pmax zakupu” (menu Tryb pracy na LCD) = Grid Peak Shaving: rejestr 278, bity 5:4 (11 = wlaczony, 10 = wylaczony),
wartosc w 291 [W]. Zaznaczony blokuje sprzedaz (falownik wraca 242 na „Limit wbudowany”).

DECYZJA UZYTKOWNIKA (v0.6.41): zapis dziala tylko 10H (YAML v5.7, przelacznik). EMS (algorytm i reczne):
SPRZEDAZ = ODZNACZONY, wszystko inne (kupno, trzymanie, autokonsumpcja, blokada – pobieramy z sieci) = ZAZNACZONY.
Limit poboru z sieci trzyma falownik wg "Moc szczytowa sieci" (291) – uzytkownik ustawia go recznie w panelu.
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

    # --- v0.6.37: TYLKO ODCZYT (278 nie da sie zapisac przez Modbus) -----------------------------------
    async def ensure(self, act: str, limit_w: float = 0) -> None:
        """Sprzedaz = ODZNACZONY, kazdy inny tryb = ZAZNACZONY (algorytm i reczne). Przez przelacznik z YAML v5.7+ (zapis 10H).
        Zapis ze SPRAWDZENIEM: po zapisie czeka na odczyt ustawien (max 40 s); jesli falownik dalej ma stary stan ->
        druga proba, potem blad w logu + ostrzezenie w Ustawieniach (bez zapisu w kolko)."""
        sw = dev_entity(self.hass, self.dev, "switch", "pmax_zakupu")
        st = self.hass.states.get(sw)
        if st is None or st.state not in ("on", "off"):
            self.status = {"ostrzezenie": None if st is None else f"{sw} = {st.state} – czekam na odczyt rejestru 278"}
            if st is None and act == "sell" and not getattr(self, "_no_sw", False):
                self._no_sw = True
                LOG.warning("Pmax zakupu: brak %s (YAML v5.7+) – nie przestawiam", sw)
            return
        want = "off" if act == "sell" else "on"
        now = time.monotonic()
        w = getattr(self, "_w", None)                          # {want, at, tries}
        if st.state == want:
            if w and w["want"] == want:
                LOG.info("Pmax zakupu POTWIERDZONY: %s (%s) po %.0f s", want, "odznaczony – sprzedaz" if want == "off" else "zaznaczony", now - w["at"])
            self._w = None
            self.status = {"wlaczony": want == "on", "przez_ems": True, "ostrzezenie": None}
            return
        if w and w["want"] == want:
            if now - w["at"] < 40:                             # czekamy na odczyt po zapisie
                return
            if w["tries"] >= 2:
                if not w.get("err"):
                    w["err"] = True
                    msg = f"Falownik nie przyjął Pmax zakupu = {'odznaczony' if want == 'off' else 'zaznaczony'} (2 próby, zapis 10H rejestr 278) – ustaw na LCD"
                    LOG.error("%s", msg)
                    self.status = {"wlaczony": st.state == "on", "przez_ems": True, "ostrzezenie": msg}
                return
        tries = (w["tries"] + 1) if w and w["want"] == want else 1
        await self.hass.services.async_call("switch", f"turn_{want}", {"entity_id": sw}, blocking=True)
        try:                                                    # odczyt ustawien od razu (potwierdzenie)
            await self.hass.services.async_call("esphome", f"{self.dev}_odczytaj_ustawienia", {}, blocking=False)
        except Exception:  # noqa: BLE001
            pass
        self._w = {"want": want, "at": now, "tries": tries}
        LOG.info("ZAPIS %s: %s -> %s (Pmax zakupu %s, proba %d) – sprawdzam po odczycie", sw, st.state, want,
                 "ODZNACZONY – sprzedaz" if want == "off" else "ZAZNACZONY", tries)
        self.status = {"wlaczony": st.state == "on", "przez_ems": True, "ostrzezenie": None}

    async def restore(self) -> None:
        """Nic do przywracania – EMS nie zapisuje 278."""
        return
