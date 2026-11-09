"""Open-Meteo: naslonecznienie na plaszczyzne paneli, zachmurzenie, opady, burze, temperatura (15 min)."""
from __future__ import annotations

from datetime import datetime, timezone

from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .diag import get_logger

LOG = get_logger("pogoda")
URL = "https://api.open-meteo.com/v1/forecast"
STORM = {95, 96, 99}


def category(code: int, snow: float) -> str:
    if snow and snow > 0:
        return "snieg"
    if code in STORM or 51 <= code <= 67 or 80 <= code <= 82:
        return "deszcz"
    if code >= 2:
        return "pochmurno"
    return "slonecznie"


async def fetch(hass, lat: float, lon: float, tilt: float, azimuth: float) -> dict[datetime, dict]:
    """{slot_utc: {gti, temp, code, cat, storm}} dla dzis + 2 dni + 28 dni wstecz (temperatura do uczenia)."""
    params = {
        "latitude": lat, "longitude": lon, "timezone": "UTC",
        "minutely_15": "global_tilted_irradiance,temperature_2m,weather_code,snowfall",
        "tilt": tilt, "azimuth": azimuth, "forecast_days": 3, "past_days": 28,
    }
    try:
        async with async_get_clientsession(hass).get(URL, params=params, timeout=30) as r:
            r.raise_for_status()
            j = (await r.json())["minutely_15"]
    except Exception as err:  # noqa: BLE001
        LOG.warning("Open-Meteo: blad (%s)", err)
        return {}
    out = {}
    for i, t in enumerate(j["time"]):
        code = int(j["weather_code"][i] or 0)
        snow = j["snowfall"][i] or 0
        out[datetime.fromisoformat(t).replace(tzinfo=timezone.utc)] = {
            "gti": j["global_tilted_irradiance"][i] or 0.0,
            "temp": j["temperature_2m"][i],
            "code": code,
            "cat": category(code, snow),
            "storm": code in STORM,
        }
    LOG.info("Open-Meteo: %d slotow, burze w prognozie: %d", len(out),
             sum(1 for v in out.values() if v["storm"] and True))
    return out
