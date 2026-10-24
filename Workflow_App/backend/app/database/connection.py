# app/database/connection.py
# Single place for configuration and the shared asyncpg pool.

import os

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