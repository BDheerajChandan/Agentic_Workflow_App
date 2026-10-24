# tests/test_db_facade.py
# Import-level checks (no database needed): the facade must expose every legacy name.

import inspect

from app import db

LEGACY = [
    "get_pool", "init_db", "create_flow", "get_route_for_flow", "get_flow_by_route", "save_flow",
    "get_all_flows", "get_flow", "record_execution", "get_executions", "list_workflows_for_bots",
    "create_bot", "get_bot", "get_all_bots", "update_bot", "delete_bot", "create_session",
    "get_session", "get_sessions", "get_messages", "add_messages", "get_bot_history",
    "get_variable", "list_variables", "create_variable", "update_variable", "delete_variable",
    "record_run", "list_runs", "get_run", "delete_run", "delete_all_runs", "delete_session",
    "delete_sessions", "delete_all_sessions", "create_pause", "get_pause", "list_pauses",
    "claim_pause", "finish_pause", "cancel_pause", "due_pause_ids", "expired_hold_rows",
    "fail_interrupted_pauses", "get_pause_detail", "list_pending_hitl",
    "get_interaction_message", "set_interaction_status",
]


def test_legacy_names_exported():
    missing = [n for n in LEGACY if not hasattr(db, n)]
    assert not missing, missing


def test_functions_are_coroutines():
    for n in LEGACY:
        assert inspect.iscoroutinefunction(getattr(db, n)), n


def test_no_circular_import():
    import importlib
    import app.database as pkg
    importlib.reload(pkg)