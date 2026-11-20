# app/routers/config_router.py
# PostgreSQL is the source of truth; App_cofig.json is the bootstrap source and recoverable export.

from fastapi import APIRouter

from app.config.settings import settings
from app.control.service_manager import manager
from app.schemas.service_schema import ok
from app.utils.config_loader import bootstrap_from_file, export_config, write_export
from app.utils.logger import audit

router = APIRouter(prefix="/api/config", tags=["config"])


def _public_settings() -> dict:
    s = settings
    return {
        "app_env": s.APP_ENV, "api_port": s.API_PORT, "dashboard_port": s.DASHBOARD_PORT,
        "docker_network": s.DOCKER_NETWORK, "projects_root": str(s.PROJECTS_ROOT),
        "host_projects_root": s.HOST_PROJECTS_ROOT, "config_file": str(s.CONFIG_FILE),
        "monitor_interval_seconds": s.MONITOR_INTERVAL, "reconcile_on_start": s.RECONCILE_ON_START,
        "allow_custom_commands": s.ALLOW_CUSTOM_COMMANDS, "allow_remote_bind": s.ALLOW_REMOTE_BIND,
        "running_in_docker": s.RUNNING_IN_DOCKER, "auth_required": bool(s.ADMIN_TOKEN),
        "db_schema": s.DB_SCHEMA,
    }


@router.get("")
async def get_config():
    return ok({
        "settings": _public_settings(),
        "config_file_exists": settings.CONFIG_FILE.is_file(),
        "database": await export_config(),
    })


@router.post("/reload")
async def reload_config():
    """Re-read App_cofig.json and register projects/services that are missing. Never overwrites existing records."""
    summary = await bootstrap_from_file()
    manager.invalidate()
    audit("config_reload", None, added=summary["services_added"], errors=len(summary["errors"]))
    return ok(
        summary,
        f"Added {summary['projects_added']} project(s) and {summary['services_added']} service(s); "
        f"{summary['skipped_existing']} already registered.",
    )


@router.get("/export")
async def export(write: bool = False):
    data = await export_config()
    written = await write_export() if write else None
    return ok(data, "Configuration exported." + (" App_cofig.json updated." if written else ""), file_written=written)