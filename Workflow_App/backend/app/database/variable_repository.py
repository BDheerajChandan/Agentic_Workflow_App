# app/database/variable_repository.py

import asyncpg

from app.database.base import jsonable
from app.database.connection import get_pool
from app.variables import VariableError

_VARIABLE_SELECT = """
    SELECT v.variable_id, v.name, v.visibility, v.flow_id,
           f.name AS workflow_name, v.created_at, v.updated_at
    FROM variables v
    LEFT JOIN flows f ON f.id = v.flow_id
"""


def _clean_variable_input(name, visibility, flow_id):
    name = (name or "").strip()
    if not name:
        raise VariableError("Variable name is required.")
    if len(name) > 64:
        raise VariableError("Variable name must be 64 characters or fewer.")
    visibility = (visibility or "").strip().lower()
    if visibility not in ("public", "private"):
        raise VariableError("Visibility must be 'public' or 'private'.")
    if visibility == "public":
        flow_id = None
    elif flow_id is None:
        raise VariableError("Select a workflow for a private variable.")
    return name, visibility, flow_id


def _duplicate_variable_error(name: str, visibility: str) -> VariableError:
    scope = "this workflow" if visibility == "private" else "the public scope"
    return VariableError(f"A variable named '{name}' already exists in {scope}.", 409)


async def get_variable(variable_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_VARIABLE_SELECT + " WHERE v.variable_id = $1", variable_id)
    return jsonable(row) if row else None


async def list_variables(flow_id: int | None = None) -> list[dict]:
    """flow_id=None -> every variable. flow_id=N -> public + private of workflow N."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if flow_id is None:
            rows = await conn.fetch(_VARIABLE_SELECT + " ORDER BY v.visibility, v.name")
        else:
            rows = await conn.fetch(
                _VARIABLE_SELECT
                + " WHERE v.visibility = 'public' OR v.flow_id = $1 ORDER BY v.visibility, v.name",
                flow_id,
            )
    return [jsonable(r) for r in rows]


async def create_variable(name: str, visibility: str, flow_id: int | None = None) -> dict:
    name, visibility, flow_id = _clean_variable_input(name, visibility, flow_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        if flow_id is not None and not await conn.fetchval(
            "SELECT 1 FROM flows WHERE id=$1", flow_id
        ):
            raise VariableError("Workflow not found for this private variable.", 404)
        try:
            variable_id = await conn.fetchval(
                """
                INSERT INTO variables (name, visibility, flow_id)
                VALUES ($1, $2, $3)
                RETURNING variable_id
                """,
                name, visibility, flow_id,
            )
        except asyncpg.UniqueViolationError:
            raise _duplicate_variable_error(name, visibility)
    return await get_variable(variable_id)


async def update_variable(
    variable_id: int,
    name: str | None = None,
    visibility: str | None = None,
    flow_id: int | None = None,
) -> dict | None:
    current = await get_variable(variable_id)
    if not current:
        return None
    name, visibility, flow_id = _clean_variable_input(
        name if name is not None else current["name"],
        visibility if visibility is not None else current["visibility"],
        flow_id if flow_id is not None else current["flow_id"],
    )
    pool = await get_pool()
    async with pool.acquire() as conn:
        if flow_id is not None and not await conn.fetchval(
            "SELECT 1 FROM flows WHERE id=$1", flow_id
        ):
            raise VariableError("Workflow not found for this private variable.", 404)
        try:
            await conn.execute(
                """
                UPDATE variables
                SET name=$1, visibility=$2, flow_id=$3, updated_at=NOW()
                WHERE variable_id=$4
                """,
                name, visibility, flow_id, variable_id,
            )
        except asyncpg.UniqueViolationError:
            raise _duplicate_variable_error(name, visibility)
    return await get_variable(variable_id)


async def delete_variable(variable_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM variables WHERE variable_id=$1", variable_id)
    return result != "DELETE 0"