# app/routers/bot_router.py

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.graph.builder import build_graph
from app.routers.graph_router import _serialise
from app.schemas.graph_schema import Edge, Node

router = APIRouter(prefix="/bots", tags=["bots"])


class CreateBotRequest(BaseModel):
    name: str
    flow_id: int


class UpdateBotRequest(BaseModel):
    name: str | None = None
    flow_id: int | None = None


class RenameBotRequest(BaseModel):
    name: str


class ChatMessageIn(BaseModel):
    role: Literal["user", "bot"]
    content: str


class SaveMessagesRequest(BaseModel):
    messages: list[ChatMessageIn]


class ChatRequest(BaseModel):
    message: str


def _to_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        if isinstance(value.get("answer"), str):
            return value["answer"].strip()
        import json
        return json.dumps(value, indent=2)
    return str(value)


def _extract_reply(result) -> str:
    if not isinstance(result, dict):
        return _to_text(result)
    return (
        _to_text(result.get("final_output"))
        or _to_text(result.get("answer"))
        or _to_text(result.get("current_value"))
    )


async def _require_bot(bot_id: str) -> dict:
    bot = await db.get_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")
    return bot


# ─── Bots ─────────────────────────────────────────────────────────────────────

@router.get("/workflows")
async def workflows_for_tagging():
    return {"workflows": await db.list_workflows_for_bots()}


@router.post("")
async def create_bot(payload: CreateBotRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Bot name is required.")
    try:
        return await db.create_bot(name, payload.flow_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("")
async def list_bots():
    return {"bots": await db.get_all_bots()}


@router.get("/{bot_id}")
async def get_bot(bot_id: str):
    return await _require_bot(bot_id)


@router.put("/{bot_id}")
async def update_bot(bot_id: str, payload: UpdateBotRequest):
    if payload.name is not None and not payload.name.strip():
        raise HTTPException(status_code=400, detail="Bot name is required.")
    try:
        bot = await db.update_bot(
            bot_id,
            name=payload.name.strip() if payload.name is not None else None,
            flow_id=payload.flow_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")
    return bot


@router.patch("/{bot_id}/rename")
async def rename_bot(bot_id: str, payload: RenameBotRequest):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Bot name is required.")
    bot = await db.update_bot(bot_id, name=name)
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found.")
    return bot


@router.delete("/{bot_id}")
async def delete_bot(bot_id: str):
    if not await db.delete_bot(bot_id):
        raise HTTPException(status_code=404, detail="Bot not found.")
    return {"message": "Bot deleted."}


# ─── Sessions ─────────────────────────────────────────────────────────────────

@router.get("/{bot_id}/sessions")
async def list_sessions(bot_id: str):
    await _require_bot(bot_id)
    return {"sessions": await db.get_sessions(bot_id)}


@router.post("/{bot_id}/sessions")
async def new_session(bot_id: str):
    session = await db.create_session(bot_id)
    if not session:
        raise HTTPException(status_code=404, detail="Bot not found.")
    return session


@router.get("/{bot_id}/history")
async def bot_history(bot_id: str):
    await _require_bot(bot_id)
    return {"sessions": await db.get_bot_history(bot_id)}


# ─── Messages ─────────────────────────────────────────────────────────────────

@router.get("/{bot_id}/sessions/{session_id}/messages")
async def session_messages(bot_id: str, session_id: str):
    session = await db.get_session(bot_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"session": session, "messages": await db.get_messages(bot_id, session_id)}


@router.post("/{bot_id}/sessions/{session_id}/messages")
async def save_messages(bot_id: str, session_id: str, payload: SaveMessagesRequest):
    saved = await db.add_messages(
        bot_id, session_id, [m.model_dump() for m in payload.messages]
    )
    if saved is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"messages": saved}


# ─── Chat execution ───────────────────────────────────────────────────────────

@router.post("/{bot_id}/sessions/{session_id}/chat")
async def chat(bot_id: str, session_id: str, payload: ChatRequest):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required.")

    bot = await _require_bot(bot_id)
    session = await db.get_session(bot_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    flow = await db.get_flow(bot["flow_id"])
    if not flow:
        raise HTTPException(status_code=404, detail="Tagged workflow not found.")

    def _run():
        nodes = [Node.model_validate(n) for n in flow["nodes"]]
        edges = [Edge.model_validate(e) for e in flow["edges"]]
        graph = build_graph(nodes, edges)
        return graph.invoke({"input": message, "data": {}})

    try:
        result = await asyncio.to_thread(_run)
        serial = _serialise(result)
        reply = _extract_reply(serial)
        if not reply:
            raise RuntimeError("The workflow returned an empty response.")
    except Exception as exc:
        await db.add_messages(bot_id, session_id, [{"role": "user", "content": message}])
        raise HTTPException(status_code=502, detail=str(exc))

    saved = await db.add_messages(
        bot_id,
        session_id,
        [
            {"role": "user", "content": message},
            {"role": "bot", "content": reply},
        ],
    )

    try:
        await db.record_execution(bot["flow_id"], message, serial)
    except Exception as exc:
        print(f"⚠️  Failed to persist execution: {exc}")

    return {
        "bot_id": bot_id,
        "session_id": session_id,
        "thread_id": session["thread_id"],
        "workflow_id": bot["flow_id"],
        "reply": reply,
        "messages": saved,
    }