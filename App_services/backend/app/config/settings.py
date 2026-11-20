# app/config/settings.py

import os
import re
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


def _str(name: str, default: str = "") -> str:
    v = os.getenv(name)
    return default if v is None or not v.strip() else v.strip()


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None or not v.strip() else v.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(_str(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(_str(name, str(default)))
    except ValueError:
        return default


def _list(name: str, default: list) -> list:
    raw = _str(name)
    return [p.strip() for p in raw.split(",") if p.strip()] if raw else default


def _path(name: str, default: Path) -> Path:
    raw = _str(name)
    return Path(raw) if raw else default


class Settings:
    def __init__(self) -> None:
        self.APP_NAME = "DJ Application Services"
        self.APP_ENV = _str("APP_ENV", "development")
        self.RUNNING_IN_DOCKER = _bool("RUNNING_IN_DOCKER", Path("/.dockerenv").exists())

        self.API_HOST = _str("API_HOST", "127.0.0.1")
        self.API_PORT = _int("API_PORT", 8010)
        self.DASHBOARD_PORT = _int("DASHBOARD_PORT", 5175)
        self.LOG_LEVEL = _str("LOG_LEVEL", "INFO").upper()
        self.LOG_DIR = _path("LOG_DIR", BACKEND_DIR / "logs")
        self.CORS_ORIGINS = _list(
            "CORS_ORIGINS", [f"http://localhost:{self.DASHBOARD_PORT}", f"http://127.0.0.1:{self.DASHBOARD_PORT}"]
        )
        self.ADMIN_TOKEN = _str("ADMIN_TOKEN")

        self.DB_HOST = _str("DB_HOST", "localhost")
        self.DB_PORT = _int("DB_PORT", 5432)
        self.DB_NAME = _str("DB_NAME", "postgres")
        self.DB_USER = _str("DB_USER", "postgres")
        self.DB_PASSWORD = os.getenv("DB_PASSWORD", "")
        self.DB_SCHEMA = _str("DB_SCHEMA", "dj_services")
        if not re.match(r"^[a-z_][a-z0-9_]{0,62}$", self.DB_SCHEMA):
            raise ValueError("DB_SCHEMA must be a lowercase identifier (letters, digits, underscore).")

        # Config-relative paths resolve against BASE_DIR (the App_services folder).
        self.BASE_DIR = _path("SERVICES_BASE_DIR", BACKEND_DIR.parent)
        # Managed projects must stay inside PROJECTS_ROOT (the folder holding all projects).
        self.PROJECTS_ROOT = _path("PROJECTS_ROOT", self.BASE_DIR.parent)
        # Same folder as the Docker daemon sees it (Windows path when the backend runs in a container).
        self.HOST_PROJECTS_ROOT = _str("HOST_PROJECTS_ROOT", self.PROJECTS_ROOT.as_posix())
        self.CONFIG_FILE = _path("CONFIG_FILE", BACKEND_DIR / "app" / "config" / "App_cofig.json")

        self.DOCKER_HOST = _str("DOCKER_HOST")
        self.DOCKER_NETWORK = _str("DOCKER_NETWORK", "dj_services_net")
        self.HEALTH_HOST = _str("HEALTH_HOST", "localhost")
        self.HEALTH_TIMEOUT = _float("HEALTH_TIMEOUT", 3.0)
        self.MONITOR_INTERVAL = _int("MONITOR_INTERVAL", 5)
        self.RECONCILE_ON_START = _bool("RECONCILE_ON_START", True)
        self.ALLOW_CUSTOM_COMMANDS = _bool("ALLOW_CUSTOM_COMMANDS", False)
        self.ALLOW_REMOTE_BIND = _bool("ALLOW_REMOTE_BIND", False)
        # A local socket probe only reflects the host when the backend runs natively.
        self.PORT_PROBE_LOCAL = _bool("PORT_PROBE_LOCAL", not self.RUNNING_IN_DOCKER)
        self.LABEL_PREFIX = "dj"
        self.START_WAIT_SECONDS = _int("START_WAIT_SECONDS", 20)
        self.STOP_TIMEOUT = _int("STOP_TIMEOUT", 15)
        self.DOCKER_TIMEOUT = _int("DOCKER_TIMEOUT", 3600)
        self.LOG_TAIL_MAX = _int("LOG_TAIL_MAX", 2000)
        self.PORT_PROBE_HOSTS = _list(
            "PORT_PROBE_HOSTS", ["host.docker.internal"] if self.RUNNING_IN_DOCKER else ["127.0.0.1", "::1"]
        )

    @property
    def RESERVED_PORTS(self) -> set:
        return {self.API_PORT, self.DASHBOARD_PORT, self.DB_PORT}


settings = Settings()