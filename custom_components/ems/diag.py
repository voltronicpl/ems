"""Diagnostyka: logi EMS do pliku (jeden plik na dzien, 14 dni) + bufor na zywo dla panelu.

Kazdy modul loguje przez get_logger("pv"), get_logger("plan") itd., wiec w pliku widac skad linia.
Pliki: /config/ems_logs/ems-YYYY-MM-DD.log
"""
from __future__ import annotations

import logging
from collections import deque
from datetime import date, datetime
from pathlib import Path

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

ROOT = "custom_components.ems"
KEEP_DAYS = 14
_live: deque[str] = deque(maxlen=1000)
_dir: Path | None = None


def get_logger(module: str) -> logging.Logger:
    return logging.getLogger(f"{ROOT}.{module}")


class _DailyFile(logging.Handler):
    """Pisze do pliku dnia; o polnocy sam przechodzi na nowy i kasuje stare."""

    def __init__(self, folder: Path) -> None:
        super().__init__(logging.DEBUG)
        self.folder = folder
        self.day: date | None = None
        self.fh = None

    def _open(self) -> None:
        today = date.today()
        if self.day == today and self.fh:
            return
        if self.fh:
            self.fh.close()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.fh = open(self.folder / f"ems-{today.isoformat()}.log", "a", encoding="utf-8")
        self.day = today
        for f in sorted(self.folder.glob("ems-*.log"))[:-KEEP_DAYS]:
            f.unlink(missing_ok=True)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            line = self.format(record)
            _live.append(line)
            self._open()
            self.fh.write(line + "\n")
            self.fh.flush()
        except Exception:  # noqa: BLE001 - logowanie nigdy nie moze wywalic EMS
            pass

    def close(self) -> None:
        if self.fh:
            self.fh.close()
        super().close()


def setup(hass: HomeAssistant) -> None:
    global _dir
    _dir = Path(hass.config.path("ems_logs"))
    root = logging.getLogger(ROOT)
    if any(isinstance(h, _DailyFile) for h in root.handlers):
        return
    h = _DailyFile(_dir)
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s [%(name)s] %(message)s", "%H:%M:%S"))
    root.addHandler(h)
    root.setLevel(logging.DEBUG)
    hass.http.register_view(LogsView)
    hass.http.register_view(LogDownloadView)
    hass.http.register_view(LogPostView)


class LogsView(HomeAssistantView):
    """GET /api/ems/logs?tail=200 -> ostatnie linie + lista dni do pobrania."""

    url = "/api/ems/logs"
    name = "api:ems:logs"
    requires_auth = True

    async def get(self, request):
        tail = min(int(request.query.get("tail", 300)), 1000)
        days = sorted((p.stem[4:] for p in _dir.glob("ems-*.log")), reverse=True) if _dir and _dir.exists() else []
        return self.json({"lines": list(_live)[-tail:], "days": days, "now": datetime.now().isoformat()})


class LogDownloadView(HomeAssistantView):
    """GET /api/ems/logs/download?day=YYYY-MM-DD -> caly plik dnia."""

    url = "/api/ems/logs/download"
    name = "api:ems:logs:download"
    requires_auth = True

    async def get(self, request):
        from aiohttp import web

        try:
            day = date.fromisoformat(request.query["day"]).isoformat()
        except (KeyError, ValueError):
            return self.json_message("day=YYYY-MM-DD", 400)
        f = _dir / f"ems-{day}.log" if _dir else None
        if not f or not f.exists():
            return self.json_message("brak logu z tego dnia", 404)
        return web.FileResponse(f, headers={"Content-Disposition": f'attachment; filename="ems-{day}.log"'})


class LogPostView(HomeAssistantView):
    """POST /api/ems/log {"msg": "..."} - akcje z panelu (np. surowy zapis) trafiaja do logu dnia."""

    url = "/api/ems/log"
    name = "api:ems:log"
    requires_auth = True

    async def post(self, request):
        try:
            msg = str((await request.json()).get("msg", ""))[:500]
        except ValueError:
            return self.json_message("zly JSON", 400)
        user = request.get("hass_user")
        get_logger("panel").info("%s (%s)", msg, user.name if user else "?")
        return self.json({"ok": True})
