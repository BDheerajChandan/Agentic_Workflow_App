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
FLOW_FRONTEND_URL    = os.getenv("FLOW_FRONTEND_URL", "http://localhost:5173").rstrip("/")
CHATBOT_FRONTEND_URL = os.getenv("CHATBOT_FRONTEND_URL", "http://localhost:5174").rstrip("/")
API_PUBLIC_URL       = os.getenv("API_PUBLIC_URL", "http://localhost:8001").rstrip("/")
DEFAULT_CHAT_TITLE   = "New chat"

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

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS bots (
                bot_id            TEXT PRIMARY KEY,
                name              TEXT NOT NULL,
                flow_id           INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
                workflow_name     TEXT NOT NULL,
                workflow_url      TEXT NOT NULL,
                workflow_endpoint TEXT NOT NULL,
                bot_endpoint      TEXT NOT NULL,
                status            TEXT NOT NULL DEFAULT 'active',
                created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_chat_at      TIMESTAMPTZ
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id      TEXT PRIMARY KEY,
                thread_id       TEXT NOT NULL UNIQUE,
                bot_id          TEXT NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
                title           TEXT NOT NULL DEFAULT 'New chat',
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_message_at TIMESTAMPTZ
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_sessions_bot ON chat_sessions(bot_id, created_at DESC);"
        )

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id         SERIAL PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
                thread_id  TEXT NOT NULL,
                bot_id     TEXT NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
                flow_id    INTEGER,
                seq        INTEGER NOT NULL,
                role       TEXT NOT NULL,
                content    TEXT NOT NULL,
                chat_date  DATE NOT NULL DEFAULT CURRENT_DATE,
                chat_time  TIME NOT NULL DEFAULT LOCALTIME,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (session_id, seq)
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, seq);"
        )

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

# ─── bots / sessions / messages ────────────────────────────────────────────────

import uuid


def _jsonable(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


def _workflow_refs(slug: str) -> dict:
    return {
        "workflow_url": f"{FLOW_FRONTEND_URL}/flow/{slug}",
        "workflow_endpoint": f"{API_PUBLIC_URL}/flows/route/{slug}",
    }


def _bot_out(row) -> dict:
    d = _jsonable(row)
    d["workflow_id"] = d["flow_id"]
    d["bot_url"] = f"{CHATBOT_FRONTEND_URL}/bots/{d['bot_id']}"
    return d


_BOT_SELECT = """
    SELECT b.bot_id, b.name, b.flow_id,
           COALESCE(f.name, b.workflow_name) AS workflow_name,
           b.workflow_url, b.workflow_endpoint, b.bot_endpoint, b.status,
           b.created_at, b.updated_at, b.last_chat_at
    FROM bots b
    LEFT JOIN flows f ON f.id = b.flow_id
"""


async def list_workflows_for_bots() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id AS workflow_id, f.name AS workflow_name, r.route_slug
            FROM flows f
            JOIN flow_routes r ON r.flow_id = f.id
            ORDER BY f.updated_at DESC
            """
        )
    out = []
    for r in rows:
        d = dict(r)
        d.update(_workflow_refs(d["route_slug"]))
        out.append(d)
    return out


async def create_bot(name: str, flow_id: int) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        flow = await conn.fetchrow(
            """
            SELECT f.id, f.name, r.route_slug
            FROM flows f JOIN flow_routes r ON r.flow_id = f.id
            WHERE f.id = $1
            """,
            flow_id,
        )
        if not flow:
            raise ValueError("Workflow not found.")
        refs = _workflow_refs(flow["route_slug"])

        for _ in range(5):
            bot_id = _generate_route_slug()
            try:
                await conn.execute(
                    """
                    INSERT INTO bots (bot_id, name, flow_id, workflow_name,
                                      workflow_url, workflow_endpoint, bot_endpoint)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    bot_id, name, flow_id, flow["name"],
                    refs["workflow_url"], refs["workflow_endpoint"],
                    f"{API_PUBLIC_URL}/bots/{bot_id}",
                )
                break
            except asyncpg.UniqueViolationError:
                continue
        else:
            raise RuntimeError("Failed to generate a unique bot id.")
    return await get_bot(bot_id)


async def get_bot(bot_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_BOT_SELECT + " WHERE b.bot_id = $1", bot_id)
    return _bot_out(row) if row else None


async def get_all_bots() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            _BOT_SELECT + " ORDER BY COALESCE(b.last_chat_at, b.updated_at) DESC"
        )
    return [_bot_out(r) for r in rows]


async def update_bot(bot_id: str, name: str | None = None, flow_id: int | None = None) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM bots WHERE bot_id=$1", bot_id)
        if not exists:
            return None
        if name is not None:
            await conn.execute(
                "UPDATE bots SET name=$1, updated_at=NOW() WHERE bot_id=$2", name, bot_id
            )
        if flow_id is not None:
            flow = await conn.fetchrow(
                """
                SELECT f.id, f.name, r.route_slug
                FROM flows f JOIN flow_routes r ON r.flow_id = f.id
                WHERE f.id = $1
                """,
                flow_id,
            )
            if not flow:
                raise ValueError("Workflow not found.")
            refs = _workflow_refs(flow["route_slug"])
            await conn.execute(
                """
                UPDATE bots
                SET flow_id=$1, workflow_name=$2, workflow_url=$3,
                    workflow_endpoint=$4, updated_at=NOW()
                WHERE bot_id=$5
                """,
                flow_id, flow["name"], refs["workflow_url"], refs["workflow_endpoint"], bot_id,
            )
    return await get_bot(bot_id)


async def delete_bot(bot_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM bots WHERE bot_id=$1", bot_id)
    return result != "DELETE 0"


async def create_session(bot_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if not await conn.fetchval("SELECT 1 FROM bots WHERE bot_id=$1", bot_id):
            return None
        row = await conn.fetchrow(
            """
            INSERT INTO chat_sessions (session_id, thread_id, bot_id, title)
            VALUES ($1, $2, $3, $4)
            RETURNING session_id, thread_id, bot_id, title,
                      created_at, updated_at, last_message_at
            """,
            str(uuid.uuid4()), str(uuid.uuid4()), bot_id, DEFAULT_CHAT_TITLE,
        )
    d = _jsonable(row)
    d["message_count"] = 0
    return d


async def get_session(bot_id: str, session_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT s.session_id, s.thread_id, s.bot_id, s.title,
                   s.created_at, s.updated_at, s.last_message_at,
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.session_id) AS message_count
            FROM chat_sessions s
            WHERE s.session_id=$1 AND s.bot_id=$2
            """,
            session_id, bot_id,
        )
    return _jsonable(row) if row else None


async def get_sessions(bot_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.session_id, s.thread_id, s.bot_id, s.title,
                   s.created_at, s.updated_at, s.last_message_at,
                   (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.session_id) AS message_count
            FROM chat_sessions s
            WHERE s.bot_id=$1
            ORDER BY s.created_at DESC
            """,
            bot_id,
        )
    return [_jsonable(r) for r in rows]


async def get_messages(bot_id: str, session_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, session_id, thread_id, bot_id, flow_id, seq, role, content,
                   chat_date, chat_time, created_at, updated_at
            FROM chat_messages
            WHERE session_id=$1 AND bot_id=$2
            ORDER BY seq ASC
            """,
            session_id, bot_id,
        )
    return [_jsonable(r) for r in rows]


async def add_messages(bot_id: str, session_id: str, messages: list[dict]) -> list[dict] | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            sess = await conn.fetchrow(
                """
                SELECT session_id, thread_id, title FROM chat_sessions
                WHERE session_id=$1 AND bot_id=$2 FOR UPDATE
                """,
                session_id, bot_id,
            )
            if not sess:
                return None
            flow_id = await conn.fetchval("SELECT flow_id FROM bots WHERE bot_id=$1", bot_id)
            seq = await conn.fetchval(
                "SELECT COALESCE(MAX(seq), 0) FROM chat_messages WHERE session_id=$1", session_id
            )
            saved: list[dict] = []
            for m in messages:
                seq += 1
                row = await conn.fetchrow(
                    """
                    INSERT INTO chat_messages
                        (session_id, thread_id, bot_id, flow_id, seq, role, content)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id, session_id, thread_id, bot_id, flow_id, seq, role, content,
                              chat_date, chat_time, created_at, updated_at
                    """,
                    session_id, sess["thread_id"], bot_id, flow_id, seq, m["role"], m["content"],
                )
                saved.append(_jsonable(row))

            first_user = next((m["content"] for m in messages if m["role"] == "user"), None)
            title = sess["title"]
            if first_user and title == DEFAULT_CHAT_TITLE:
                title = first_user[:40]

            await conn.execute(
                """
                UPDATE chat_sessions
                SET title=$1, updated_at=NOW(), last_message_at=NOW()
                WHERE session_id=$2
                """,
                title, session_id,
            )
            await conn.execute("UPDATE bots SET last_chat_at=NOW() WHERE bot_id=$1", bot_id)
    return saved


async def get_bot_history(bot_id: str) -> list[dict]:
    sessions = await get_sessions(bot_id)
    for s in sessions:
        s["messages"] = await get_messages(bot_id, s["session_id"])
    return sessions