"""Prognoza PV na sloty 15 min: naslonecznienie Open-Meteo x moc paneli x mnozniki pogody (lato/zima)
+ korekta w trakcie dnia z rzeczywistej produkcji."""
from __future__ import annotations

from datetime import datetime, timedelta

from .diag import get_logger
from .tariff import season

LOG = get_logger("pv")


def forecast(slots: list[datetime], weather: dict, p: dict, intraday: float = 1.0) -> dict[datetime, float]:
    """kWh na slot."""
    out = {}
    for s in slots:
        w = weather.get(s)
        if not w:
            out[s] = 0.0
            continue
        mult = p[f"mn_{w['cat']}_{season(s)}"]
        kw = w["gti"] / 1000 * p["pv_moc_w"] / 1000 * p["pv_sprawnosc"] / 100 * mult
        out[s] = max(kw, 0) * 0.25 * (intraday if s.date() == slots[0].date() else 1.0)
    total = sum(out.values())
    LOG.info("PV prognoza: %.2f kWh w horyzoncie (korekta dnia x%.2f)", total, intraday)
    return out


def intraday_factor(actual_kwh_2h: float, forecast_kwh_2h: float) -> float:
    """Ile razy rzeczywistosc odbiega od prognozy z ostatnich 2 h (0,3..1,5); przy malej produkcji 1,0."""
    if forecast_kwh_2h < 0.2:
        return 1.0
    f = max(0.3, min(1.5, actual_kwh_2h / forecast_kwh_2h))
    LOG.debug("PV korekta dnia: fakt %.2f / prognoza %.2f = x%.2f", actual_kwh_2h, forecast_kwh_2h, f)
    return f
