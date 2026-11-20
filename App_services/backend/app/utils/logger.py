# app/utils/logger.py

import logging
import sys
from logging.handlers import RotatingFileHandler

from app.config.settings import settings

_configured = False
_FMT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    root = logging.getLogger("dj")
    root.setLevel(getattr(logging, settings.LOG_LEVEL, logging.INFO))
    root.propagate = False

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter(_FMT))
    root.addHandler(console)

    try:
        settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
        for name in ("app", "audit"):
            handler = RotatingFileHandler(
                settings.LOG_DIR / f"{name}.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8"
            )
            handler.setFormatter(logging.Formatter(_FMT))
            target = root if name == "app" else logging.getLogger("dj.audit")
            target.addHandler(handler)
    except OSError:
        root.warning("Log directory is not writable; logging to console only.")
    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"dj.{name}")


def audit(action: str, service_id: str | None = None, outcome: str = "ok", **extra) -> None:
    parts = [f"action={action}", f"service={service_id or '-'}", f"outcome={outcome}"]
    parts += [f"{k}={v}" for k, v in extra.items()]
    logging.getLogger("dj.audit").info(" ".join(parts))