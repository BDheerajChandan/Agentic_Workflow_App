# app/routers/service_router.py
# Service registry CRUD, lifecycle, monitoring and global controls.
# Route order matters: fixed paths (start-all, stop-all, refresh) come before /services/{service_id}.

from fastapi import APIRouter, Query

from app.control.service_manager import manager
from app.database import repository as repo
from app.schemas.service_schema import ServiceCreate, ServiceUpdate, ok
from app.utils.config_loader import write_export
from app.utils.errors import Conflict, DockerUnavailable, NotFound, ValidationFailed
from app.utils.logger import audit
from app.utils.validators import check_conflicts, slugify_id, validate_project, validate_service

router = APIRouter(prefix="/api", tags=["services"])


def _action(result: dict) -> dict:
    return ok(result["service"], result["message"], in_progress=result["in_progress"])


async def _resolve_project(payload: ServiceCreate) -> tuple[str, dict | None]:
    """Existing project id, or a validated new project to create in the same transaction."""
    if payload.project_id:
        if await repo.get_project(payload.project_id):
            return payload.project_id, None
        if not payload.project_name:
            raise NotFound("Project not found. Select an existing project or enter a new project name.")
        pid = payload.project_id
    elif payload.project_name:
        pid = slugify_id(payload.project_name)
        if await repo.get_project(pid):
            raise Conflict(
                f"A project with ID '{pid}' already exists. Select it from the list instead of creating a new one."
            )
    else:
        raise ValidationFailed("Select an existing project or enter a new project name.")
    project = validate_project({
        "project_id": pid, "project_name": payload.project_name, "project_path": payload.project_root or "",
        "description": "", "enabled": True,
    })
    return pid, project


# ─── list / global controls ───────────────────────────────────────────────────

@router.get("/services")
async def list_services(refresh: bool = False):
    data = await manager.list_views(force=refresh)
    return ok(
        data["services"], f"{len(data['services'])} service(s).",
        summary=data["summary"], docker=data["docker"], refreshed_at=data["refreshed_at"],
    )


@router.post("/services/start-all", status_code=202)
async def start_all():
    job = await manager.start_all()
    return ok(job, "Start All started. Services start in dependency order.", job_id=job["job_id"])


@router.post("/services/stop-all", status_code=202)
async def stop_all():
    job = await manager.stop_all()
    return ok(job, "Stop All started. Dependent services stop first.", job_id=job["job_id"])


@router.post("/services/refresh")
async def refresh():
    data = await manager.list_views(force=True)
    return ok(
        data["services"], "Status refreshed.",
        summary=data["summary"], docker=data["docker"], refreshed_at=data["refreshed_at"],
    )


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    return ok(manager.get_job(job_id))


# ─── registration ─────────────────────────────────────────────────────────────

@router.post("/services", status_code=201)
async def register_service(payload: ServiceCreate):
    pid, new_project = await _resolve_project(payload)
    data = payload.model_dump(exclude={"project_name", "project_root"})
    data["project_id"] = pid
    cleaned = validate_service(data, source="api")
    await check_conflicts(cleaned)
    await repo.create_service(cleaned, new_project=new_project)
    exported = await write_export()
    audit("register", cleaned["service_id"], project=pid, new_project=bool(new_project))
    manager.invalidate()
    view = await manager.get_view(cleaned["service_id"], force=True)
    return ok(view, "Service registered. It is not running yet. Click Run to start it.", config_exported=exported)


@router.get("/services/{service_id}")
async def get_service(service_id: str):
    return ok(await manager.get_view(service_id))


@router.put("/services/{service_id}")
async def update_service(service_id: str, payload: ServiceUpdate):
    existing = await repo.get_service(service_id)
    if not existing:
        raise NotFound("Service not found.")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise ValidationFailed("No changes were supplied.")
    if changes.get("project_id") and changes["project_id"] != existing["project_id"]:
        if not await repo.get_project(changes["project_id"]):
            raise NotFound("Project not found.")

    commands_changed = any(
        (changes.get(k) or None) != (existing.get(k) or None)
        for k in ("start_command", "install_command") if k in changes
    )
    merged = {**existing, **changes, "service_id": service_id}
    cleaned = validate_service(merged, source="api" if commands_changed else "bootstrap")
    await check_conflicts(cleaned, existing_id=service_id)

    if cleaned["container_name"] != existing["container_name"] and await manager.container_exists(existing):
        raise Conflict(
            "A container already exists under the current name. Remove it first "
            "(POST /api/services/{id}/remove-container) or keep the current container name."
        )

    await repo.update_service(service_id, cleaned)
    exported = await write_export()
    audit("update", service_id, fields=",".join(sorted(changes)))
    manager.invalidate()
    view = await manager.get_view(service_id, force=True)
    message = "Configuration saved."
    if view["pending_recreate"]:
        message += " Restart the service to apply the changes (the container will be recreated)."
    return ok(view, message, config_exported=exported)


@router.delete("/services/{service_id}")
async def delete_service(
    service_id: str,
    remove_container: bool = True,
    volumes: bool = False,
    force: bool = False,
):
    service = await repo.get_service(service_id)
    if not service:
        raise NotFound("Service not found.")
    dependents = [s["service_name"] for s in await repo.list_services() if service_id in s["depends_on"]]
    if dependents:
        raise Conflict(f"Other services depend on '{service['service_name']}': {', '.join(dependents)}.")

    removed, warning = False, None
    if remove_container:
        try:
            removed = (await manager.remove_container(service_id, volumes=volumes))["removed"]
        except (DockerUnavailable, Conflict) as exc:
            if not force:
                raise
            warning = f"Container was not removed: {exc.message}"

    await repo.delete_service(service_id)
    manager.forget(service_id)
    exported = await write_export()
    audit("delete", service_id, container_removed=removed)
    message = f"'{service['service_name']}' was deleted."
    return ok({"service_id": service_id, "container_removed": removed, "warning": warning}, message,
              config_exported=exported)


# ─── lifecycle ────────────────────────────────────────────────────────────────

@router.post("/services/{service_id}/start")
async def start_service(service_id: str, wait: bool = True):
    return _action(await manager.start(service_id, wait=wait))


@router.post("/services/{service_id}/stop")
async def stop_service(service_id: str):
    return _action(await manager.stop(service_id))


@router.post("/services/{service_id}/restart")
async def restart_service(service_id: str):
    return _action(await manager.restart(service_id))


@router.post("/services/{service_id}/remove-container")
async def remove_service_container(service_id: str, volumes: bool = False):
    result = await manager.remove_container(service_id, volumes=volumes)
    return ok(result, result["message"])


# ─── monitoring ───────────────────────────────────────────────────────────────

@router.get("/services/{service_id}/status")
async def service_status(service_id: str):
    return ok(await manager.status(service_id))


@router.get("/services/{service_id}/health")
async def service_health(service_id: str):
    return ok(await manager.health(service_id))


@router.get("/services/{service_id}/logs")
async def service_logs(service_id: str, tail: int = Query(200, ge=1, le=5000)):
    return ok(await manager.logs(service_id, tail))


@router.get("/services/{service_id}/details")
async def service_details(service_id: str):
    return ok(await manager.details(service_id))


@router.get("/services/{service_id}/events")
async def service_events(service_id: str, limit: int = Query(50, ge=1, le=500)):
    if not await repo.get_service(service_id):
        raise NotFound("Service not found.")
    return ok(await repo.list_events(service_id, limit))