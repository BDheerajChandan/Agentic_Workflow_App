# app/nodes/HITL_Features/Approval.py

from app.nodes.HITL_Features import HitlError

FEATURE = "approval"
APPROVED = "Approved"
REJECTED = "Rejected"

_DECISIONS = {
    "approve": APPROVED,
    "approved": APPROVED,
    "reject": REJECTED,
    "rejected": REJECTED,
}


def normalize_config(cfg):
    cfg = cfg if isinstance(cfg, dict) else {}
    return {"instructions": str(cfg.get("instructions") or "").strip()}


def build_request(input_value, cfg):
    return {"input": input_value, "instructions": cfg["instructions"]}


def validate_response(cfg, response):
    if not isinstance(response, dict):
        raise HitlError("Approval: a decision is required.")
    key = str(response.get("decision") or "").strip().lower()
    if key not in _DECISIONS:
        raise HitlError("Approval: decision must be 'approve' or 'reject'.")
    return {"status": _DECISIONS[key]}


def build_result(input_value, cfg, response):
    return {"values": input_value, "status": response["status"]}