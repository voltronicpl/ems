"""Test nocnej strefy: plan (60 % -> 80 % na 04:50 -> 98 % do 06:00) -> punkty TOU (lista przesuwana).
Uruchom: python3 tests/test_noc.py (bez Home Assistant – moduly HA podstawione)."""
import logging
import os
import sys
import types
from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(__file__), "..", "custom_components")
for m in ["homeassistant", "homeassistant.core", "homeassistant.helpers", "homeassistant.helpers.storage"]:
    sys.modules[m] = types.ModuleType(m)
sys.modules["homeassistant.core"].HomeAssistant = object
sys.modules["homeassistant.helpers.storage"].Store = object
pk = types.ModuleType("ems"); pk.__path__ = [os.path.join(ROOT, "ems")]; sys.modules["ems"] = pk   # noqa: E702
dg = types.ModuleType("ems.diag"); dg.get_logger = logging.getLogger; sys.modules["ems.diag"] = dg   # noqa: E702
pe = types.ModuleType("ems.peak"); pe.PeakShave = object; sys.modules["ems.peak"] = pe            # noqa: E702
from ems import const, executor, planner  # noqa: E402

W = ZoneInfo("Europe/Warsaw")
p = {k: v[5] for k, v in const.PARAMS.items()}
p.update(planner.auto_thresholds(p))
t0 = datetime(2026, 11, 20, 22, 0, tzinfo=W)
slots = [t0 + timedelta(minutes=15 * i) for i in range(60)]
out, _ = planner.plan(slots, {s: 0.5 for s in slots}, {}, {s: 0.3 for s in slots}, {}, 30, p, 15, 6000, 6000)
soc = {datetime.fromisoformat(s.start).strftime("%H:%M"): s.soc for s in out}
assert soc["23:45"] == 60, soc["23:45"]
assert abs(soc["04:30"] - 80) < 1, soc["04:30"]
assert soc["05:45"] >= 97.9, soc["05:45"]
ex = executor.Executor.__new__(executor.Executor)
ex.sell_block = None


def pts_at(nw):
    class D(datetime):
        @classmethod
        def now(cls, tz=None):
            return nw
    with mock.patch.object(executor, "datetime", D):
        return ex.points(planner.as_dicts(out), p, 6000, 6000)


for nw in (datetime(2026, 11, 20, 23, 40, tzinfo=W), datetime(2026, 11, 21, 3, 0, tzinfo=W)):
    pts = pts_at(nw)
    assert len(pts) == 6 and len({h for h, _ in pts}) == 6, pts
    ch = {h: m[2] for h, m in pts if m[0] == "charge"}
    assert ch.get(345) == 80 and ch.get(500) == 98, (nw, pts)
print("OK noc: 60 % -> 80 % (03:45) -> 98 % (05:00), 6 punktow TOU")
