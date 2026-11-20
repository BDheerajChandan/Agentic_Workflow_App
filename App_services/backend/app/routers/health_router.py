# app/routers/health_router.py
# Aggregate health + host-port availability (used by the registration form).

import asyncio

from fastapi import APIRouter, Path

from app.config.settings import settings
from app.control import port_manager as pm
from app.control.service_manager import manager
from app.database import repository as repo
from app.schemas.service_schema import ok
from app.utils.errors import DockerUnavailable

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("/services")
async def services_health(refresh: bool = False):
    data = await manager.list_views(force=refresh)
    rows = [
        {
            "service_id": v["service_id"], "service_name": v["service_name"], "state": v["state"],
            "docker_status": v["docker_status"], "health": v["health"],
            "last_health_check_at": v["last_health_check_at"],
        }
        for v in data["services"]
    ]
    return ok(rows, f"{len(rows)} service(s).", summary=data["summary"], docker=data["docker"])


@router.get("/ports/{port}")
async def port_status(port: int = Path(ge=1, le=65535), service_id: str | None = None):
    try:
        info = await asyncio.to_thread(pm.describe, port, service_id)
    except DockerUnavailable:
        info = {"port": port, "in_use": await asyncio.to_thread(pm.listening_locally, port), "containers": []}
    owner = next(
        (s for s in await repo.list_services() if s["host_port"] == port and s["service_id"] != service_id), None
    )
    reserved = port in settings.RESERVED_PORTS
    return ok({
        **info, "reserved": reserved, "registered_to": owner["service_name"] if owner else None,
        "available": not (info["in_use"] or reserved or owner),
    })