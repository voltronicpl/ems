"""Open-Meteo: naslonecznienie na plaszczyzne paneli, zachmurzenie, opady, burze, temperatura (15 min)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

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
        "minutely_15": "global_tilted_irradiance,temperature_2m,weather_code,snowfall,wind_speed_10m",
        "hourly": "cloud_cover,uv_index",
        "tilt": tilt, "azimuth": azimuth, "forecast_days": 3, "past_days": 28, "wind_speed_unit": "ms",
    }
    try:
        async with async_get_clientsession(hass).get(URL, params=params, timeout=30) as r:
            r.raise_for_status()
            data = await r.json()
            j = data["minutely_15"]
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
            "wind": (j.get("wind_speed_10m") or [None] * len(j["time"]))[i],
        }
    hj = (data.get("hourly") or {})
    for i, t in enumerate(hj.get("time", [])):
        h = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        for q in range(4):
            rec = out.get(h + timedelta(minutes=15 * q))
            if rec is not None:
                rec["cloud"] = (hj.get("cloud_cover") or [None])[i] if hj.get("cloud_cover") else None
                rec["uv"] = (hj.get("uv_index") or [None])[i] if hj.get("uv_index") else None
    LOG.info("Open-Meteo: %d slotow, burze w prognozie: %d", len(out),
             sum(1 for v in out.values() if v["storm"] and True))
    return out


ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
_ARCH: dict = {"day": None, "data": {}}


async def fetch_archive(hass, lat: float, lon: float, tilt: float, azimuth: float, days: int = 365) -> dict[datetime, dict]:
    """Pogoda wstecz do nauki (rok): {slot_15min_utc: {gti, temp}} z danych godzinowych (archiwum Open-Meteo), cache na dobe."""
    from datetime import date, timedelta
    today = date.today()
    if _ARCH["day"] == today and _ARCH["data"]:
        return _ARCH["data"]
    params = {"latitude": lat, "longitude": lon, "timezone": "UTC", "hourly": "global_tilted_irradiance,temperature_2m,wind_speed_10m,cloud_cover",
              "wind_speed_unit": "ms", "tilt": tilt, "azimuth": azimuth, "start_date": (today - timedelta(days=days)).isoformat(), "end_date": (today - timedelta(days=2)).isoformat()}
    try:
        async with async_get_clientsession(hass).get(ARCHIVE, params=params, timeout=60) as r:
            r.raise_for_status()
            j = (await r.json())["hourly"]
    except Exception as err:  # noqa: BLE001
        LOG.warning("Open-Meteo archiwum: blad (%s)", err)
        return _ARCH["data"]
    out = {}
    for i, t in enumerate(j["time"]):
        h = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        cc = (j.get("cloud_cover") or [None] * len(j["time"]))[i]
        rec = {"gti": j["global_tilted_irradiance"][i] or 0.0, "temp": j["temperature_2m"][i], "code": 0, "storm": False,
               "cat": "slonecznie" if cc is None or cc < 30 else "pochmurno", "wind": (j.get("wind_speed_10m") or [None] * len(j["time"]))[i], "cloud": cc}
        for q in range(4):
            out[h + timedelta(minutes=15 * q)] = rec
    _ARCH.update(day=today, data=out)
    LOG.info("Open-Meteo archiwum: %d godzin (%d dni) do nauki", len(j["time"]), days)
    return out
