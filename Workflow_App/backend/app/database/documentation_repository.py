# app/database/documentation_repository.py
# One documentation record per workflow, keyed by the stable flow id.

import json

import asyncpg

from app.database.base import json_field, jsonable
from app.database.connection import get_pool
from app.documentation import DocumentationConflict

_COLS = "flow_id, content, test_cases, version, created_at, updated_at"


def _doc(row) -> dict:
    d = jsonable(row)
    d["content"] = json_field(d.get("content")) or {}
    d["test_cases"] = json_field(d.get("test_cases")) or []
    return d


async def get_flow_brief(flow_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT f.id, f.name, f.group_id, r.route_slug
            FROM flows f LEFT JOIN flow_routes r ON r.flow_id = f.id
            WHERE f.id = $1
            """,
            flow_id,
        )
    return dict(row) if row else None


async def get_documentation(flow_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_COLS} FROM flow_documentation WHERE flow_id=$1", flow_id
        )
    return _doc(row) if row else None


async def create_documentation(flow_id: int, content: dict, test_cases: list) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                f"""
                INSERT INTO flow_documentation (flow_id, content, test_cases)
                VALUES ($1, $2, $3) RETURNING {_COLS}
                """,
                flow_id, json.dumps(content), json.dumps(test_cases),
            )
        except asyncpg.UniqueViolationError:
            raise DocumentationConflict(
                "Documentation already exists for this workflow. Reload to see it."
            )
        except asyncpg.ForeignKeyViolationError:
            return None
    return _doc(row)


async def update_documentation(
    flow_id: int, content: dict, test_cases: list, base_version: int
) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            UPDATE flow_documentation
            SET content=$2, test_cases=$3, version=version+1, updated_at=NOW()
            WHERE flow_id=$1 AND version=$4
            RETURNING {_COLS}
            """,
            flow_id, json.dumps(content), json.dumps(test_cases), base_version,
        )
        if row:
            return _doc(row)
        exists = await conn.fetchval("SELECT 1 FROM flow_documentation WHERE flow_id=$1", flow_id)
    if exists:
        raise DocumentationConflict(
            "This documentation was changed elsewhere since you opened it. Reload the latest version."
        )
    return None


async def delete_documentation(flow_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM flow_documentation WHERE flow_id=$1", flow_id)
    return result != "DELETE 0"