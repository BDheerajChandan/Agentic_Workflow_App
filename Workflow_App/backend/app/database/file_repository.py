# app/database/file_repository.py

import uuid

from app.files.refs import normalize_refs
from app.files.registry import FileError


async def _pool():
    from app import db
    return await db.get_pool()


async def ensure_tables() -> None:
    pool = await _pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_files (
                file_id       TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                storage_key   TEXT NOT NULL UNIQUE,
                file_type     TEXT NOT NULL,
                mime_type     TEXT,
                size_bytes    BIGINT NOT NULL DEFAULT 0,
                status        TEXT NOT NULL DEFAULT 'uploaded',
                error         TEXT,
                flow_id       INTEGER,
                bot_id        TEXT,
                session_id    TEXT,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                processed_at  TIMESTAMPTZ
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploaded_files_session ON uploaded_files(session_id);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploaded_files_flow ON uploaded_files(flow_id);"
        )


def _public(row) -> dict:
    return {
        "file_id": row["file_id"],
        "file_name": row["original_name"],
        "file_type": row["file_type"],
        "mime_type": row["mime_type"],
        "size_bytes": row["size_bytes"],
        "status": row["status"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


async def create_file(
    original_name, storage_key, file_type, mime_type, size_bytes,
    flow_id=None, bot_id=None, session_id=None,
) -> dict:
    pool = await _pool()
    file_id = uuid.uuid4().hex
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO uploaded_files
                (file_id, original_name, storage_key, file_type, mime_type, size_bytes,
                 flow_id, bot_id, session_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            file_id, original_name, storage_key, file_type, mime_type, size_bytes,
            flow_id, bot_id, session_id,
        )
    return _public(row)


async def get_file_internal(file_id: str) -> dict | None:
    """Includes storage_key. Never return this to API clients."""
    pool = await _pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM uploaded_files WHERE file_id=$1", file_id)
    return dict(row) if row else None


async def get_file(file_id: str) -> dict | None:
    row = await get_file_internal(file_id)
    return _public(row) if row else None


async def resolve_public(raw) -> list[dict]:
    ids = normalize_refs(raw)
    if not ids:
        return []
    pool = await _pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM uploaded_files WHERE file_id = ANY($1::text[])", ids)
    by_id = {r["file_id"]: r for r in rows}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise FileError(f"Unknown file reference: {missing[0]}")
    return [_public(by_id[i]) for i in ids]


async def set_status(file_id: str, status: str, error: str | None = None) -> None:
    pool = await _pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE uploaded_files SET status=$1, error=$2, processed_at=NOW() WHERE file_id=$3",
            status, error, file_id,
        )


async def delete_file(file_id: str) -> str | None:
    """Returns the storage_key of the deleted row (caller removes the blob)."""
    pool = await _pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "DELETE FROM uploaded_files WHERE file_id=$1 RETURNING storage_key", file_id
        )