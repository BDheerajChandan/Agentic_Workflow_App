# app/database/group_repository.py

import uuid

from app.database.base import jsonable
from app.database.connection import get_pool

_SELECT = """
    SELECT g.group_id, g.name, g.created_at, g.updated_at,
           (SELECT COUNT(*) FROM flows f WHERE f.group_id = g.group_id) AS flow_count
    FROM flow_groups g
"""


async def list_groups() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SELECT + " ORDER BY g.created_at")
    return [jsonable(r) for r in rows]


async def get_group(group_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_SELECT + " WHERE g.group_id=$1", str(group_id))
    return jsonable(row) if row else None


async def create_group(name: str) -> dict:
    pool = await get_pool()
    gid = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute("INSERT INTO flow_groups (group_id, name) VALUES ($1, $2)", gid, name)
    return await get_group(gid)


async def rename_group(group_id: str, name: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE flow_groups SET name=$1, updated_at=NOW() WHERE group_id=$2", name, str(group_id)
        )
    return await get_group(group_id) if result != "UPDATE 0" else None


async def delete_group(group_id: str) -> int | None:
    """Deletes the group; its flows become ungrouped (FK ON DELETE SET NULL). Returns moved-flow count."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            moved = await conn.fetchval("SELECT COUNT(*) FROM flows WHERE group_id=$1", str(group_id))
            result = await conn.execute("DELETE FROM flow_groups WHERE group_id=$1", str(group_id))
    return int(moved) if result != "DELETE 0" else None