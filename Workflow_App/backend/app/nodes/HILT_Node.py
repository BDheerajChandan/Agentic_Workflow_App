# app/nodes/HILT_Node.py
# Reusable Human-in-the-Loop node: Approval / Suggestion / Questions.
# Pauses the run durably (PauseRequested) and resumes when the frontend submits a response.

from app.nodes.HITL_Features import Approval, Suggestion, Questions, HitlError
from app.pause import PauseRequested, to_jsonable

FEATURES = {
    "approval": Approval,
    "suggestion": Suggestion,
    "questions": Questions,
}
DEFAULT_FEATURE = "approval"
TITLES = {
    "approval": "Approval",
    "suggestion": "Suggestions",
    "questions": "Questionnaire",
}


def resolve_feature(cfg):
    cfg = cfg or {}
    feature = str(cfg.get("feature") or DEFAULT_FEATURE).strip().lower()
    if feature not in FEATURES:
        raise HitlError(f"HITL: unsupported feature '{feature}'.")
    module = FEATURES[feature]
    return feature, module, module.normalize_config(cfg.get(feature))


def validate_submission(cfg, response):
    """Used by the API before a paused run is claimed. Raises HitlError."""
    _, module, fcfg = resolve_feature(cfg)
    return module.validate_response(fcfg, response)


def hitl_node(state, config):
    cfg = config or {}
    feature, module, fcfg = resolve_feature(cfg)
    node_id = cfg.get("__node_id")
    flow_id = cfg.get("__flow_id")

    input_value = to_jsonable(
        state.get("current_value") if "current_value" in state else state.get("input")
    )

    # ── Resumed run: a human response was submitted ──────────────────────────
    resume = cfg.get("__resume")
    if resume:
        if resume != "hitl_submitted":
            raise ValueError("HITL: the interaction was not completed.")
        response = module.validate_response(fcfg, cfg.get("__hitl_response"))
        result = module.build_result(input_value, fcfg, response)
        return {
            "current_value": result,
            "data": {**state.get("data", {}), "hitl": result},
        }

    # ── First pass: pause and wait for the human ─────────────────────────────
    if flow_id is None:
        raise ValueError("HITL: save the workflow first — human interaction needs a saved workflow.")

    request = {
        **module.build_request(input_value, fcfg),
        "feature": feature,
        "title": TITLES[feature],
        "node_id": node_id,
        "flow_id": flow_id,
    }
    raise PauseRequested(
        node_id=node_id,
        operation="hitl",
        resume_at=None,
        hold_expires_at=None,
        on_timeout="fail",
        info={"hitl": to_jsonable(request)},
    )