# app/nodes/if_else.py
# Exactly two branches: "true" and "false". No default / fallback branch.

from app.expressions import ExpressionError, build_context, evaluate_conditions


def if_else_node(state, config):
    cfg = config or {}
    node_id = cfg.get("__node_id")
    conds = cfg.get("conditions")
    if not isinstance(conds, list) or not conds:
        raise ValueError("If-Else: add at least one condition.")

    ctx = build_context(state, cfg)
    try:
        matched, results = evaluate_conditions(conds, ctx)
    except ExpressionError as exc:
        raise ValueError(f"If-Else: {exc}")

    branch = "true" if matched else "false"
    label = (cfg.get("true_label") or "True") if matched else (cfg.get("false_label") or "False")

    value = state.get("current_value") if "current_value" in state else state.get("input")
    data = state.get("data") or {}
    return {
        "current_value": value,
        "data": {
            **data,
            "if_else": {
                "matched": matched,
                "branch": branch,
                "label": label,
                "condition_results": results,
            },
            "__route": {**(data.get("__route") or {}), node_id: branch},
        },
    }