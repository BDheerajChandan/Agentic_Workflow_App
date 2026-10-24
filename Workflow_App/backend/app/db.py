# app/db.py
# Backward-compatibility facade. Implementation lives in the app.database package.
# Existing `from app import db; db.xxx(...)` call sites keep working unchanged.

from app.database.base import (  # noqa: F401
    deleted_count as _deleted_count,
    generate_route_slug as _generate_route_slug,
    json_field as _json_field,
    jsonable as _jsonable,
)
from app.database.connection import (  # noqa: F401
    API_PUBLIC_URL,
    CHATBOT_FRONTEND_URL,
    DB_HOST,
    DB_NAME,
    DB_PASSWORD,
    DB_PORT,
    DB_USER,
    FLOW_FRONTEND_URL,
    get_pool,
)
from app.database.migrations import init_db  # noqa: F401
from app.database.workflow_repository import (  # noqa: F401
    create_flow,
    delete_flow,
    get_all_flows,
    get_flow,
    get_flow_by_route,
    get_route_for_flow,
    save_flow,
)
from app.database.execution_repository import (  # noqa: F401
    delete_all_runs,
    delete_run,
    get_executions,
    get_run,
    list_runs,
    record_execution,
    record_run,
)
from app.database.chat_repository import (  # noqa: F401
    DEFAULT_CHAT_TITLE,
    add_messages,
    create_bot,
    create_session,
    delete_all_sessions,
    delete_bot,
    delete_session,
    delete_sessions,
    get_all_bots,
    get_bot,
    get_bot_history,
    get_interaction_message,
    get_messages,
    get_session,
    get_sessions,
    list_workflows_for_bots,
    set_interaction_status,
    update_bot,
)
from app.database.variable_repository import (  # noqa: F401
    create_variable,
    delete_variable,
    get_variable,
    list_variables,
    update_variable,
)
from app.database.hitl_repository import (  # noqa: F401
    cancel_pause,
    claim_pause,
    create_pause,
    due_pause_ids,
    expired_hold_rows,
    fail_interrupted_pauses,
    finish_pause,
    get_pause,
    get_pause_detail,
    list_pauses,
    list_pending_hitl,
)