# app/routers/project_router.py

from fastapi import APIRouter

from app.control.service_manager import manager
from app.database import repository as repo
from app.schemas.service_schema import ProjectCreate, ProjectUpdate, ok
from app.utils.config_loader import write_export
from app.utils.errors import Conflict, DockerUnavailable, NotFound
from app.utils.logger import audit
from app.utils.validators import slugify_id, validate_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
async def list_projects():
    projects = await repo.list_projects()
    return ok(projects, f"{len(projects)} project(s).")


@router.post("", status_code=201)
async def create_project(payload: ProjectCreate):
    data = payload.model_dump()
    data["project_id"] = payload.project_id or slugify_id(payload.project_name)
    cleaned = validate_project(data)
    project = await repo.create_project(cleaned)
    exported = await write_export()
    audit("project_create", None, project=cleaned["project_id"])
    return ok(project, "Project registered.", config_exported=exported)


@router.get("/{project_id}")
async def get_project(project_id: str):
    project = await repo.get_project(project_id)
    if not project:
        raise NotFound("Project not found.")
    return ok({**project, "services": await repo.list_services(project_id)})


@router.put("/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate):
    existing = await repo.get_project(project_id)
    if not existing:
        raise NotFound("Project not found.")
    merged = {
        "project_id": project_id, "project_name": existing["project_name"],
        "project_path": existing["project_path"], "description": existing["description"],
        "enabled": existing["enabled"], **payload.model_dump(exclude_unset=True),
    }
    cleaned = validate_project(merged)
    project = await repo.update_project(project_id, cleaned)
    exported = await write_export()
    audit("project_update", None, project=project_id)
    manager.invalidate()
    return ok(project, "Project updated.", config_exported=exported)


@router.delete("/{project_id}")
async def delete_project(project_id: str, cascade: bool = False, volumes: bool = False, force: bool = False):
    project = await repo.get_project(project_id)
    if not project:
        raise NotFound("Project not found.")
    services = await repo.list_services(project_id)
    if services and not cascade:
        raise Conflict(
            f"Project '{project['project_name']}' still has {len(services)} service(s). "
            "Delete them first, or retry with cascade=true."
        )
    ids = {s["service_id"] for s in services}
    outside = [
        s["service_name"] for s in await repo.list_services()
        if s["service_id"] not in ids and ids & set(s["depends_on"])
    ]
    if outside:
        raise Conflict(f"Services in other projects depend on this project's services: {', '.join(outside)}.")

    for s in services:
        try:
            await manager.remove_container(s["service_id"], volumes=volumes)
        except (DockerUnavailable, Conflict) as exc:
            if not force:
                raise
            audit("delete_container_skipped", s["service_id"], outcome="warning", reason=exc.code)

    await repo.delete_project(project_id)
    for sid in ids:
        manager.forget(sid)
    exported = await write_export()
    audit("project_delete", None, project=project_id, services=len(ids))
    return ok({"project_id": project_id, "services_deleted": len(ids)},
              f"Project '{project['project_name']}' deleted.", config_exported=exported)