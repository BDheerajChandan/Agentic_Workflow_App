# app/database/chat_repository.py
# Bots, chat sessions, messages, and chat-embedded HITL interaction state.

import json
import uuid

import asyncpg

from app.database.base import deleted_count, generate_route_slug, json_field, jsonable
from app.database.connection import (
    API_PUBLIC_URL, CHATBOT_FRONTEND_URL, FLOW_FRONTEND_URL, get_pool,
)

DEFAULT_CHAT_TITLE = "New chat"


def _workflow_refs(slug: str) -> dict:
    return {
        "workflow_url": f"{FLOW_FRONTEND_URL}/flow/{slug}",
        "workflow_endpoint": f"{API_PUBLIC_URL}/flows/route/{slug}",
    }


def _bot_out(row) -> dict:
    d = jsonable(row)
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


# ─── bots ─────────────────────────────────────────────────────────────────────

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
            bot_id = generate_route_slug()
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


# ─── sessions ─────────────────────────────────────────────────────────────────

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
    d = jsonable(row)
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
    return jsonable(row) if row else None


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
    return [jsonable(r) for r in rows]


async def delete_session(bot_id: str, session_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chat_sessions WHERE bot_id=$1 AND session_id=$2",
            bot_id, session_id,
        )
    return deleted_count(result) > 0


async def delete_sessions(bot_id: str, session_ids: list[str]) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chat_sessions WHERE bot_id=$1 AND session_id = ANY($2::text[])",
            bot_id, session_ids,
        )
    return deleted_count(result)


async def delete_all_sessions(bot_id: str) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM chat_sessions WHERE bot_id=$1", bot_id
        )
    return deleted_count(result)


# ─── messages ─────────────────────────────────────────────────────────────────

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
        d = jsonable(r)
        d["meta"] = json_field(d.get("meta"))
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
                d = jsonable(row)
                d["meta"] = json_field(d.get("meta"))
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


# ─── chat-embedded HITL interactions ──────────────────────────────────────────

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
    return {"id": row["id"], "meta": json_field(row["meta"])} if row else None


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