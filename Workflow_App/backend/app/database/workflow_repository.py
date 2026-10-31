# app/database/workflow_repository.py

import json
import re

import asyncpg

from app.database.base import generate_route_slug, json_field
from app.database.connection import get_pool


_COPY_PREFIX = re.compile(r"^COPY_\d+_OF\s+")


def original_name(name: str) -> str:
    n = (name or "").strip()
    while _COPY_PREFIX.match(n):
        n = _COPY_PREFIX.sub("", n, count=1)
    return n or "Untitled Flow"


async def _next_copy_name(conn, source_name: str) -> str:
    base = original_name(source_name)
    n = await conn.fetchval(
        """
        INSERT INTO flow_copy_counters (base_name, copy_count) VALUES ($1, 1)
        ON CONFLICT (base_name) DO UPDATE SET copy_count = flow_copy_counters.copy_count + 1
        RETURNING copy_count
        """,
        base,
    )
    return f"COPY_{n}_OF {base}"


async def create_flow(name: str, group_id: str | None = None, copy_of: str | None = None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if copy_of is not None:
                name = await _next_copy_name(conn, copy_of)
            row = await conn.fetchrow(
                """
                INSERT INTO flows (name, nodes, edges, input_value, group_id)
                VALUES ($1, '[]', '[]', '', $2)
                RETURNING id
                """,
                name, group_id,
            )
            flow_id = row["id"]

            slug = generate_route_slug()
            for _ in range(5):
                try:
                    async with conn.transaction():
                        await conn.execute(
                            "INSERT INTO flow_routes (flow_id, route_slug) VALUES ($1, $2)",
                            flow_id, slug,
                        )
                    break
                except asyncpg.UniqueViolationError:
                    slug = generate_route_slug()
            else:
                raise RuntimeError("Failed to generate a unique flow route.")

    return {"flow_id": flow_id, "route_slug": slug, "name": name, "group_id": group_id}


async def set_flow_group(flow_id: int, group_id: str | None) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("UPDATE flows SET group_id=$1 WHERE id=$2", group_id, flow_id)
    return result != "UPDATE 0"

async def get_route_for_flow(flow_id: int) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT route_slug FROM flow_routes WHERE flow_id=$1", flow_id
        )
    return row["route_slug"] if row else None


def _flow_dict(row) -> dict:
    d = dict(row)
    d["nodes"] = d["nodes"] if isinstance(d["nodes"], list) else json.loads(d["nodes"])
    d["edges"] = d["edges"] if isinstance(d["edges"], list) else json.loads(d["edges"])
    return d


async def get_flow_by_route(route_slug: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT f.*, r.route_slug
            FROM flows f
            JOIN flow_routes r ON r.flow_id = f.id
            WHERE r.route_slug = $1
            """,
            route_slug,
        )
    return _flow_dict(row) if row else None


async def save_flow(flow_id: int | None, name: str, nodes: list, edges: list, input_value: str) -> int:
    pool = await get_pool()
    nodes_json = json.dumps(nodes)
    edges_json = json.dumps(edges)

    async with pool.acquire() as conn:
        if flow_id:
            await conn.execute(
                """
                UPDATE flows
                SET name=$1, nodes=$2, edges=$3, input_value=$4, updated_at=NOW()
                WHERE id=$5
                """,
                name, nodes_json, edges_json, input_value, flow_id,
            )
            return flow_id
        else:
            created = await create_flow(name)
            return created["flow_id"]


async def get_all_flows() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id, f.name, f.execution_count, f.last_executed_at,
                   f.created_at, f.updated_at, f.group_id, r.route_slug
            FROM flows f
            LEFT JOIN flow_routes r ON r.flow_id = f.id
            ORDER BY f.updated_at DESC
            """
        )
    return [dict(r) for r in rows]


async def get_flow(flow_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT f.*, r.route_slug
            FROM flows f
            LEFT JOIN flow_routes r ON r.flow_id = f.id
            WHERE f.id=$1
            """,
            flow_id,
        )
    return _flow_dict(row) if row else None


async def delete_flow(flow_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM flows WHERE id=$1", flow_id)
    return result != "DELETE 0"