# app/database/models.py
# Table definitions. Unqualified names: the connection search_path is the DJ Services schema.

PROJECT_FIELDS = ("project_id", "project_name", "project_path", "description", "enabled")

SERVICE_FIELDS = (
    "service_id", "project_id", "service_name", "service_type", "project_path", "runtime_type",
    "dockerfile_path", "compose_file_path", "container_name", "docker_image", "host", "bind_address",
    "host_port", "container_port", "protocol", "health_check_path", "enabled", "auto_start",
    "auto_restart", "restart_policy", "depends_on", "env", "start_command", "install_command",
    "start_period_seconds",
)

RUNTIME_FIELDS = (
    "container_id", "container_status", "health_status", "desired_state", "last_started_at",
    "last_stopped_at", "last_health_check_at", "last_error", "config_hash",
)

DESIRED_STATES = ("unset", "running", "stopped")

DDL = [
    """
    CREATE TABLE IF NOT EXISTS projects (
        project_id   TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        project_path TEXT NOT NULL DEFAULT '',
        description  TEXT NOT NULL DEFAULT '',
        enabled      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS services (
        service_id           TEXT PRIMARY KEY,
        project_id           TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
        service_name         TEXT NOT NULL,
        service_type         TEXT NOT NULL
                             CHECK (service_type IN ('backend','frontend','worker','database','other')),
        project_path         TEXT NOT NULL,
        runtime_type         TEXT NOT NULL DEFAULT 'python'
                             CHECK (runtime_type IN ('python','node','image','dockerfile')),
        dockerfile_path      TEXT,
        compose_file_path    TEXT,
        container_name       TEXT NOT NULL UNIQUE,
        docker_image         TEXT,
        host                 TEXT NOT NULL DEFAULT 'localhost',
        bind_address         TEXT NOT NULL DEFAULT '127.0.0.1',
        host_port            INTEGER NOT NULL CHECK (host_port BETWEEN 1 AND 65535),
        container_port       INTEGER NOT NULL CHECK (container_port BETWEEN 1 AND 65535),
        protocol             TEXT NOT NULL DEFAULT 'http' CHECK (protocol IN ('http','https')),
        health_check_path    TEXT NOT NULL DEFAULT '/',
        enabled              BOOLEAN NOT NULL DEFAULT TRUE,
        auto_start           BOOLEAN NOT NULL DEFAULT FALSE,
        auto_restart         BOOLEAN NOT NULL DEFAULT TRUE,
        restart_policy       TEXT NOT NULL DEFAULT 'unless-stopped',
        depends_on           JSONB NOT NULL DEFAULT '[]',
        env                  JSONB NOT NULL DEFAULT '{}',
        start_command        TEXT,
        install_command      TEXT,
        start_period_seconds INTEGER NOT NULL DEFAULT 300,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_services_host_port ON services(host_port)",
    "CREATE INDEX IF NOT EXISTS idx_services_project ON services(project_id)",
    """
    CREATE TABLE IF NOT EXISTS service_runtime (
        runtime_id           SERIAL PRIMARY KEY,
        service_id           TEXT NOT NULL UNIQUE REFERENCES services(service_id) ON DELETE CASCADE,
        container_id         TEXT,
        container_status     TEXT,
        health_status        TEXT,
        desired_state        TEXT NOT NULL DEFAULT 'unset'
                             CHECK (desired_state IN ('unset','running','stopped')),
        last_started_at      TIMESTAMPTZ,
        last_stopped_at      TIMESTAMPTZ,
        last_health_check_at TIMESTAMPTZ,
        last_error           TEXT,
        config_hash          TEXT,
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS service_events (
        event_id      BIGSERIAL PRIMARY KEY,
        service_id    TEXT NOT NULL REFERENCES services(service_id) ON DELETE CASCADE,
        event_type    TEXT NOT NULL,
        event_message TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_service_events_service ON service_events(service_id, created_at DESC)",
]