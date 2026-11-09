"""Ceny RCE z PSE (zl/kWh netto) na sloty 15 min. Dzis + jutro (PSE publikuje D+1 ok. 14:30)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .diag import get_logger

LOG = get_logger("ceny")
URL = "https://api.raporty.pse.pl/api/rce-pln"
SLOT = timedelta(minutes=15)


async def fetch(hass, days: list[date]) -> dict[datetime, float]:
    session = async_get_clientsession(hass)
    out: dict[datetime, float] = {}
    for d in days:
        try:
            params = {"$filter": f"business_date eq '{d.isoformat()}'", "$first": "200"}
            async with session.get(URL, params=params, timeout=20) as r:
                r.raise_for_status()
                rows = (await r.json(content_type=None)).get("value", [])
            n = 0
            for row in rows:
                stamp = row.get("dtime_utc") or row.get("period_utc")
                if not stamp:
                    continue
                end = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                if end.tzinfo is None:
                    end = end.replace(tzinfo=timezone.utc)
                out[end.astimezone(timezone.utc) - SLOT] = float(str(row["rce_pln"]).replace(",", ".")) / 1000
                n += 1
            LOG.info("RCE %s: %d slotow", d, n)
        except Exception as err:  # noqa: BLE001
            LOG.warning("RCE %s: blad pobierania (%s)", d, err)
    return out
