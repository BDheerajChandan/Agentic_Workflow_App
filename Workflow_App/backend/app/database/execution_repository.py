# app/database/execution_repository.py
# Execution log + workflow run history.

import json

from app.database.base import deleted_count, json_field, jsonable
from app.database.connection import get_pool


async def record_execution(flow_id: int, input_value: str, result: dict) -> None:
    pool = await get_pool()
    result_json = json.dumps(result)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO executions (flow_id, input, result) VALUES ($1, $2, $3)",
            flow_id, input_value, result_json,
        )
        await conn.execute(
            """
            UPDATE flows
            SET execution_count = execution_count + 1,
                last_executed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            """,
            flow_id,
        )


async def get_executions(flow_id: int) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM executions WHERE flow_id=$1 ORDER BY executed_at DESC",
            flow_id,
        )
    out = []
    for r in rows:
        d = dict(r)
        d["result"] = d["result"] if isinstance(d["result"], dict) else json.loads(d["result"])
        out.append(d)
    return out


async def record_run(
    flow_id: int,
    status: str,
    started_at,
    ended_at,
    input_value: str,
    result,
    node_states: list,
    variables: dict,
    error: str | None = None,
) -> int | None:
    duration_ms = max(0, int((ended_at - started_at).total_seconds() * 1000))
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT name FROM flows WHERE id=$1 FOR UPDATE", flow_id
            )
            if row is None:
                return None
            run_number = await conn.fetchval(
                "SELECT COALESCE(MAX(run_number), 0) + 1 FROM workflow_runs WHERE flow_id=$1",
                flow_id,
            )
            return await conn.fetchval(
                """
                INSERT INTO workflow_runs
                    (flow_id, run_number, workflow_name, status, started_at, ended_at,
                     duration_ms, input, result, node_states, variables, error)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING run_id
                """,
                flow_id, run_number, row["name"], status, started_at, ended_at, duration_ms,
                input_value, json.dumps(result), json.dumps(node_states or []),
                json.dumps(variables or {}), error,
            )


async def list_runs(flow_id: int, limit: int = 100) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT run_id, run_number, flow_id, workflow_name, status,
                   started_at, ended_at, duration_ms, error
            FROM workflow_runs
            WHERE flow_id=$1
            ORDER BY started_at DESC, run_id DESC
            LIMIT $2
            """,
            flow_id, limit,
        )
    return [jsonable(r) for r in rows]


async def get_run(flow_id: int, run_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM workflow_runs WHERE flow_id=$1 AND run_id=$2",
            flow_id, run_id,
        )
    if not row:
        return None
    d = jsonable(row)
    for key in ("result", "node_states", "variables"):
        d[key] = json_field(d.get(key))
    return d


async def delete_run(flow_id: int, run_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM workflow_runs WHERE flow_id=$1 AND run_id=$2",
            flow_id, run_id,
        )
    return result != "DELETE 0"


async def delete_all_runs(flow_id: int) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM workflow_runs WHERE flow_id=$1", flow_id
        )
    return deleted_count(result)