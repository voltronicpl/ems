"""Wykonanie planu na falowniku przez encje dataloggera ESPHome.

- plan (sloty 15 min) -> max 6 punktow harmonogramu TOU (falownik ma tylko 6) na najblizsze 24 h,
- w kazdym punkcie: start, moc, SOC, "Z sieci", "Autokonsumpcja do" (901-906) i "Sprzedaj do" (913-918) - wariant A:
  ladowanie: Z sieci ON, autokonsumpcja do = cel, sprzedaj do 100;  sprzedaz: Z sieci OFF, autokonsumpcja/sprzedaj do = rezerwa;
  autokonsumpcja: Z sieci OFF, autokonsumpcja do = dolny limit (bateria trzyma limit, dom z sieci), sprzedaj do 100,
- globalnie: harmonogram wlaczony, ladowanie z sieci dozwolone, tryb limitu eksportu wg biezacego slotu,
- zapisuje TYLKO roznice (kazdy zapis w logu),
- NIGDY nie rusza limitow twardych (number.<dev>_limit_twardy_*),
- snapshot: przy wlaczeniu algorytmu zapamietuje Twoje ustawienia, przy wylaczeniu je przywraca.
"""
from __future__ import annotations

import time

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .diag import get_logger
from .peak import PeakShave

LOG = get_logger("wykonanie")
WAW = ZoneInfo("Europe/Warsaw")
EXPORT_ON, EXPORT_OFF = "Sprzedaz wlaczona", "Limit wbudowany"


class Executor:
    def __init__(self, hass: HomeAssistant, dev: str, entry_id: str) -> None:
        self.hass, self.dev = hass, dev
        self.store = Store(hass, 1, f"ems_snapshot_{entry_id}")
        self.last_points: list | None = None
        self.last_write: datetime | None = None       # ostatni zapis EMS do TOU
        self._pmax_saved: float | None = None          # Twoja wartosc "Pmax sprzedazy" sprzed slotu sprzedazy
        self._exp_rej = 0                                # ile razy falownik sam cofnal tryb sprzedazy w biezacej sprzedazy
        self._exp_set = False
        self.sell_warn: str | None = None
        self.peak = PeakShave(hass, dev, entry_id)      # "Pmax zakupu" (Grid Peak Shaving) – sprzedaz odznaczony, reszta zaznaczony

    # --- encje -------------------------------------------------------------------------------
    def eid(self, dom: str, key: str) -> str:
        return f"{dom}.{self.dev}_{key}"

    def tou_entities(self) -> list[str]:
        out = []
        for p in range(1, 7):
            out += [self.eid("number", f"tou_{p}_start_hhmm"), self.eid("number", f"tou_{p}_moc"),
                    self.eid("number", f"tou_{p}_soc"), self.eid("switch", f"tou_{p}_ladowanie_z_sieci"),
                    self.eid("number", f"tou_{p}_autokonsumpcja_do"), self.eid("number", f"tou_{p}_sprzedaj_do")]
        return out + [self.eid("switch", "harmonogram_tou"), self.eid("switch", "ladowanie_z_sieci_dozwolone"),
                      self.eid("select", "tryb_limitu_eksportu"), self.eid("switch", "sprzedaj_nadwyzke_pv"),
                      self.eid("select", "priorytet_energii")]

    def _opt(self, entity: str, *keys: str) -> str | None:
        st = self.hass.states.get(entity)
        opts = (st.attributes.get("options") if st else None) or []
        norm = lambda x: x.lower().translate(str.maketrans("ąćęłńóśźż", "acelnoszz")).replace(" ", "")  # noqa: E731
        return next((o for o in opts if all(k in norm(o) for k in keys)), None)

    def export_option(self, want: str) -> str | None:
        """Nazwa opcji trybu eksportu taka, jaka jest w ESPHome (bez polskich znakow / wielkosci liter); None + blad w logu, gdy brak."""
        st = self.hass.states.get(self.eid("select", "tryb_limitu_eksportu"))
        opts = (st.attributes.get("options") if st else None) or []
        norm = lambda x: x.lower().translate(str.maketrans("ąćęłńóśźż", "acelnoszz")).replace(" ", "")  # noqa: E731
        hit = next((o for o in opts if norm(o) == norm(want)), None)
        if hit is None and want == EXPORT_ON:
            hit = next((o for o in opts if "sprzeda" in norm(o) or "sell" in norm(o)), None)
        if hit is None and want == EXPORT_OFF:
            hit = next((o for o in opts if "wbudow" in norm(o) or "zero" in norm(o)), None)
        if hit is None and getattr(self, "_opt_warned", None) != want:
            self._opt_warned = want
            LOG.error("Tryb limitu eksportu: brak opcji '%s' w falowniku – dostepne: %s", want, opts or "(brak encji)")
        return hit

    def val(self, entity: str):
        st = self.hass.states.get(entity)
        return None if st is None or st.state in ("unknown", "unavailable") else st.state

    async def set(self, entity: str, value, why: str) -> None:
        if "limit_twardy" in entity:
            LOG.error("ODMOWA zapisu limitu twardego %s", entity)
            return
        cur = self.val(entity)
        dom = entity.split(".")[0]
        force = getattr(self, "force", False) and ("tou_" in entity or "harmonogram" in entity or "ladowanie_z_sieci" in entity)
        if dom == "number":
            if cur is not None and abs(float(cur) - float(value)) < 0.5 and not force:
                return
            await self.hass.services.async_call("number", "set_value", {"entity_id": entity, "value": value}, blocking=True)
        elif dom == "switch":
            want = "on" if value else "off"
            if cur == want and not force:
                return
            await self.hass.services.async_call("switch", f"turn_{want}", {"entity_id": entity}, blocking=True)
        elif dom == "select":
            if cur == value:
                return
            await self.hass.services.async_call("select", "select_option", {"entity_id": entity, "option": value}, blocking=True)
        LOG.info("ZAPIS %s: %s -> %s (%s)", entity.split(".", 1)[1], cur, value, why)
        if "tou_" in entity or "harmonogram" in entity:
            self.last_write = datetime.now(WAW)

    # --- snapshot Twoich ustawien ---------------------------------------------------------------
    async def snapshot(self) -> None:
        data = {e: self.val(e) for e in self.tou_entities()}
        await self.store.async_save(data)
        LOG.info("Snapshot ustawien uzytkownika zapisany (%d encji)", len(data))

    async def restore(self) -> None:
        data = await self.store.async_load()
        if not data:
            LOG.warning("Brak snapshotu - nic do przywrocenia")
            return
        LOG.info("Przywracam ustawienia uzytkownika ze snapshotu")
        for e, v in data.items():
            if v is None:
                continue
            dom = e.split(".")[0]
            await self.set(e, v == "on" if dom == "switch" else (float(v) if dom == "number" else v), "przywrocenie")
        self.last_points = None
        try:
            await self.peak.restore()
        except Exception as err:  # noqa: BLE001
            LOG.warning("Pmax zakupu: przywrocenie nie wyszlo (%s)", err)

    # --- plan -> punkty TOU ------------------------------------------------------------------------
    @staticmethod
    def mode(slot: dict, p: dict, max_charge_w: float, max_sell_w: float) -> tuple:
        """(nazwa, Z sieci, SOC, moc W, autokonsumpcja do %, sprzedaj do %)"""
        res = round(slot["reserve"])
        if slot["action"] == "charge":
            tgt = round(p["soc_max"])
            w = max_charge_w
            if not slot.get("manual") and slot.get("grid_kwh"):          # algorytm: moc z planu (lagodne 0,2C), w krokach 500 W
                w = min(max_charge_w, max(500.0, -(-slot["grid_kwh"] * 4000 // 500) * 500))
            return ("charge", True, tgt, int(w // 100 * 100), tgt, min(tgt + 1, 100))     # jak LCD: sprzedaj do = cel + 1
        if slot["action"] == "sell":
            # jak sprzedaz wyklikana na falowniku (zrzut 10.11): Z sieci ON, autokonsumpcja do = rezerwa,
            # sprzedaj do = SOC punktu = rezerwa + 1 (musi byc co najmniej 1 % wyzej niz autokonsumpcja)
            auto = min(res, 99)
            return ("sell", True, auto + 1, int(max_sell_w // 100 * 100), auto, auto + 1)
        if slot["action"] == "hold":                                     # tania strefa: bateria trzyma (SOC punktu = soc_max), dom z sieci
            smax = round(p["soc_max"])
            return ("hold", False, smax, int(max_sell_w // 100 * 100), smax, 100)
        return (slot["action"], False, res, int(max_sell_w // 100 * 100), res, 100)

    def points(self, plan: list[dict], p: dict, max_charge_w: float, max_sell_w: float) -> list[tuple]:
        now = datetime.now(WAW)
        horizon = now + timedelta(hours=24)
        segs, hi = [], []
        for s in plan:
            t = datetime.fromisoformat(s["start"]).astimezone(WAW)
            if t + timedelta(minutes=15) <= now or t >= horizon:
                continue
            m = self.mode(s, p, max_charge_w, max_sell_w)
            t = max(t, now.replace(second=0, microsecond=0) - timedelta(minutes=now.minute % 15))
            if segs and segs[-1][1] == m:
                if m[0] == "charge" and not s.get("manual"):
                    hi[-1] = max(hi[-1], s.get("soc") or 0)
                continue
            segs.append((t, m))
            hi.append(s.get("soc") or 0 if m[0] == "charge" and not s.get("manual") else 0)
        if not segs:
            return []
        # ladowanie algorytmu: SOC punktu = cel z planu (max SOC w bloku, w gore do 1 %), nie soc_max – inaczej po scaleniu ladowalby do pelna
        segs = [(t, (m[:2] + (min(int(-(-h // 1)), m[2]),) + m[3:4] + (min(int(-(-h // 1)), m[4]), min(int(-(-h // 1)) + 1, 100))) if h and m[0] == "charge" else m)
                for (t, m), h in zip(segs, hi)]
        if len(segs) > 1 and segs[-1][1] == segs[0][1]:   # doba w kolko: ostatni punkt = pierwszy -> jeden punkt
            segs.pop(0)
        # sasiednie ladowania (inna moc / SOC) -> jeden punkt (moc pierwszego, SOC najwyzszy)
        i = 1
        while i < len(segs):
            if segs[i][1][0] == "charge" == segs[i - 1][1][0]:
                m0, m1 = segs[i - 1][1], segs[i][1]
                segs[i - 1] = (segs[i - 1][0], m0[:2] + (max(m0[2], m1[2]),) + m0[3:4] + (max(m0[4], m1[4]), max(m0[5], m1[5])))
                del segs[i]
                continue
            i += 1
        soft = lambda k: segs[k][1][0] not in ("charge", "sell")   # noqa: E731
        end = segs[0][0] + timedelta(days=1)
        ln = lambda k: (segs[k + 1][0] if k + 1 < len(segs) else end) - segs[k][0]   # noqa: E731

        def drop(k: int) -> bool:
            """Usun miekki punkt k BEZ wydluzania ladowania / sprzedazy: do poprzedniego miekkiego albo nastepny miekki przejmuje start."""
            if k > 0 and soft(k - 1):
                del segs[k]
            elif k + 1 < len(segs) and soft(k + 1):
                segs[k + 1] = (segs[k][0], segs[k + 1][1])
                del segs[k]
            else:
                return False
            return True

        # punkty miekkie krotsze niz `tou_min_blok_min` – tylko gdy sasiad tez miekki (NIGDY nie wydluzamy ladowania / sprzedazy)
        mn = timedelta(minutes=p.get("tou_min_blok_min", 60))
        i = 1
        while i < len(segs):
            if soft(i) and i + 1 < len(segs) and ln(i) < mn and drop(i):
                continue
            i += 1
        while len(segs) > 6:                   # falownik ma 6 punktow: najpierw najkrotsze miekkie (bez wydluzania twardych)
            cand = sorted((ln(k), k) for k in range(1, len(segs)) if soft(k) and ((soft(k - 1)) or (k + 1 < len(segs) and soft(k + 1))))
            if cand and drop(cand[0][1]):
                continue
            LOG.debug("Plan ma %d punktow w 24 h – reszta doby jako autokonsumpcja", len(segs))
            segs = segs[:5] + [(segs[5][0], ("self", False, round(p["soc_min"]), int(max_sell_w // 100 * 100), round(p["soc_min"]), 100))]
        # bezpiecznik: ostatni punkt doby nie moze byc ladowaniem / sprzedaza ciagnietym do pierwszego punktu
        while len(segs) < 6:                   # dopelnij: podziel najdluzszy segment na pol
            gaps = [((segs[(i + 1) % len(segs)][0] if i + 1 < len(segs) else segs[0][0] + timedelta(days=1)) - segs[i][0], i)
                    for i in range(len(segs))]
            d, i = max(gaps)
            segs.insert(i + 1, (segs[i][0] + d / 2, segs[i][1]))
        pts = sorted(((t.hour * 100 + (t.minute // 5) * 5, m) for t, m in segs), key=lambda x: x[0])
        return pts

    def _grid_cap(self, p: dict) -> float | None:
        """Max pobor z sieci: moc ladowania baterii = limit - aktualny dom - 300 W zapasu (straty), w krokach 500 W.
        Zmiana dopiero o >= 500 W i nie czesciej niz co 60 s (falownik zapisywany tylko przy zmianie)."""
        lim = float(p.get("max_pobor_w", 10000) or 0)
        dom = self.val(self.eid("sensor", "obciazenie_moc_suma"))
        if lim <= 0 or dom is None:
            return getattr(self, "_cap_w", None)
        new = max(0.0, (lim - float(dom) - 300) // 500 * 500)
        old, at = getattr(self, "_cap_w", None), getattr(self, "_cap_at", 0.0)
        now = time.monotonic()
        if old is None or (abs(new - old) >= 500 and now - at >= 60):
            if old is not None:
                LOG.info("Max pobór z sieci %d W: dom %d W -> moc ładowania baterii %d W (było %d W)", lim, float(dom), new, old)
            self._cap_w, self._cap_at = new, now
        return self._cap_w

    async def apply(self, plan: list[dict], p: dict, max_charge_w: float, max_sell_w: float, current: dict | None) -> None:
        pts = self.points(plan, p, max_charge_w, max_sell_w)
        if not pts:
            LOG.warning("Brak planu na najblizsze 24 h - nic nie zapisuje")
            return
        if pts != self.last_points:
            LOG.info("Nowe punkty TOU: %s", ", ".join(f"{h:04d} {m[0]} SOC{m[2]} {m[3]}W sieć:{'ON' if m[1] else 'OFF'} autokons.do{m[4]} sprzedaj.do{m[5]}" for h, m in pts))
        for i, (hhmm, (name, grid, soc, w, auto, sell)) in enumerate(pts, start=1):
            await self.set(self.eid("number", f"tou_{i}_start_hhmm"), hhmm, f"punkt {i} {name}")
            await self.set(self.eid("number", f"tou_{i}_moc"), w, f"punkt {i} {name}")
            await self.set(self.eid("number", f"tou_{i}_soc"), soc, f"punkt {i} {name}")
            await self.set(self.eid("switch", f"tou_{i}_ladowanie_z_sieci"), grid, f"punkt {i} {name}")
            await self.set(self.eid("number", f"tou_{i}_autokonsumpcja_do"), auto, f"punkt {i} {name}")
            await self.set(self.eid("number", f"tou_{i}_sprzedaj_do"), sell, f"punkt {i} {name}")
        await self.set(self.eid("switch", "harmonogram_tou"), True, "EMS")
        if getattr(self, "force", False):
            LOG.warning("[straznik] wymuszony pelny zapis TOU (wszystkie punkty)")
            self.force = False
        await self.set(self.eid("switch", "ladowanie_z_sieci_dozwolone"), True, "EMS")
        act = (current or {}).get("action", "self")
        pmax = self.eid("number", "max_moc_sprzedazy_z_pv")   # w panelu "Pmax sprzedazy (eksport)" – ogranicza CALY eksport (Deye "Max Sell Power")
        try:                                                # Pmax zakupu: sprzedaz = odznaczony, reszta = zaznaczony z limitem przylacza (falownik pilnuje poboru)
            await self.peak.ensure(act != "sell", float(p.get("max_pobor_w", 10000) or 0))
        except Exception as err:  # noqa: BLE001
            LOG.warning("Pmax zakupu: blad (%s)", err)
        if act == "sell":                                   # glowny wlacznik eksportu (jak "Solar Sell" w Deye) – bez niego nic nie idzie do sieci
            await self.set(self.eid("switch", "sprzedaj_nadwyzke_pv"), True, "sprzedaz: eksport musi byc wlaczony")
            if self._pmax_saved is None:
                cur = self.val(pmax)
                self._pmax_saved = float(cur) if cur is not None else None
            await self.set(pmax, int(max_sell_w // 100 * 100), "sprzedaz: Pmax eksportu = moc sprzedazy")
        elif self._pmax_saved is not None:
            await self.set(pmax, self._pmax_saved, "koniec sprzedazy: przywracam Twoja wartosc")
            self._pmax_saved = None
        # priorytet energii: zawsze "Najpierw bateria" (decyzja uzytkownika)
        pr = self._opt(self.eid("select", "priorytet_energii"), "bater")
        if pr:
            await self.set(self.eid("select", "priorytet_energii"), pr, "EMS: najpierw bateria")
        mode_e = self.eid("select", "tryb_limitu_eksportu")
        opt = self.export_option(EXPORT_ON if act == "sell" else EXPORT_OFF)
        if act != "sell":
            self._exp_rej, self._exp_set, self.sell_warn = 0, False, None
        elif self._exp_set and self.val(mode_e) != opt:
            self._exp_rej += 1                                  # zapisalismy "sprzedaz", a falownik sam wrocil
            LOG.warning("Falownik sam cofnal tryb eksportu na '%s' (%d. raz w tej sprzedazy)", self.val(mode_e), self._exp_rej)
        if act == "sell" and self._exp_rej >= 2:
            if not self.sell_warn:
                self.sell_warn = "Falownik odrzuca sprzedaż (sam wraca na „Limit wbudowany”). EMS przestał go przestawiać – sprawdź na LCD Tryb pracy (Pmax zakupu i inne blokady)."
                LOG.error("%s", self.sell_warn)
        elif opt:
            await self.set(mode_e, opt, f"biezacy slot: {act}")
            self._exp_set = act == "sell"
        self.last_points = pts
