# app/db.py

import os
import json
import secrets
import asyncpg
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

_pool: asyncpg.Pool | None = None
_db_ensured = False


async def _ensure_database_exists() -> None:
    global _db_ensured
    if _db_ensured:
        return
    sys_conn = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        database="postgres",
    )
    try:
        exists = await sys_conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", DB_NAME
        )
        if not exists:
            safe_name = DB_NAME.replace('"', '""')
            await sys_conn.execute(f'CREATE DATABASE "{safe_name}"')
            print(f"✅ Database '{DB_NAME}' created.")
        else:
            print(f"ℹ️  Database '{DB_NAME}' already exists — reusing.")
    finally:
        await sys_conn.close()
    _db_ensured = True


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        await _ensure_database_exists()
        _pool = await asyncpg.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            min_size=2,
            max_size=10,
        )
    return _pool


async def init_db() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS flows (
                id            SERIAL PRIMARY KEY,
                name          TEXT NOT NULL,
                nodes         JSONB NOT NULL DEFAULT '[]',
                edges         JSONB NOT NULL DEFAULT '[]',
                input_value   TEXT NOT NULL DEFAULT '',
                execution_count  INTEGER NOT NULL DEFAULT 0,
                last_executed_at TIMESTAMPTZ,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS executions (
                id         SERIAL PRIMARY KEY,
                flow_id    INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
                input      TEXT,
                result     JSONB,
                executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS flow_routes (
                id          SERIAL PRIMARY KEY,
                flow_id     INTEGER NOT NULL UNIQUE REFERENCES flows(id) ON DELETE CASCADE,
                route_slug  TEXT NOT NULL UNIQUE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

    print("✅ Database tables verified / created.")


def _generate_route_slug() -> str:
    return secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:11]


# ─── flow + route helpers ──────────────────────────────────────────────────────

async def create_flow(name: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO flows (name, nodes, edges, input_value)
                VALUES ($1, '[]', '[]', '')
                RETURNING id
                """,
                name,
            )
            flow_id = row["id"]

            slug = _generate_route_slug()
            for _ in range(5):
                try:
                    await conn.execute(
                        "INSERT INTO flow_routes (flow_id, route_slug) VALUES ($1, $2)",
                        flow_id, slug,
                    )
                    break
                except asyncpg.UniqueViolationError:
                    slug = _generate_route_slug()
            else:
                raise RuntimeError("Failed to generate a unique flow route.")

    return {"flow_id": flow_id, "route_slug": slug}


async def get_route_for_flow(flow_id: int) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT route_slug FROM flow_routes WHERE flow_id=$1", flow_id
        )
    return row["route_slug"] if row else None


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
    if not row:
        return None
    d = dict(row)
    d["nodes"] = d["nodes"] if isinstance(d["nodes"], list) else json.loads(d["nodes"])
    d["edges"] = d["edges"] if isinstance(d["edges"], list) else json.loads(d["edges"])
    return d


# ─── existing helpers ───────────────────────────────────────────────────────────

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
                   f.created_at, f.updated_at, r.route_slug
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
    if not row:
        return None
    d = dict(row)
    d["nodes"] = d["nodes"] if isinstance(d["nodes"], list) else json.loads(d["nodes"])
    d["edges"] = d["edges"] if isinstance(d["edges"], list) else json.loads(d["edges"])
    return d


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