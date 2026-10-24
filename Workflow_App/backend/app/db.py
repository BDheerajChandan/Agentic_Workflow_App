# app/db.py

import os
import json
import secrets
import asyncpg
from dotenv import load_dotenv
from app.variables import VariableError

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
        await conn.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS meta JSONB;")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS variables (
                variable_id SERIAL PRIMARY KEY,
                name        TEXT NOT NULL,
                visibility  TEXT NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'private')),
                flow_id     INTEGER REFERENCES flows(id) ON DELETE CASCADE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CHECK (
                    (visibility = 'public'  AND flow_id IS NULL) OR
                    (visibility = 'private' AND flow_id IS NOT NULL)
                )
            );
        """)
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_variables_public_name "
            "ON variables(name) WHERE visibility = 'public';"
        )

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS workflow_runs (
                run_id        SERIAL PRIMARY KEY,
                flow_id       INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
                workflow_name TEXT NOT NULL,
                status        TEXT NOT NULL,
                started_at    TIMESTAMPTZ NOT NULL,
                ended_at      TIMESTAMPTZ NOT NULL,
                duration_ms   INTEGER NOT NULL DEFAULT 0,
                input         TEXT,
                result        JSONB,
                node_states   JSONB NOT NULL DEFAULT '[]',
                variables     JSONB NOT NULL DEFAULT '{}',
                error         TEXT
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_workflow_runs_flow "
            "ON workflow_runs(flow_id, started_at DESC);"
        )

        await conn.execute(
            "ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS run_number INTEGER;"
        )
        await conn.execute("""
            UPDATE workflow_runs w
            SET run_number = r.rn
            FROM (
                SELECT run_id,
                       ROW_NUMBER() OVER (PARTITION BY flow_id ORDER BY run_id) AS rn
                FROM workflow_runs
            ) r
            WHERE w.run_id = r.run_id AND w.run_number IS NULL;
        """)

        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_variables_private_name "
            "ON variables(flow_id, name) WHERE visibility = 'private';"
        )

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS paused_runs (
                pause_id        SERIAL PRIMARY KEY,
                flow_id         INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
                node_id         TEXT NOT NULL,
                operation       TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'pending',
                state           JSONB NOT NULL DEFAULT '{}',
                variables       JSONB NOT NULL DEFAULT '{}',
                nodes           JSONB NOT NULL DEFAULT '[]',
                edges           JSONB NOT NULL DEFAULT '[]',
                input           TEXT,
                resume_at       TIMESTAMPTZ,
                hold_expires_at TIMESTAMPTZ,
                on_timeout      TEXT NOT NULL DEFAULT 'fail',
                info            JSONB NOT NULL DEFAULT '{}',
                error           TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                claimed_at      TIMESTAMPTZ,
                finished_at     TIMESTAMPTZ
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_paused_runs_status ON paused_runs(status, resume_at);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_paused_runs_flow ON paused_runs(flow_id, node_id);"
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
                   chat_date, chat_time, created_at, updated_at, meta
            FROM chat_messages
            WHERE session_id=$1 AND bot_id=$2
            ORDER BY seq ASC
            """,
            session_id, bot_id,
        )
    out = []
    for r in rows:
        d = _jsonable(r)
        d["meta"] = _json_field(d.get("meta"))
        out.append(d)
    return out


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
                        (session_id, thread_id, bot_id, flow_id, seq, role, content, meta)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id, session_id, thread_id, bot_id, flow_id, seq, role, content,
                              chat_date, chat_time, created_at, updated_at, meta
                    """,
                    session_id, sess["thread_id"], bot_id, flow_id, seq, m["role"], m["content"],
                    json.dumps(m["meta"]) if m.get("meta") else None,
                )
                d = _jsonable(row)
                d["meta"] = _json_field(d.get("meta"))
                saved.append(d)

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



# ─── variables ─────────────────────────────────────────────────────────────────

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
    return _jsonable(row) if row else None


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
    return [_jsonable(r) for r in rows]


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



# ─── workflow run history ─────────────────────────────────────────────────────

def _json_field(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


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
    return [_jsonable(r) for r in rows]


async def get_run(flow_id: int, run_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM workflow_runs WHERE flow_id=$1 AND run_id=$2",
            flow_id, run_id,
        )
    if not row:
        return None
    d = _jsonable(row)
    for key in ("result", "node_states", "variables"):
        d[key] = _json_field(d.get(key))
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
    return int(result.split()[-1])




# ─── chat session deletion ────────────────────────────────────────────────────
# chat_messages rows are removed automatically (ON DELETE CASCADE on session_id).

def _deleted_count(result: str) -> int:
    return int(result.split()[-1])


async def delete_session(bot_id: str, session_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chat_sessions WHERE bot_id=$1 AND session_id=$2",
            bot_id, session_id,
        )
    return _deleted_count(result) > 0


async def delete_sessions(bot_id: str, session_ids: list[str]) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chat_sessions WHERE bot_id=$1 AND session_id = ANY($2::text[])",
            bot_id, session_ids,
        )
    return _deleted_count(result)


async def delete_all_sessions(bot_id: str) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chat_sessions WHERE bot_id=$1", bot_id
        )
    return _deleted_count(result)

# ─── paused runs (Time Operation durable waits / hold) ────────────────────────

_PAUSE_JSON = ("state", "variables", "nodes", "edges", "info")


def _pause_row(row) -> dict:
    d = dict(row)
    for key in _PAUSE_JSON:
        d[key] = _json_field(d.get(key))
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
    return _jsonable(row) if row else None


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
    return [_jsonable(r) for r in rows]


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
    return _deleted_count(result)

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
        d[key] = _json_field(d.get(key))
    return d


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
        info = _json_field(r["info"]) or {}
        request = info.get("hitl") or {}
        out.append({
            "pause_id": r["pause_id"],
            "node_id": r["node_id"],
            "request": {**request, "pause_id": r["pause_id"]},
        })
    return out

async def get_interaction_message(bot_id: str, session_id: str, pause_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, meta FROM chat_messages
            WHERE bot_id=$1 AND session_id=$2
              AND meta->'interaction'->>'pause_id' = $3
            ORDER BY id DESC LIMIT 1
            """,
            bot_id, session_id, str(pause_id),
        )
    return {"id": row["id"], "meta": _json_field(row["meta"])} if row else None


async def set_interaction_status(pause_id: int, status: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE chat_messages
            SET meta = jsonb_set(meta, '{interaction,status}', to_jsonb($1::text))
            WHERE meta->'interaction'->>'pause_id' = $2
            """,
            status, str(pause_id),
        )