# app/database/migrations.py
# Idempotent schema creation / migration. Never drops or recreates existing data.

from app.database.connection import get_pool


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
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_interaction "
            "ON chat_messages ((meta->'interaction'->>'pause_id')) "
            "WHERE meta ? 'interaction';"
        )

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

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS flow_groups (
                group_id   TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute(
            "ALTER TABLE flows ADD COLUMN IF NOT EXISTS group_id TEXT "
            "REFERENCES flow_groups(group_id) ON DELETE SET NULL;"
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_flows_group ON flows(group_id);")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS flow_copy_counters (
                base_name  TEXT PRIMARY KEY,
                copy_count INTEGER NOT NULL DEFAULT 0
            );
        """)

    print("✅ Database tables verified / created.")