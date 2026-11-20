# app/database/migrations.py
# Idempotent schema creation. Never drops or recreates existing data.

from app.database.connection import get_pool
from app.database.models import DDL
from app.utils.logger import get_logger

log = get_logger("db")


async def init_db() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for statement in DDL:
                await conn.execute(statement)
    log.info("Database schema verified.")