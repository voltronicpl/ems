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


_CACHE: dict = {}                     # dzien (data) -> {slot_utc: zl/kWh}


async def fetch_days(hass, start: date, end: date) -> dict[datetime, float]:
    """RCE dla zakresu dni (wstecz), z cache; brakujace dni pobiera jednym zapytaniem z paginacja."""
    missing = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    missing = [d for d in missing if d not in _CACHE and d < date.today()]
    if missing:
        session = async_get_clientsession(hass)
        url, params = URL, {"$filter": f"business_date ge '{missing[0].isoformat()}' and business_date le '{missing[-1].isoformat()}'",
                            "$first": "5000"}
        got: dict = {}
        try:
            for _ in range(40):
                async with session.get(url, params=params, timeout=30) as r:
                    r.raise_for_status()
                    j = await r.json(content_type=None)
                for row in j.get("value", []):
                    stamp = row.get("dtime_utc") or row.get("period_utc")
                    if not stamp:
                        continue
                    e = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                    e = (e if e.tzinfo else e.replace(tzinfo=timezone.utc)).astimezone(timezone.utc) - SLOT
                    got[e] = float(str(row["rce_pln"]).replace(",", ".")) / 1000
                nxt = j.get("nextLink") or j.get("@odata.nextLink")
                if not nxt:
                    break
                url, params = nxt, None
        except Exception as err:  # noqa: BLE001
            LOG.warning("RCE wstecz %s..%s: blad (%s)", missing[0], missing[-1], err)
        from zoneinfo import ZoneInfo
        waw = ZoneInfo("Europe/Warsaw")
        for s, v in got.items():
            _CACHE.setdefault(s.astimezone(waw).date(), {})[s] = v
        for d in missing:
            _CACHE.setdefault(d, {})
        LOG.info("RCE wstecz: pobrano %d slotow dla %d dni", len(got), len(missing))
    out: dict = {}
    for i in range((end - start).days + 1):
        out.update(_CACHE.get(start + timedelta(days=i), {}))
    if end >= date.today():
        out.update(await fetch(hass, [d for d in (date.today(), date.today() + timedelta(days=1)) if start <= d <= end]))
    return out
