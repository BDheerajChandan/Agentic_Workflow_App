# app/nodes/switch.py

from app.expressions import (
    ExpressionError, build_context, cast_case_value, interpolate, parse_literal,
    values_equal,
)

MAX_CASES = 200


def _prepare_cases(cases):
    if not isinstance(cases, list) or not cases:
        raise ExpressionError("add at least one case.")
    if len(cases) > MAX_CASES:
        raise ExpressionError(f"at most {MAX_CASES} cases are supported.")
    prepared, seen = [], []
    for i, c in enumerate(cases, 1):
        if not isinstance(c, dict):
            raise ExpressionError(f"Case {i} is invalid.")
        try:
            val = cast_case_value(c.get("value"), c.get("type"))
        except ExpressionError as exc:
            raise ExpressionError(f"Case {i}: {exc}")
        if any(values_equal(val, s) for s in seen):
            raise ExpressionError(f"Case {i}: duplicate case value '{c.get('value')}'.")
        seen.append(val)
        cid = str(c.get("id") or i)
        prepared.append({
            "handle": f"case_{cid}",
            "id": cid,
            "label": c.get("label") or f"Case {i}",
            "value": val,
            "typed": str(c.get("type") or "auto").lower() != "string",
        })
    return prepared


def switch_node(state, config):
    cfg = config or {}
    node_id = cfg.get("__node_id")
    ctx = build_context(state, cfg)
    try:
        raw = cfg.get("input")
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            value = state.get("current_value") if "current_value" in state else state.get("input")
        else:
            value = interpolate(raw, ctx)
        cases = _prepare_cases(cfg.get("cases"))
    except ExpressionError as exc:
        raise ValueError(f"Switch: {exc}")

    hit = None
    for c in cases:
        probe = value
        if isinstance(probe, str) and c["typed"] and not isinstance(c["value"], str):
            probe = parse_literal(probe)
        if values_equal(probe, c["value"]):
            hit = c
            break

    default = cfg.get("default") if isinstance(cfg.get("default"), dict) else {}

    if hit:
        branch, label, route = hit["handle"], hit["label"], hit["handle"]
    else:
        branch, label = "default", default.get("label") or "Default"
        route = "default"

    data = state.get("data") or {}
    return {
        "current_value": value,
        "data": {
            **data,
            "switch": {
                "matched": hit is not None,
                "matched_case": hit["id"] if hit else None,
                "branch": branch,
                "label": label,
                "value": value,
            },
            "__route": {**(data.get("__route") or {}), node_id: route},
        },
    }