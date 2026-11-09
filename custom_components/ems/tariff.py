"""PGE G12: strefy, sezony, stawki. Licznik PGE chodzi na czasie zimowym (CET)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

CET = timezone(timedelta(hours=1))
PRICE = {"cheap": 0.61, "expensive": 1.25}            # zl/kWh brutto (energia + dystrybucja), 2026


def is_summer(dt: datetime) -> bool:
    return 4 <= dt.month <= 9


def season(dt: datetime) -> str:
    return "lato" if is_summer(dt) else "zima"


def is_cheap(dt: datetime) -> bool:
    """Tania strefa liczona wg czasu licznika (CET), niezaleznie od czasu letniego."""
    m = dt.astimezone(CET)
    h = m.hour + m.minute / 60
    day = (15, 17) if is_summer(dt) else (13, 15)
    return h >= 22 or h < 6 or day[0] <= h < day[1]


def buy_price(dt: datetime) -> float:
    return PRICE["cheap"] if is_cheap(dt) else PRICE["expensive"]
