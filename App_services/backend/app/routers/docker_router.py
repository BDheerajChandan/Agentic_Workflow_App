# app/routers/docker_router.py
# Read-only Docker visibility. Browsers never get Docker access: only these fixed, validated queries.

import asyncio
import re
from typing import Literal

from fastapi import APIRouter

from app.control import container_manager as cm
from app.control.docker_manager import docker_mgr
from app.schemas.service_schema import ok
from app.utils.errors import ValidationFailed

router = APIRouter(prefix="/api/docker", tags=["docker"])

_CONTAINER_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$")


@router.get("/status")
async def docker_status():
    st = await asyncio.to_thread(docker_mgr.status)
    return ok(st, "Docker is connected." if st["connected"] else (st["error"] or "Docker is not reachable."))


@router.get("/info")
async def docker_info():
    return ok(await asyncio.to_thread(docker_mgr.info))


@router.get("/version")
async def docker_version():
    return ok(await asyncio.to_thread(docker_mgr.version))


@router.get("/containers")
async def list_containers(scope: Literal["managed", "all"] = "managed"):
    items = await asyncio.to_thread(cm.list_containers, scope)
    return ok(items, f"{len(items)} container(s) ({scope}).")


@router.get("/containers/{container_id}")
async def container_details(container_id: str):
    if not _CONTAINER_ID.match(container_id):
        raise ValidationFailed("Container id is invalid.")
    return ok(await asyncio.to_thread(cm.inspect_managed, container_id))