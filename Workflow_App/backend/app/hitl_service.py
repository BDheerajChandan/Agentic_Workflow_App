# app/hitl_service.py
# Single submission path shared by the Flow app (Run / Playground) and the Chatbot.

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app import db
from app.nodes.HILT_Node import validate_submission
from app.nodes.HITL_Features import HitlError
from app.resume import resume_pause


async def submit_interaction(pause_id: int, response: dict[str, Any], cancelled: bool = False) -> dict:
    detail = await db.get_pause_detail(pause_id)
    if not detail or detail["operation"] != "hitl":
        raise HTTPException(status_code=404, detail="Interaction not found.")
    if detail["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Interaction is already {detail['status']}.")

    if cancelled:
        if not await db.cancel_pause(pause_id):
            raise HTTPException(status_code=409, detail="Interaction is no longer pending.")
        message = "HITL interaction cancelled by user."
        try:
            await db.record_run(
                flow_id=detail["flow_id"],
                status="failed",
                started_at=detail["created_at"],
                ended_at=datetime.now(timezone.utc),
                input_value=detail["input"] or "",
                result=None,
                node_states=[],
                variables={},
                error=message,
            )
        except Exception as exc:
            print(f"⚠️  Failed to persist cancelled HITL run: {exc}")
        return {"cancelled": True, "message": message}

    node = next((n for n in detail["nodes"] if n.get("id") == detail["node_id"]), None)
    if node is None:
        raise HTTPException(status_code=404, detail="HITL node not found in the paused workflow.")

    try:
        validate_submission(node.get("data") or {}, response)
    except HitlError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    outcome = await resume_pause(pause_id, "hitl_submitted", {"__hitl_response": response})
    if outcome is None:
        raise HTTPException(status_code=409, detail="Interaction was already submitted.")
    return outcome