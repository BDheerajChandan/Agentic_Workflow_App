# app/nodes/HITL_Features/Suggestion.py

from app.nodes.HITL_Features import HitlError

FEATURE = "suggestion"


def normalize_config(cfg):
    cfg = cfg if isinstance(cfg, dict) else {}
    return {
        "instructions": str(cfg.get("instructions") or "").strip(),
        "required": bool(cfg.get("required")),
    }


def build_request(input_value, cfg):
    return {
        "input": input_value,
        "instructions": cfg["instructions"],
        "required": cfg["required"],
    }


def validate_response(cfg, response):
    raw = response.get("suggestions") if isinstance(response, dict) else None
    if not isinstance(raw, list):
        raise HitlError("Suggestion: 'suggestions' must be a list.")
    items = []
    for i, s in enumerate(raw, 1):
        if not isinstance(s, str) or not s.strip():
            raise HitlError(f"Suggestion {i} is empty.")
        items.append(s.strip())
    if cfg["required"] and not items:
        raise HitlError("Suggestion: at least one suggestion is required.")
    return {"suggestions": items}


def build_result(input_value, cfg, response):
    return {
        "values": input_value,
        "suggestions": response["suggestions"],
        "status": "Completed",
    }