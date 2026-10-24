# app/routers/time_router.py

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.nodes.time_operation import signal_waits
from app.resume import resume_pause, spawn

router = APIRouter(prefix="/time-operation", tags=["time-operation"])


class SignalRequest(BaseModel):
    flow_id: int | None = None
    node_id: str
    action: Literal["resume", "cancel"] = "resume"


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