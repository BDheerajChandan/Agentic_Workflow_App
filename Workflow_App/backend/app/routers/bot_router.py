# app/routers/bot_router.py

from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.graph.builder import build_graph
from app.output_display import display_mode, render_reply, resolve_output_display
from app.routers.graph_router import _serialise
from app.schemas.graph_schema import Edge, Node
from app.database import file_repository
from app.files.registry import FileError
from app.hitl_service import submit_interaction
from app.pause import PauseRequested
from app.files.text import is_file_result
from app.resume import paused_result, store_pause

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
    message: str = ""
    files: list[dict[str, Any]] | None = None


class InteractionSubmitRequest(BaseModel):
    response: dict[str, Any] = {}
    cancelled: bool = False


class DeleteSessionsRequest(BaseModel):
    session_ids: list[str]

def _to_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if is_file_result(value):
        import json
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, dict):
        if isinstance(value.get("answer"), str):
            return value["answer"].strip()
        import json
        return json.dumps(value, indent=2, ensure_ascii=False)
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


@router.post("/{bot_id}/sessions/delete")
async def delete_selected_sessions(bot_id: str, payload: DeleteSessionsRequest):
    await _require_bot(bot_id)
    ids = list({s for s in payload.session_ids if s})
    if not ids:
        raise HTTPException(status_code=400, detail="No chats selected.")
    return {"deleted": await db.delete_sessions(bot_id, ids)}


@router.delete("/{bot_id}/sessions")
async def delete_all_sessions(bot_id: str):
    await _require_bot(bot_id)
    return {"deleted": await db.delete_all_sessions(bot_id)}


@router.delete("/{bot_id}/sessions/{session_id}")
async def delete_session(bot_id: str, session_id: str):
    if not await db.delete_session(bot_id, session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"message": "Chat deleted."}


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

def _file_meta(files: list[dict]) -> list[dict]:
    return [
        {"file_id": f["file_id"], "file_name": f["file_name"], "size_bytes": f["size_bytes"]}
        for f in files
    ]


def _reply_for(nodes, result, display) -> str:
    serial = _serialise(result)
    if display_mode(nodes) == "entire" or display is None:
        return _extract_reply(serial)
    return render_reply(display)


def _interaction_message(interaction: dict, bot_id: str, session_id: str) -> dict:
    card = {**interaction, "bot_id": bot_id, "session_id": session_id}
    return {
        "role": "bot",
        "content": f"{card.get('title') or 'Input'} required: waiting for your response.",
        "meta": {"interaction": card},
    }


async def _paused_response(bot, session, flow, exc, user_msg, input_value):
    bot_id, session_id = bot["bot_id"], session["session_id"]
    pause_id = await store_pause(exc, bot["flow_id"], flow["nodes"], flow["edges"], input_value)
    paused = paused_result(exc, pause_id)
    interaction = paused.get("interaction")
    bot_msg = (
        _interaction_message(interaction, bot_id, session_id)
        if interaction
        else {"role": "bot", "content": paused["message"]}
    )
    saved = await db.add_messages(bot_id, session_id, [user_msg, bot_msg])
    return {
        "bot_id": bot_id,
        "session_id": session_id,
        "thread_id": session["thread_id"],
        "workflow_id": bot["flow_id"],
        "reply": bot_msg["content"],
        "interaction": bot_msg.get("meta", {}).get("interaction"),
        "messages": saved,
    }


@router.post("/{bot_id}/sessions/{session_id}/chat")
async def chat(bot_id: str, session_id: str, payload: ChatRequest):
    message = payload.message.strip()
    if not message and not payload.files:
        raise HTTPException(status_code=400, detail="Message is required.")

    bot = await _require_bot(bot_id)
    session = await db.get_session(bot_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    flow = await db.get_flow(bot["flow_id"])
    if not flow:
        raise HTTPException(status_code=404, detail="Tagged workflow not found.")

    try:
        files = await file_repository.resolve_public(payload.files) if payload.files else []
    except FileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user_msg = {
        "role": "user",
        "content": message or ", ".join(f["file_name"] for f in files),
        "meta": {"files": _file_meta(files)} if files else None,
    }

    variable_defs = await db.list_variables()

    def _run():
        nodes = [Node.model_validate(n) for n in flow["nodes"]]
        edges = [Edge.model_validate(e) for e in flow["edges"]]
        traces: list = []

        def _cb(node_id, status, detail=None):
            if status == "trace" and detail:
                traces.append(detail)

        graph = build_graph(
            nodes, edges,
            event_callback=_cb,
            variable_defs=variable_defs, flow_id=bot["flow_id"],
        )
        return graph.invoke({"input": message, "data": {}, "files": files}), nodes, traces

    try:
        result, run_nodes, traces = await asyncio.to_thread(_run)
        serial = _serialise(result)
        if display_mode(run_nodes) == "entire":
            reply = _extract_reply(serial)
        else:
            reply = render_reply(
                resolve_output_display(run_nodes, serial, traces, variable_defs)
            )
        if not reply:
            raise RuntimeError("The workflow returned an empty response.")
    except PauseRequested as exc:
        return await _paused_response(bot, session, flow, exc, user_msg, message)
    except Exception as exc:
        await db.add_messages(bot_id, session_id, [user_msg])
        raise HTTPException(status_code=502, detail=str(exc))

    saved = await db.add_messages(
        bot_id,
        session_id,
        [user_msg, {"role": "bot", "content": reply}],
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
        "interaction": None,
        "messages": saved,
    }


@router.post("/{bot_id}/sessions/{session_id}/interactions/{pause_id}/submit")
async def submit_chat_interaction(
    bot_id: str, session_id: str, pause_id: int, payload: InteractionSubmitRequest
):
    bot = await _require_bot(bot_id)
    row = await db.get_interaction_message(bot_id, session_id, pause_id)
    if not row:
        raise HTTPException(status_code=404, detail="Interaction not found.")
    current = ((row["meta"] or {}).get("interaction") or {}).get("status", "pending")
    if current != "pending":
        raise HTTPException(status_code=409, detail=f"Interaction is already {current}.")
    flow = await db.get_flow(bot["flow_id"])
    if not flow:
        raise HTTPException(status_code=404, detail="Tagged workflow not found.")

    outcome = await submit_interaction(pause_id, payload.response, payload.cancelled)

    if outcome.get("cancelled"):
        await db.set_interaction_status(pause_id, "cancelled")
        saved = await db.add_messages(
            bot_id, session_id,
            [{"role": "bot", "content": "Interaction cancelled.", "meta": {"error": True}}],
        )
        return {"status": "cancelled", "messages": saved}

    await db.set_interaction_status(pause_id, "submitted")
    result = outcome.get("result")

    if outcome.get("error"):
        msgs = [{"role": "bot", "content": f"Error: {outcome['error']}", "meta": {"error": True}}]
    elif outcome.get("paused") and isinstance(result, dict) and result.get("interaction"):
        msgs = [_interaction_message(result["interaction"], bot_id, session_id)]
    elif outcome.get("paused"):
        msgs = [{"role": "bot", "content": (result or {}).get("message", "Workflow paused.")}]
    else:
        nodes = [Node.model_validate(n) for n in flow["nodes"]]
        reply = _reply_for(nodes, result, outcome.get("display"))
        msgs = [{"role": "bot", "content": reply or "The workflow returned an empty response."}]

    saved = await db.add_messages(bot_id, session_id, msgs)
    return {"status": "submitted", "messages": saved}