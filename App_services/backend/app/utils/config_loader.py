# app/utils/config_loader.py
# App_cofig.json <-> PostgreSQL.
#   * bootstrap: inserts projects/services that are MISSING from the database; never overwrites.
#   * export: writes the current database state back to App_cofig.json (recoverable backup).

import json
import os
import tempfile

from app.config.settings import settings
from app.database import repository as repo
from app.utils.errors import ApiError, ValidationFailed
from app.utils.logger import get_logger
from app.utils.validators import (
    find_cycle, normalize_service_keys, validate_project, validate_service,
)

log = get_logger("config")


def read_config_file() -> dict:
    path = settings.CONFIG_FILE
    if not path.is_file():
        log.warning("Config file not found: %s", path)
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.error("Config file is unreadable (%s): %s", path, exc)
        return {}
    return data if isinstance(data, dict) else {}


def parse_config(raw: dict) -> tuple[list, list]:
    projects, services = [], []
    for key, p in (raw or {}).items():
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or key)
        projects.append({
            "project_id": pid, "project_name": p.get("name") or pid, "project_path": p.get("path") or "",
            "description": p.get("description") or "", "enabled": p.get("enabled", True),
        })
        for skey, s in (p.get("services") or {}).items():
            if not isinstance(s, dict):
                continue
            d = normalize_service_keys(s)
            d.setdefault("service_id", f"{pid}_{skey}")
            d.setdefault("service_type", skey)
            d["project_id"] = pid
            services.append(d)
    return projects, services


async def bootstrap_from_file() -> dict:
    projects, services = parse_config(read_config_file())
    summary = {"projects_added": 0, "services_added": 0, "skipped_existing": 0, "errors": []}

    for p in projects:
        try:
            cleaned = validate_project(p, source="bootstrap")
            if await repo.insert_project_if_missing(cleaned):
                summary["projects_added"] += 1
                log.info("Registered project '%s' from config file.", cleaned["project_id"])
        except ApiError as exc:
            summary["errors"].append(f"project {p.get('project_id')}: {exc.message} {exc.details or ''}".strip())

    for d in services:
        sid = d.get("service_id")
        try:
            cleaned = validate_service(d, source="bootstrap")
            if await repo.get_service(cleaned["service_id"]):
                summary["skipped_existing"] += 1
                continue
            await repo.create_service(cleaned)
            summary["services_added"] += 1
            log.info("Registered service '%s' from config file.", sid)
        except ValidationFailed as exc:
            summary["errors"].append(f"service {sid}: {'; '.join(exc.details or [exc.message])}")
        except ApiError as exc:
            summary["errors"].append(f"service {sid}: {exc.message}")

    graph = {s["service_id"]: list(s["depends_on"]) for s in await repo.list_services()}
    cycle = find_cycle(graph)
    if cycle:
        summary["errors"].append("dependency cycle: " + " -> ".join(cycle))

    for line in summary["errors"]:
        log.error("Config bootstrap: %s", line)
    log.info(
        "Config bootstrap: +%d project(s), +%d service(s), %d already registered, %d error(s).",
        summary["projects_added"], summary["services_added"], summary["skipped_existing"], len(summary["errors"]),
    )
    return summary


def _service_to_json(s: dict) -> dict:
    out = {
        "id": s["service_id"], "name": s["service_name"], "type": s["service_type"], "path": s["project_path"],
        "runtime": s["runtime_type"], "host": s["host"], "bind_address": s["bind_address"],
        "port": s["host_port"], "container_port": s["container_port"], "protocol": s["protocol"],
        "health_check": s["health_check_path"], "container_name": s["container_name"],
        "docker_image": s["docker_image"], "dockerfile_path": s["dockerfile_path"],
        "compose_file_path": s["compose_file_path"], "enabled": s["enabled"],
        "auto_start": s["auto_start"], "auto_restart": s["auto_restart"],
        "depends_on": s["depends_on"], "env": s["env"],
        "start_command": s["start_command"], "install_command": s["install_command"],
        "start_period_seconds": s["start_period_seconds"],
    }
    return {k: v for k, v in out.items() if v is not None}


async def export_config() -> dict:
    projects, services = await repo.list_projects(), await repo.list_services()
    out = {}
    for p in projects:
        entry = {
            "id": p["project_id"], "name": p["project_name"], "path": p["project_path"],
            "description": p["description"], "enabled": p["enabled"], "services": {},
        }
        used = set()
        for s in (x for x in services if x["project_id"] == p["project_id"]):
            key, n = s["service_type"], 2
            while key in used:
                key, n = f"{s['service_type']}_{n}", n + 1
            used.add(key)
            entry["services"][key] = _service_to_json(s)
        out[p["project_id"]] = entry
    return out


async def write_export() -> bool:
    """Atomic write of the database state to App_cofig.json. Never raises."""
    try:
        data = await export_config()
        target = settings.CONFIG_FILE
        fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=".cfg_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not write config export: %s", exc)
        return False