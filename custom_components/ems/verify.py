"""Zapis z panelu + sprawdzenie, czy falownik naprawde ma te wartosci.

Encje dataloggera ESPHome (Modbus) po zapisie od razu pokazuja nowa wartosc (ESPHome publikuje ja "na slowo"),
a integracja ESPHome w HA polyka odczyty z ta sama wartoscia - wiec samo spojrzenie na stan nic nie mowi.
Sprawdzenie = poczekac, az datalogger zrobi pelny cykl odczytu PO zapisie, i dopiero wtedy porownac
(jesli falownik nie przyjal wartosci, odczyt przywroci stara i to widac):
- z licznikiem cykli w ESP (sensor.<dev>_licznik_odczytow): licznik +2 od zapisu = pelny cykl po zapisie,
- bez licznika: 2 x interwal odczytu + 3 s i dowod, ze datalogger zyje (inne odczyty zmienialy sie po zapisie).
Brak dowodu odczytu do konca czasu -> "nie potwierdzono" (blad). Parametry EMS (number.ems_*) - od razu.
Encja dataloggera, ktora juz ma wysylana wartosc, NIE jest zapisywana (wynik "bez zmian", log [zapis] BEZ ZMIAN).

POST /api/ems/zapis {"dev": "ecobss", "items": [{"entity_id": "...", "value": 5000}]}
  value: liczba (number), true/false (switch), tekst opcji (select)
  -> {"ok": bool, "items": [{"entity_id", "ok", "want", "got", "msg"}]}
"""
from __future__ import annotations

import asyncio
import time

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .diag import get_logger

LOG = get_logger("zapis")
POLL = 0.5                 # s
BAD = ("unknown", "unavailable", None)


def _local(entity: str) -> bool:
    return entity.split(".", 1)[1].startswith("ems_")


def _interval(hass: HomeAssistant, dev: str) -> float:
    st = hass.states.get(f"number.{dev}_interwal_odczytu") or hass.states.get("number.ems_interwal")
    try:
        return max(1.0, float(st.state))
    except (AttributeError, TypeError, ValueError):
        return 10.0


def _timeout(hass: HomeAssistant, dev: str) -> float:
    return min(120.0, max(20.0, 3 * _interval(hass, dev) + 10))


def _counter(hass: HomeAssistant, dev: str) -> float | None:
    st = hass.states.get(f"sensor.{dev}_licznik_odczytow")
    try:
        return float(st.state)
    except (AttributeError, TypeError, ValueError):
        return None


def _alive_since(hass: HomeAssistant, dev: str, t: float) -> bool:
    """Czy jakikolwiek odczyt dataloggera zmienil sie po chwili t (datalogger czyta)."""
    pre = f"sensor.{dev}_"
    return any(s.entity_id.startswith(pre) and s.state not in BAD and s.last_updated.timestamp() >= t
               for s in hass.states.async_all("sensor"))


def _match(st, want) -> bool:
    if st is None or st.state in BAD:
        return False
    dom = st.entity_id.split(".")[0]
    if dom == "number":
        try:
            got = float(st.state)
        except ValueError:
            return False
        step = float(st.attributes.get("step") or 1)
        return abs(got - float(want)) <= max(step / 2, abs(float(want)) * 1e-3, 1e-6)
    if dom == "switch":
        return st.state == ("on" if want else "off")
    return st.state == str(want)


def _show(st) -> str:
    return "brak encji" if st is None else ("brak odczytu" if st.state in BAD else st.state)


async def _write(hass: HomeAssistant, entity: str, want) -> None:
    dom = entity.split(".")[0]
    if dom == "number":
        await hass.services.async_call("number", "set_value", {"entity_id": entity, "value": float(want)}, blocking=True)
    elif dom == "switch":
        await hass.services.async_call("switch", "turn_on" if want else "turn_off", {"entity_id": entity}, blocking=True)
    elif dom == "select":
        await hass.services.async_call("select", "select_option", {"entity_id": entity, "option": str(want)}, blocking=True)
    else:
        raise ValueError(f"nieobslugiwana domena {dom}")


async def _confirm(hass: HomeAssistant, dev: str, entity: str, want, t0: float, c0: float | None) -> dict:
    """Czeka na pelny cykl odczytu po zapisie (t0 = time.time() tuz po zapisie, c0 = licznik cykli wtedy)."""
    iv, timeout = _interval(hass, dev), _timeout(hass, dev)
    end, check_at = time.monotonic() + timeout, t0 + 2 * iv + 3
    while True:
        st, now, c = hass.states.get(entity), time.time(), _counter(hass, dev)
        if c0 is not None and c is not None:
            read = c >= c0 + 2                          # licznik: dwa cykle = jeden caly po zapisie
            how = "licznik cykli"
        else:
            read = now >= check_at and _alive_since(hass, dev, t0 + iv)
            how = "odczyt po zapisie"
        if read:
            if _match(st, want):
                return {"ok": True, "got": st.state, "msg": f"zapisano – falownik potwierdził ({how})"}
            return {"ok": False, "got": _show(st), "msg": f"falownik ma {_show(st)}, a nie {want}"}
        if time.monotonic() >= end:
            return {"ok": False, "got": _show(st), "msg": f"brak nowego odczytu z falownika w {timeout:.0f} s – nie potwierdzono"}
        await asyncio.sleep(POLL)


async def write_verified(hass: HomeAssistant, dev: str, items: list[dict]) -> list[dict]:
    out, wait = [], []
    for it in items:                                # zapisy po kolei (jedna kolejka Modbus w ESP)
        entity, want = it["entity_id"], it.get("value")
        res = {"entity_id": entity, "want": want}
        if "limit_twardy" in entity and it.get("source") != "panel":
            res.update(ok=False, got=None, msg="limit twardy – zapis tylko z panelu")
            out.append(res)
            continue
        cur = hass.states.get(entity)
        if not _local(entity) and _match(cur, want):  # falownik juz ma te wartosc -> bez zapisu (zapis tylko przy zmianie)
            res.update(ok=True, got=cur.state, same=True, msg=f"bez zmian – falownik już ma {cur.state}")
            out.append(res)
            continue
        try:
            await _write(hass, entity, want)
        except Exception as e:  # noqa: BLE001 - blad jednej encji nie blokuje reszty
            res.update(ok=False, got=_show(hass.states.get(entity)), msg=f"błąd zapisu: {e}")
            out.append(res)
            continue
        if _local(entity):
            st = hass.states.get(entity)
            ok = _match(st, want)
            res.update(ok=ok, got=_show(st), msg="zapisano" if ok else f"EMS ma {_show(st)}")
            out.append(res)
        else:
            out.append(res)
            wait.append((res, asyncio.create_task(_confirm(hass, dev, entity, want, time.time(), _counter(hass, dev)))))
    for res, task in wait:                          # sprawdzanie rownolegle - jeden cykl odczytu dla wszystkich
        res.update(await task)
    for r in out:
        (LOG.info if r["ok"] else LOG.error)("%s %s = %s -> %s", "BEZ ZMIAN" if r.get("same") else "ZAPISANO" if r["ok"] else "NIE ZAPISANO",
                                             r["entity_id"].split(".", 1)[1], r["want"], r["msg"])
    return out


class WriteView(HomeAssistantView):
    url = "/api/ems/zapis"
    name = "api:ems:zapis"

    async def post(self, request):
        hass: HomeAssistant = request.app["hass"]
        body = await request.json()
        items = [dict(i, source="panel") for i in body.get("items", []) if i.get("entity_id")]
        if not items:
            return self.json({"ok": False, "items": [], "msg": "nic do zapisu"}, status_code=400)
        res = await write_verified(hass, body.get("dev") or "ecobss", items)
        return self.json({"ok": all(r["ok"] for r in res), "items": res})
