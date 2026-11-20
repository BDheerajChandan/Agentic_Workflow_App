# app/control/health_manager.py
# HTTP health probes. The probe target comes from the registered config only (never from a request).

import time
from datetime import datetime, timezone

import requests
import urllib3

from app.config.settings import settings

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def probe_url(service: dict) -> str:
    path = service.get("health_check_path") or "/"
    proto = service.get("protocol") or "http"
    if settings.RUNNING_IN_DOCKER:
        return f"{proto}://{service['container_name']}:{service['container_port']}{path}"
    return f"{proto}://{settings.HEALTH_HOST}:{service['host_port']}{path}"


def check(service: dict) -> dict:
    url = probe_url(service)
    started = time.perf_counter()
    try:
        with requests.get(
            url, timeout=settings.HEALTH_TIMEOUT, allow_redirects=False, stream=True, verify=False,
            headers={"User-Agent": "DJ-Services-Health/1.0"},
        ) as resp:
            code = resp.status_code
        return {
            "ok": code < 500, "status_code": code, "error": None, "url": url,
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }
    except requests.RequestException as exc:
        return {"ok": False, "status_code": None, "error": type(exc).__name__, "url": url, "latency_ms": None}


def classify(service: dict, docker_status: str | None, probe: dict | None, started_at: datetime | None,
             now: datetime | None = None) -> str:
    """healthy | unhealthy | starting | stopped | unknown. A running container is not automatically healthy."""
    if docker_status is None:
        return "unknown"
    if docker_status in ("exited", "created", "dead", "not_found", "removing"):
        return "stopped"
    if docker_status == "paused":
        return "unhealthy"
    now = now or datetime.now(timezone.utc)
    in_window = bool(started_at) and (now - started_at).total_seconds() < service.get("start_period_seconds", 300)
    if docker_status == "restarting":
        return "starting" if in_window else "unhealthy"
    if probe and probe.get("ok"):
        return "healthy"
    return "starting" if in_window else "unhealthy"