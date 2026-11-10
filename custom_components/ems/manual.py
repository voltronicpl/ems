"""Reczne "Kup energie teraz" / "Sprzedaj teraz" (ile kWh). Dziala tez przy wylaczonym algorytmie.

Kupno: ladowanie z sieci od teraz, az ladowanie baterii (licznik dzienny) wzrosnie o zadana ilosc (lub SOC max).
Sprzedaz: sprzedaz z baterii od teraz, az eksport wzrosnie o zadana ilosc (lub SOC spadnie do zapasu).
Limit czasu 4 h. Po zakonczeniu: algorytm wlaczony -> wraca plan; wylaczony -> wracaja Twoje ustawienia.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .diag import get_logger

LOG = get_logger("reczne")


class ManualJob:
    def __init__(self, kind: str, kwh: float, counter_start: float) -> None:
        self.kind, self.kwh, self.start = kind, kwh, counter_start
        self.t0 = datetime.now(timezone.utc)
        self.done_kwh = 0.0
        self.zl = 0.0                       # kwota: kupno = stawka G12, sprzedaz = RCE x depozyt (liczona przyrostowo)
        self.reason = ""
        self.warn = ""                      # ostrzezenie: falownik nie robi tego, co zlecono
        LOG.info("START %s %.3f kWh (licznik %.1f)", "KUP" if kind == "buy" else "SPRZEDAJ", kwh, counter_start)

    def progress(self, counter_now: float | None, soc: float | None, p: dict, price: float | None = None) -> bool:
        """True = zadanie zakonczone. price = zl/kWh w tej chwili (do kwoty)."""
        if counter_now is not None:
            d = counter_now - self.start
            if d < -0.05:                       # licznik dzienny wyzerowal sie o polnocy
                self.start, d = 0.0, counter_now
            d = max(d, 0.0)
            if price is not None and d > self.done_kwh:
                self.zl += (d - self.done_kwh) * price
            self.done_kwh = d
        if self.done_kwh >= self.kwh:
            self.reason = "cel"
            LOG.info("KONIEC %s: zrealizowano %.2f / %.2f kWh (%.2f zl)", self.kind, self.done_kwh, self.kwh, self.zl)
            return True
        if soc is not None and ((self.kind == "buy" and soc >= p["soc_max"]) or (self.kind == "sell" and soc <= p["soc_min"])):
            self.reason = "SOC"
            LOG.info("KONIEC %s: SOC %.0f%% osiagnal granice (%.2f / %.2f kWh)", self.kind, soc, self.done_kwh, self.kwh)
            return True
        if datetime.now(timezone.utc) - self.t0 > timedelta(hours=4):
            self.reason = "4 h"
            LOG.warning("KONIEC %s: limit czasu 4 h (%.2f / %.2f kWh)", self.kind, self.done_kwh, self.kwh)
            return True
        return False

    def watch(self, bat_w: float | None, grid_w: float | None) -> None:
        """Po 3 min sprawdza, czy falownik faktycznie laduje (kupno) / oddaje do sieci (sprzedaz)."""
        if datetime.now(timezone.utc) - self.t0 < timedelta(minutes=3) or bat_w is None:
            return
        ok = bat_w < -50 if self.kind == "buy" else (grid_w is not None and grid_w < -50)
        msg = "" if ok else ("Falownik nie ładuje mimo zlecenia – sprawdź harmonogram TOU" if self.kind == "buy"
                             else "Falownik nie oddaje do sieci mimo zlecenia – sprawdź harmonogram TOU i tryb eksportu")
        if msg and msg != self.warn:
            LOG.warning("%s (bateria %.0f W, sieć %s W)", msg, bat_w, grid_w)
        elif not msg and self.warn:
            LOG.info("Falownik wykonuje zlecenie (bateria %.0f W)", bat_w)
        self.warn = msg

    def record(self, reason: str | None = None) -> dict:
        """Wpis do historii recznych (po zakonczeniu)."""
        return {"od": self.t0.isoformat(), "do": datetime.now(timezone.utc).isoformat(), "typ": "kup" if self.kind == "buy" else "sprzedaj",
                "kwh": round(self.kwh, 3), "zrobione_kwh": round(self.done_kwh, 3), "zl": round(self.zl, 2), "powod": reason or self.reason or "?"}

    def as_plan(self, p: dict) -> list[dict]:
        """Jeden slot 'od teraz na 4 h' w formacie planu - executor zrobi z niego punkt TOU."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        act = "charge" if self.kind == "buy" else "sell"
        out = []
        for i in range(16):
            out.append({"start": (now + timedelta(minutes=15 * i)).isoformat(), "action": act,
                        "reserve": p["soc_min"], "grid_kwh": 0, "price": None})
        out.append({"start": (now + timedelta(hours=4)).isoformat(), "action": "self", "reserve": p["soc_min"],
                    "grid_kwh": 0, "price": None})
        return out

    def info(self) -> dict:
        return {"typ": "kup" if self.kind == "buy" else "sprzedaj", "kwh": self.kwh, "zrobione_kwh": round(self.done_kwh, 2),
                "zl": round(self.zl, 2), "od": self.t0.isoformat(), "ostrzezenie": self.warn or None}


from homeassistant.components.http import HomeAssistantView  # noqa: E402


class ManualView(HomeAssistantView):
    """GET /api/ems/reczne?dni=14 -> historia recznych kupna/sprzedazy (najnowsze na koncu) + zadanie w toku."""

    url = "/api/ems/reczne"
    name = "api:ems:reczne"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        engines = [e for k, e in hass.data.get("ems", {}).items() if not k.startswith("_")]
        if not engines:
            return self.json_message("EMS nie jest skonfigurowany", 404)
        eng = engines[0]
        try:
            days = max(1, min(14, int(request.query.get("dni", 14))))
        except ValueError:
            days = 14
        cut = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = [r for r in eng.manual_log if r["od"] >= cut]
        if eng.manual:
            rows.append({**eng.manual.record("w toku"), "do": None})
        return self.json({"wpisy": rows})
