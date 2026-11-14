# app/routers/documentation_router.py
# Workflow documentation API. The workflow documentation row is the single source of truth;
# the chatbot reads it through GET /bots/{bot_id}/documentation (read-only).

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.documentation import (
    DocumentationError, clean_content, clean_test_cases, empty_content,
)

router = APIRouter(tags=["documentation"])


class DocumentationPayload(BaseModel):
    content: dict[str, Any] = {}
    test_cases: list[dict[str, Any]] = []
    base_version: int | None = None


def _err(exc: DocumentationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _shape(flow: dict, doc: dict | None) -> dict:
    return {
        "flow": flow,
        "exists": doc is not None,
        "documentation": doc
        or {"content": empty_content(), "test_cases": [], "version": 0,
            "created_at": None, "updated_at": None},
    }


async def _flow(flow_id: int) -> dict:
    flow = await db.get_flow_brief(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return flow


@router.get("/flows/{flow_id}/documentation")
async def get_documentation(flow_id: int):
    flow = await _flow(flow_id)
    return _shape(flow, await db.get_documentation(flow_id))


@router.post("/flows/{flow_id}/documentation", status_code=201)
async def create_documentation(flow_id: int, payload: DocumentationPayload):
    flow = await _flow(flow_id)
    try:
        doc = await db.create_documentation(
            flow_id, clean_content(payload.content), clean_test_cases(payload.test_cases)
        )
    except DocumentationError as exc:
        raise _err(exc)
    if doc is None:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return _shape(flow, doc)


@router.put("/flows/{flow_id}/documentation")
async def update_documentation(flow_id: int, payload: DocumentationPayload):
    flow = await _flow(flow_id)
    if payload.base_version is None:
        raise HTTPException(status_code=422, detail="base_version is required.")
    try:
        doc = await db.update_documentation(
            flow_id, clean_content(payload.content), clean_test_cases(payload.test_cases),
            payload.base_version,
        )
    except DocumentationError as exc:
        raise _err(exc)
    if doc is None:
        raise HTTPException(status_code=404, detail="Documentation not found. Create it first.")
    return _shape(flow, doc)


@router.delete("/flows/{flow_id}/documentation")
async def delete_documentation(flow_id: int):
    await _flow(flow_id)
    if not await db.delete_documentation(flow_id):
        raise HTTPException(status_code=404, detail="Documentation not found.")
    return {"message": "Documentation deleted."}


@router.get("/bots/{bot_id}/documentation")
async def bot_documentation(bot_id: str):
    bot = await db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")
    flow = await _flow(bot["flow_id"])
    out = _shape(flow, await db.get_documentation(bot["flow_id"]))
    out["bot"] = {
        "bot_id": bot["bot_id"], "name": bot["name"],
        "flow_id": bot["flow_id"], "workflow_name": bot["workflow_name"],
    }
    return out