"""Zrzut WSZYSTKICH rejestrow falownika (0–1099) przez datalogger: porownanie stanow „pusto / sprzedaz / kupno”.

Datalogger (pakiet YAML `ems_zrzut.yaml`) po akcji `esphome.<dev>_zrzut_rejestrow(etykieta)` czyta rejestry blokami po 50
i wysyla do HA zdarzenia `esphome.ems_zrzut` {etykieta, start, hex}; na koniec {start: "koniec"}.
EMS zbiera bloki i zapisuje plik /config/ems_logs/zrzut-<etykieta>-RRRRMMDD-HHMMSS.json {rejestr: wartosc}.
API: GET /api/ems/zrzuty  -> lista plikow, ostatni zrzut kazdej etykiety i roznice miedzy nimi; trwajacy zrzut (postep).
EMS NIC nie zapisuje do falownika – tylko odczyt.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from homeassistant.components.http import HomeAssistantView

from .diag import get_logger

LOG = get_logger("zrzut")
LABELS = ("pusto", "sprzedaz", "kupno")
_cur: dict = {}          # etykieta -> {"t": iso, "reg": {adres: wartosc}, "bloki": n, "bledy": [start]}
_dir: Path | None = None


def setup(hass) -> None:
    global _dir
    _dir = Path(hass.config.path("ems_logs"))
    _dir.mkdir(parents=True, exist_ok=True)

    def on_block(ev) -> None:
        d = ev.data or {}
        lab = str(d.get("etykieta", "?"))[:20]
        start, hx = str(d.get("start", "")), str(d.get("hex", ""))
        cur = _cur.setdefault(lab, {"t": datetime.now().isoformat(timespec="seconds"), "reg": {}, "bloki": 0, "bledy": []})
        if start == "koniec":
            path = _dir / f"zrzut-{lab}-{datetime.now():%Y%m%d-%H%M%S}.json"
            data = {"etykieta": lab, "czas": cur["t"], "rejestry": cur["reg"], "bledy": cur["bledy"]}
            hass.async_add_executor_job(path.write_text, json.dumps(data, ensure_ascii=False))
            LOG.info("Zrzut '%s' zapisany: %d rejestrow, bledy blokow: %s -> %s", lab, len(cur["reg"]), cur["bledy"] or "brak", path.name)
            _cur.pop(lab, None)
            return
        try:
            a = int(start)
        except ValueError:
            return
        cur["bloki"] += 1
        if not hx or hx == "ERR":
            cur["bledy"].append(a)
            return
        for i in range(0, len(hx) // 4):
            cur["reg"][str(a + i)] = int(hx[4 * i:4 * i + 4], 16)

    hass.bus.async_listen("esphome.ems_zrzut", on_block)
    hass.http.register_view(DumpView)


def _load(p: Path) -> dict:
    try:
        return json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        return {}


class DumpView(HomeAssistantView):
    url = "/api/ems/zrzuty"
    name = "api:ems:zrzuty"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]

        def work():
            files = sorted(_dir.glob("zrzut-*.json"), reverse=True) if _dir else []
            last = {}
            for f in files:
                lab = f.name.split("-")[1]
                if lab not in last:
                    last[lab] = {"plik": f.name, **_load(f)}
            labs = [k for k in LABELS if k in last] + [k for k in last if k not in LABELS]
            regs = sorted({int(r) for k in labs for r in last[k].get("rejestry", {})})
            diff = []
            for r in regs:
                vals = [last[k]["rejestry"].get(str(r)) for k in labs]
                if len({v for v in vals}) > 1:
                    diff.append({"rejestr": r, **{k: v for k, v in zip(labs, vals)}})
            return {"pliki": [f.name for f in files[:30]], "ostatnie": {k: {"plik": v["plik"], "czas": v.get("czas"), "ile": len(v.get("rejestry", {})),
                    "bledy": v.get("bledy", [])} for k, v in last.items()}, "etykiety": labs, "roznice": diff,
                    "trwa": {k: {"bloki": v["bloki"], "rejestry": len(v["reg"])} for k, v in _cur.items()}}
        return self.json(await hass.async_add_executor_job(work))
