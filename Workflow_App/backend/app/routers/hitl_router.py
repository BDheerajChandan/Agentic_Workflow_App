# app/routers/hitl_router.py

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.nodes.HILT_Node import validate_submission
from app.nodes.HITL_Features import HitlError, Questions
from app.resume import resume_pause

router = APIRouter(prefix="/hitl", tags=["hitl"])

MAX_JSON_BYTES = 500 * 1024


class SubmitRequest(BaseModel):
    response: dict[str, Any] = {}
    cancelled: bool = False


class QuestionsFileRequest(BaseModel):
    file_name: str
    content: str


class QuestionRequest(BaseModel):
    question: dict[str, Any]


@router.post("/questions/validate")
async def validate_questions_file(payload: QuestionsFileRequest):
    name = os.path.basename((payload.file_name or "").replace("\\", "/")).strip()
    if not name.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files are supported.")
    content = payload.content or ""
    if len(content.encode("utf-8")) > MAX_JSON_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_JSON_BYTES // 1024} KB.")
    try:
        questions = Questions.parse_json(content)
    except HitlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"file_name": name, "questions": questions, "count": len(questions)}


@router.post("/questions/normalize")
async def normalize_question(payload: QuestionRequest):
    try:
        return {"question": Questions.normalize_question(payload.question)}
    except HitlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/pending")
async def pending(flow_id: int):
    return {"pending": await db.list_pending_hitl(flow_id)}


@router.get("/pauses/{pause_id}")
async def get_request(pause_id: int):
    detail = await db.get_pause_detail(pause_id)
    if not detail or detail["operation"] != "hitl":
        raise HTTPException(status_code=404, detail="Interaction not found.")
    if detail["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Interaction is already {detail['status']}.")
    return {
        "pause_id": pause_id,
        "request": {**((detail["info"] or {}).get("hitl") or {}), "pause_id": pause_id},
    }


@router.post("/pauses/{pause_id}/submit")
async def submit(pause_id: int, payload: SubmitRequest):
    detail = await db.get_pause_detail(pause_id)
    if not detail or detail["operation"] != "hitl":
        raise HTTPException(status_code=404, detail="Interaction not found.")
    if detail["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Interaction is already {detail['status']}.")

    if payload.cancelled:
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
        validate_submission(node.get("data") or {}, payload.response)
    except HitlError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    outcome = await resume_pause(
        pause_id, "hitl_submitted", {"__hitl_response": payload.response}
    )
    if outcome is None:
        raise HTTPException(status_code=409, detail="Interaction was already submitted.")
    return outcome