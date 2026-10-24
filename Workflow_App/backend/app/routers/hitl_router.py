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
from app.hitl_service import submit_interaction

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
    return await submit_interaction(pause_id, payload.response, payload.cancelled)