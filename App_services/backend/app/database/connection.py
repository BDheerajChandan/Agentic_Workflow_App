# app/database/connection.py
# One asyncpg pool. Tables live in their own schema (DB_SCHEMA) next to the workflow app's tables.

import json

import asyncpg

from app.config.settings import settings
from app.utils.logger import get_logger

log = get_logger("db")
_pool: asyncpg.Pool | None = None
_prepared = False


def _args(database: str) -> dict:
    return dict(
        host=settings.DB_HOST, port=settings.DB_PORT, user=settings.DB_USER,
        password=settings.DB_PASSWORD, database=database,
    )


async def _prepare() -> None:
    global _prepared
    if _prepared:
        return
    sys_conn = await asyncpg.connect(**_args("postgres"))
    try:
        exists = await sys_conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", settings.DB_NAME)
        if not exists:
            safe = settings.DB_NAME.replace('"', '""')
            await sys_conn.execute(f'CREATE DATABASE "{safe}"')
            log.info("Database '%s' created.", settings.DB_NAME)
    finally:
        await sys_conn.close()

    conn = await asyncpg.connect(**_args(settings.DB_NAME))
    try:
        await conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{settings.DB_SCHEMA}"')
    finally:
        await conn.close()
    _prepared = True


async def _init_connection(conn: asyncpg.Connection) -> None:
    for kind in ("jsonb", "json"):
        await conn.set_type_codec(kind, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        await _prepare()
        _pool = await asyncpg.create_pool(
            **_args(settings.DB_NAME),
            min_size=1,
            max_size=8,
            server_settings={"search_path": settings.DB_SCHEMA},
            init=_init_connection,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def check_db() -> tuple[bool, str | None]:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, type(exc).__name__