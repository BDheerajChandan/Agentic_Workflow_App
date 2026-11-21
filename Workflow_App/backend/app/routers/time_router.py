# app/routers/time_router.py

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.nodes.time_operation import RESCHEDULE_KEYS, plan_reschedule, signal_waits
from app.resume import resume_pause, spawn

router = APIRouter(prefix="/time-operation", tags=["time-operation"])


class SignalRequest(BaseModel):
    flow_id: int | None = None
    node_id: str
    action: Literal["resume", "cancel"] = "resume"


class RescheduleRequest(BaseModel):
    config: dict[str, Any]
    auto: bool = False


@router.post("/signal")
async def send_signal(payload: SignalRequest):
    affected = signal_waits(payload.flow_id, payload.node_id, payload.action)
    if not affected:
        raise HTTPException(status_code=404, detail="No active inline wait found for this node.")
    return {
        "message": "Wait resumed." if payload.action == "resume" else "Wait cancelled.",
        "affected": affected,
    }


@router.get("/pauses")
async def list_pauses(flow_id: int, node_id: str | None = None):
    return {"pauses": await db.list_pauses(flow_id, node_id)}


@router.post("/pauses/{pause_id}/resume")
async def resume(pause_id: int):
    row = await db.get_pause(pause_id)
    if not row:
        raise HTTPException(status_code=404, detail="Paused run not found.")
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Paused run is already {row['status']}.")
    spawn(resume_pause(pause_id, "resumed"))
    return {"message": "Resume started.", "pause_id": pause_id}


@router.post("/pauses/{pause_id}/cancel")
async def cancel(pause_id: int):
    if not await db.cancel_pause(pause_id):
        raise HTTPException(status_code=404, detail="No pending paused run found.")
    return {"message": "Paused run cancelled.", "pause_id": pause_id}



@router.post("/pauses/{pause_id}/reschedule")
async def reschedule(pause_id: int, payload: RescheduleRequest):
    row = await db.get_pause(pause_id)
    if not row:
        raise HTTPException(status_code=404, detail="Paused run not found.")
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Paused run is already {row['status']}.")
    if row["operation"] == "hitl":
        raise HTTPException(status_code=400, detail="This paused run is not a Time Operation.")

    cfg = {k: payload.config.get(k) for k in RESCHEDULE_KEYS if k in payload.config}
    try:
        plan = plan_reschedule(cfg, allow_past=not payload.auto)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    done = await db.reschedule_pause(
        pause_id, plan["operation"], plan["resume_at"], plan["scheduled_for"], cfg,
    )
    if not done:
        raise HTTPException(status_code=409, detail="Paused run was already resumed or cancelled.")

    resume_at = plan["resume_at"]
    return {
        "message": f"Rescheduled. Run #{pause_id} will continue at {resume_at.isoformat()}.",
        "pause_id": pause_id,
        "resume_at": resume_at.isoformat(),
    }


@router.get("/pauses/{pause_id}/outcome")
async def outcome(pause_id: int):
    row = await db.get_pause_outcome(pause_id)
    if not row:
        raise HTTPException(status_code=404, detail="Paused run not found.")
    out = {
        "pause_id": pause_id,
        "status": row["status"],
        "operation": row["operation"],
        "resume_at": row["resume_at"],
        "error": row["error"],
        "outcome": None,
    }
    if row["status"] in ("done", "failed"):
        out["outcome"] = (row["info"] or {}).get("outcome")
    return out