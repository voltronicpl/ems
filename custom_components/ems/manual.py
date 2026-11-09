"""Reczne "Kup energie teraz" / "Sprzedaj teraz" (ile kWh). Dziala tez przy wylaczonym algorytmie.

Kupno: ladowanie z sieci od teraz, az import z sieci wzrosnie o zadana ilosc (lub SOC max).
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
        LOG.info("START %s %.3f kWh (licznik %.1f)", "KUP" if kind == "buy" else "SPRZEDAJ", kwh, counter_start)

    def progress(self, counter_now: float | None, soc: float | None, p: dict) -> bool:
        """True = zadanie zakonczone."""
        if counter_now is not None:
            d = counter_now - self.start
            if d < -0.05:                       # licznik dzienny wyzerowal sie o polnocy
                self.start, d = 0.0, counter_now
            self.done_kwh = max(d, 0.0)
        if self.done_kwh >= self.kwh:
            LOG.info("KONIEC %s: zrealizowano %.2f / %.2f kWh", self.kind, self.done_kwh, self.kwh)
            return True
        if soc is not None and ((self.kind == "buy" and soc >= p["soc_max"]) or (self.kind == "sell" and soc <= p["soc_min"])):
            LOG.info("KONIEC %s: SOC %.0f%% osiagnal granice (%.2f / %.2f kWh)", self.kind, soc, self.done_kwh, self.kwh)
            return True
        if datetime.now(timezone.utc) - self.t0 > timedelta(hours=4):
            LOG.warning("KONIEC %s: limit czasu 4 h (%.2f / %.2f kWh)", self.kind, self.done_kwh, self.kwh)
            return True
        return False

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
                "od": self.t0.isoformat()}
