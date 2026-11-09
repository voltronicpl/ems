"""Wykonanie planu na falowniku przez encje dataloggera ESPHome.

- plan (sloty 15 min) -> max 6 punktow harmonogramu TOU (falownik ma tylko 6) na najblizsze 24 h,
- globalnie: harmonogram wlaczony, ladowanie z sieci dozwolone, tryb limitu eksportu wg biezacego slotu,
- zapisuje TYLKO roznice (kazdy zapis w logu),
- NIGDY nie rusza limitow twardych (number.<dev>_limit_twardy_*),
- snapshot: przy wlaczeniu algorytmu zapamietuje Twoje ustawienia, przy wylaczeniu je przywraca.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .diag import get_logger

LOG = get_logger("wykonanie")
WAW = ZoneInfo("Europe/Warsaw")
EXPORT_ON, EXPORT_OFF = "Sprzedaz wlaczona", "Limit wbudowany"


class Executor:
    def __init__(self, hass: HomeAssistant, dev: str, entry_id: str) -> None:
        self.hass, self.dev = hass, dev
        self.store = Store(hass, 1, f"ems_snapshot_{entry_id}")
        self.last_points: list | None = None

    # --- encje -------------------------------------------------------------------------------
    def eid(self, dom: str, key: str) -> str:
        return f"{dom}.{self.dev}_{key}"

    def tou_entities(self) -> list[str]:
        out = []
        for p in range(1, 7):
            out += [self.eid("number", f"tou_{p}_start_hhmm"), self.eid("number", f"tou_{p}_moc"),
                    self.eid("number", f"tou_{p}_soc"), self.eid("switch", f"tou_{p}_ladowanie_z_sieci")]
        return out + [self.eid("switch", "harmonogram_tou"), self.eid("switch", "ladowanie_z_sieci_dozwolone"),
                      self.eid("select", "tryb_limitu_eksportu")]

    def val(self, entity: str):
        st = self.hass.states.get(entity)
        return None if st is None or st.state in ("unknown", "unavailable") else st.state

    async def set(self, entity: str, value, why: str) -> None:
        if "limit_twardy" in entity:
            LOG.error("ODMOWA zapisu limitu twardego %s", entity)
            return
        cur = self.val(entity)
        dom = entity.split(".")[0]
        if dom == "number":
            if cur is not None and abs(float(cur) - float(value)) < 0.5:
                return
            await self.hass.services.async_call("number", "set_value", {"entity_id": entity, "value": value}, blocking=True)
        elif dom == "switch":
            want = "on" if value else "off"
            if cur == want:
                return
            await self.hass.services.async_call("switch", f"turn_{want}", {"entity_id": entity}, blocking=True)
        elif dom == "select":
            if cur == value:
                return
            await self.hass.services.async_call("select", "select_option", {"entity_id": entity, "option": value}, blocking=True)
        LOG.info("ZAPIS %s: %s -> %s (%s)", entity.split(".", 1)[1], cur, value, why)

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

    # --- plan -> punkty TOU ------------------------------------------------------------------------
    @staticmethod
    def mode(slot: dict, p: dict, max_charge_w: float, max_sell_w: float) -> tuple:
        if slot["action"] == "charge":
            return ("charge", True, round(p["soc_max"]), int(max_charge_w // 100 * 100))
        if slot["action"] == "sell":
            return ("sell", False, round(slot["reserve"]), int(max_sell_w // 100 * 100))
        return (slot["action"], False, round(slot["reserve"]), int(max_sell_w // 100 * 100))

    def points(self, plan: list[dict], p: dict, max_charge_w: float, max_sell_w: float) -> list[tuple]:
        now = datetime.now(WAW)
        horizon = now + timedelta(hours=24)
        segs = []
        for s in plan:
            t = datetime.fromisoformat(s["start"]).astimezone(WAW)
            if t + timedelta(minutes=15) <= now or t >= horizon:
                continue
            m = self.mode(s, p, max_charge_w, max_sell_w)
            t = max(t, now.replace(second=0, microsecond=0) - timedelta(minutes=now.minute % 15))
            if segs and segs[-1][1] == m:
                continue
            segs.append((t, m))
        if not segs:
            return []
        if len(segs) > 6:                      # falownik ma 6 punktow: reszta doby -> tryb "self"
            LOG.debug("Plan ma %d segmentow w 24 h, scalam do 6", len(segs))
            segs = segs[:5] + [(segs[5][0], ("self", False, round(p["soc_min"]), int(max_sell_w // 100 * 100)))]
        while len(segs) < 6:                   # dopelnij: podziel najdluzszy segment na pol
            gaps = [((segs[(i + 1) % len(segs)][0] if i + 1 < len(segs) else segs[0][0] + timedelta(days=1)) - segs[i][0], i)
                    for i in range(len(segs))]
            d, i = max(gaps)
            segs.insert(i + 1, (segs[i][0] + d / 2, segs[i][1]))
        pts = sorted(((t.hour * 100 + (t.minute // 5) * 5, m) for t, m in segs), key=lambda x: x[0])
        return pts

    async def apply(self, plan: list[dict], p: dict, max_charge_w: float, max_sell_w: float, current: dict | None) -> None:
        pts = self.points(plan, p, max_charge_w, max_sell_w)
        if not pts:
            LOG.warning("Brak planu na najblizsze 24 h - nic nie zapisuje")
            return
        if pts != self.last_points:
            LOG.info("Nowe punkty TOU: %s", ", ".join(f"{h:04d} {m[0]} SOC{m[2]} {m[3]}W" for h, m in pts))
        for i, (hhmm, (name, grid, soc, w)) in enumerate(pts, start=1):
            await self.set(self.eid("number", f"tou_{i}_start_hhmm"), hhmm, f"punkt {i} {name}")
            await self.set(self.eid("number", f"tou_{i}_moc"), w, f"punkt {i} {name}")
            await self.set(self.eid("number", f"tou_{i}_soc"), soc, f"punkt {i} {name}")
            await self.set(self.eid("switch", f"tou_{i}_ladowanie_z_sieci"), grid, f"punkt {i} {name}")
        await self.set(self.eid("switch", "harmonogram_tou"), True, "EMS")
        await self.set(self.eid("switch", "ladowanie_z_sieci_dozwolone"), True, "EMS")
        act = (current or {}).get("action", "self")
        await self.set(self.eid("select", "tryb_limitu_eksportu"), EXPORT_ON if act == "sell" else EXPORT_OFF, f"biezacy slot: {act}")
        self.last_points = pts
