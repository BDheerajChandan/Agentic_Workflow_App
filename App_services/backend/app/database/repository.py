# app/database/repository.py
# All SQL for projects, services, runtime state and events.

import asyncpg

from app.database.connection import get_pool
from app.database.models import PROJECT_FIELDS, RUNTIME_FIELDS, SERVICE_FIELDS
from app.utils.errors import Conflict, NotFound


def _row(row) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


def _conflict(exc: asyncpg.UniqueViolationError) -> Conflict:
    name = getattr(exc, "constraint_name", "") or ""
    if "host_port" in name:
        return Conflict("That host port is already assigned to another service.")
    if "container_name" in name:
        return Conflict("That container name is already used by another service.")
    if "projects" in name:
        return Conflict("A project with that ID already exists.")
    return Conflict("A service with that ID already exists.")


# ─── projects ─────────────────────────────────────────────────────────────────

_PROJECT_SELECT = f"""
    SELECT {', '.join('p.' + c for c in PROJECT_FIELDS)}, p.created_at, p.updated_at,
           (SELECT COUNT(*) FROM services s WHERE s.project_id = p.project_id) AS service_count
    FROM projects p
"""


async def list_projects() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_PROJECT_SELECT + " ORDER BY p.created_at, p.project_id")
    return [_row(r) for r in rows]


async def get_project(project_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_PROJECT_SELECT + " WHERE p.project_id=$1", project_id)
    return _row(row)


async def _insert_project(conn, data: dict, if_missing: bool = False):
    cols = PROJECT_FIELDS
    sql = (
        f"INSERT INTO projects ({', '.join(cols)}) VALUES ({', '.join(f'${i}' for i in range(1, len(cols) + 1))})"
        + (" ON CONFLICT (project_id) DO NOTHING" if if_missing else "")
        + " RETURNING project_id"
    )
    return await conn.fetchval(sql, *[data[c] for c in cols])


async def create_project(data: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            await _insert_project(conn, data)
        except asyncpg.UniqueViolationError as exc:
            raise _conflict(exc)
    return await get_project(data["project_id"])


async def insert_project_if_missing(data: dict) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await _insert_project(conn, data, if_missing=True) is not None


async def update_project(project_id: str, data: dict) -> dict:
    pool = await get_pool()
    cols = [c for c in PROJECT_FIELDS if c != "project_id"]
    sets = ", ".join(f"{c}=${i}" for i, c in enumerate(cols, 2))
    async with pool.acquire() as conn:
        found = await conn.fetchval(
            f"UPDATE projects SET {sets}, updated_at=NOW() WHERE project_id=$1 RETURNING project_id",
            project_id, *[data[c] for c in cols],
        )
    if not found:
        raise NotFound("Project not found.")
    return await get_project(project_id)


async def delete_project(project_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM projects WHERE project_id=$1", project_id)
    return result != "DELETE 0"


# ─── services ─────────────────────────────────────────────────────────────────

_SERVICE_COLS = ", ".join(SERVICE_FIELDS) + ", created_at, updated_at"


async def list_services(project_id: str | None = None) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if project_id:
            rows = await conn.fetch(
                f"SELECT {_SERVICE_COLS} FROM services WHERE project_id=$1 ORDER BY created_at, service_id",
                project_id,
            )
        else:
            rows = await conn.fetch(f"SELECT {_SERVICE_COLS} FROM services ORDER BY created_at, service_id")
    return [_row(r) for r in rows]


async def get_service(service_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f"SELECT {_SERVICE_COLS} FROM services WHERE service_id=$1", service_id)
    return _row(row)


async def _insert_service(conn, data: dict) -> None:
    cols = SERVICE_FIELDS
    await conn.execute(
        f"INSERT INTO services ({', '.join(cols)}) "
        f"VALUES ({', '.join(f'${i}' for i in range(1, len(cols) + 1))})",
        *[data[c] for c in cols],
    )
    await conn.execute(
        "INSERT INTO service_runtime (service_id) VALUES ($1) ON CONFLICT (service_id) DO NOTHING",
        data["service_id"],
    )
    await conn.execute(
        "INSERT INTO service_events (service_id, event_type, event_message) VALUES ($1, 'registered', $2)",
        data["service_id"], f"Registered '{data['service_name']}'",
    )


async def create_service(data: dict, new_project: dict | None = None) -> dict:
    """One transaction: optional new project + service + runtime row + registration event."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            async with conn.transaction():
                if new_project:
                    await _insert_project(conn, new_project)
                await _insert_service(conn, data)
        except asyncpg.UniqueViolationError as exc:
            raise _conflict(exc)
        except asyncpg.ForeignKeyViolationError:
            raise NotFound("Project not found.")
    return await get_service(data["service_id"])


async def update_service(service_id: str, data: dict) -> dict:
    pool = await get_pool()
    cols = [c for c in SERVICE_FIELDS if c != "service_id"]
    sets = ", ".join(f"{c}=${i}" for i, c in enumerate(cols, 2))
    async with pool.acquire() as conn:
        try:
            async with conn.transaction():
                found = await conn.fetchval(
                    f"UPDATE services SET {sets}, updated_at=NOW() WHERE service_id=$1 RETURNING service_id",
                    service_id, *[data[c] for c in cols],
                )
                if found:
                    await conn.execute(
                        "INSERT INTO service_events (service_id, event_type, event_message) VALUES ($1,'updated',$2)",
                        service_id, "Configuration updated",
                    )
        except asyncpg.UniqueViolationError as exc:
            raise _conflict(exc)
        except asyncpg.ForeignKeyViolationError:
            raise NotFound("Project not found.")
    if not found:
        raise NotFound("Service not found.")
    return await get_service(service_id)


async def delete_service(service_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM services WHERE service_id=$1", service_id)
    return result != "DELETE 0"


# ─── runtime state ────────────────────────────────────────────────────────────

async def get_runtime(service_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM service_runtime WHERE service_id=$1", service_id)
    return _row(row)


async def list_runtimes() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM service_runtime")
    return {r["service_id"]: _row(r) for r in rows}


async def set_runtime(service_id: str, **fields) -> None:
    """Upsert only the given runtime columns (callers write on state change, not on every poll)."""
    cols = [c for c in fields if c in RUNTIME_FIELDS]
    if not cols:
        return
    pool = await get_pool()
    names = ", ".join(cols)
    marks = ", ".join(f"${i}" for i in range(2, len(cols) + 2))
    updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols)
    async with pool.acquire() as conn:
        await conn.execute(
            f"INSERT INTO service_runtime (service_id, {names}) VALUES ($1, {marks}) "
            f"ON CONFLICT (service_id) DO UPDATE SET {updates}, updated_at=NOW()",
            service_id, *[fields[c] for c in cols],
        )


# ─── events ───────────────────────────────────────────────────────────────────

async def add_event(service_id: str, event_type: str, message: str = "") -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                "INSERT INTO service_events (service_id, event_type, event_message) VALUES ($1,$2,$3)",
                service_id, event_type, message[:2000],
            )
        except asyncpg.ForeignKeyViolationError:
            pass  # service was deleted meanwhile


async def list_events(service_id: str, limit: int = 50) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT event_id, service_id, event_type, event_message, created_at FROM service_events "
            "WHERE service_id=$1 ORDER BY created_at DESC, event_id DESC LIMIT $2",
            service_id, max(1, min(limit, 500)),
        )
    return [_row(r) for r in rows]