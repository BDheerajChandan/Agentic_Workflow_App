# app/database/hitl_repository.py
# Durable paused runs (Time Operation waits, HITL interactions).

import json

from app.database.base import deleted_count, json_field, jsonable
from app.database.connection import get_pool

_PAUSE_JSON = ("state", "variables", "nodes", "edges", "info")


def _pause_row(row) -> dict:
    d = dict(row)
    for key in _PAUSE_JSON:
        d[key] = json_field(d.get(key))
    return d


async def create_pause(
    flow_id: int, node_id: str, operation: str, state, variables, nodes, edges,
    input_value: str, resume_at, hold_expires_at, on_timeout: str, info,
) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO paused_runs
                (flow_id, node_id, operation, state, variables, nodes, edges, input,
                 resume_at, hold_expires_at, on_timeout, info)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING pause_id
            """,
            flow_id, node_id, operation,
            json.dumps(state or {}), json.dumps(variables or {}),
            json.dumps(nodes or []), json.dumps(edges or []),
            input_value, resume_at, hold_expires_at, on_timeout, json.dumps(info or {}),
        )


async def get_pause(pause_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT pause_id, flow_id, node_id, operation, status, resume_at,
                   hold_expires_at, on_timeout, error, created_at, finished_at
            FROM paused_runs WHERE pause_id=$1
            """,
            pause_id,
        )
    return jsonable(row) if row else None


async def get_pause_detail(pause_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT pause_id, flow_id, node_id, operation, status, nodes, info, input, created_at
            FROM paused_runs WHERE pause_id=$1
            """,
            pause_id,
        )
    if not row:
        return None
    d = dict(row)
    for key in ("nodes", "info"):
        d[key] = json_field(d.get(key))
    return d


async def list_pauses(flow_id: int, node_id: str | None = None, pending_only: bool = True) -> list[dict]:
    pool = await get_pool()
    clauses = ["flow_id=$1"]
    args: list = [flow_id]
    if node_id:
        args.append(node_id)
        clauses.append(f"node_id=${len(args)}")
    if pending_only:
        clauses.append("status='pending'")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT pause_id, flow_id, node_id, operation, status, resume_at,
                   hold_expires_at, on_timeout, error, created_at, finished_at
            FROM paused_runs WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC LIMIT 100
            """,
            *args,
        )
    return [jsonable(r) for r in rows]


async def list_pending_hitl(flow_id: int) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT pause_id, node_id, info FROM paused_runs
            WHERE flow_id=$1 AND operation='hitl' AND status='pending'
            ORDER BY created_at
            """,
            flow_id,
        )
    out = []
    for r in rows:
        info = json_field(r["info"]) or {}
        request = info.get("hitl") or {}
        out.append({
            "pause_id": r["pause_id"],
            "node_id": r["node_id"],
            "request": {**request, "pause_id": r["pause_id"]},
        })
    return out


async def claim_pause(pause_id: int) -> dict | None:
    """Atomically move pending -> resuming. Returns None when already claimed (no duplicate execution)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE paused_runs SET status='resuming', claimed_at=NOW()
            WHERE pause_id=$1 AND status='pending'
            RETURNING *
            """,
            pause_id,
        )
    return _pause_row(row) if row else None


async def finish_pause(pause_id: int, status: str, error: str | None = None) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE paused_runs SET status=$1, error=$2, finished_at=NOW() WHERE pause_id=$3",
            status, error, pause_id,
        )


async def cancel_pause(pause_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE paused_runs SET status='cancelled', finished_at=NOW()
            WHERE pause_id=$1 AND status='pending'
            """,
            pause_id,
        )
    return result != "UPDATE 0"


async def due_pause_ids() -> list[int]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT pause_id FROM paused_runs
            WHERE status='pending' AND resume_at IS NOT NULL AND resume_at <= NOW()
            ORDER BY resume_at
            """
        )
    return [r["pause_id"] for r in rows]


async def expired_hold_rows() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT pause_id, on_timeout FROM paused_runs
            WHERE status='pending' AND resume_at IS NULL
              AND hold_expires_at IS NOT NULL AND hold_expires_at <= NOW()
            """
        )
    return [dict(r) for r in rows]


async def fail_interrupted_pauses() -> int:
    """A resume that was running when the server stopped must not be replayed."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE paused_runs
            SET status='failed', error='Interrupted by server restart', finished_at=NOW()
            WHERE status='resuming'
            """
        )
    return deleted_count(result)