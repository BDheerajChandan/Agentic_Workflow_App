# app/routers/flow_router.py

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from app import db
from app.flow_copy import duplicate_flow

router = APIRouter(prefix="/flows", tags=["flows"])


class CreateFlowRequest(BaseModel):
    name: str = "Untitled Flow"
    group_id: str | None = None
    copy_of: str | None = None


class CreateFlowResponse(BaseModel):
    flow_id: int
    route_slug: str
    name: str
    group_id: str | None = None


class SaveFlowRequest(BaseModel):
    flow_id: int | None = None
    name: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    input_value: str = ""


class SaveFlowResponse(BaseModel):
    flow_id: int
    message: str


class MoveFlowRequest(BaseModel):
    group_id: str | None = None


class DuplicateRequest(BaseModel):
    same_group: bool = True
    group_id: str | None = None


def _fmt(flow: dict) -> dict:
    for key in ("last_executed_at", "created_at", "updated_at"):
        if flow.get(key) is not None:
            flow[key] = flow[key].isoformat()
    return flow


async def _check_group(group_id: str | None) -> None:
    if group_id is not None and not await db.get_group(group_id):
        raise HTTPException(status_code=404, detail="Group not found.")


@router.post("/create", response_model=CreateFlowResponse)
async def create_flow(payload: CreateFlowRequest):
    await _check_group(payload.group_id)
    created = await db.create_flow(
        name=(payload.name or "").strip() or "Untitled Flow",
        group_id=payload.group_id,
        copy_of=payload.copy_of,
    )
    return CreateFlowResponse(**created)


@router.post("/save", response_model=SaveFlowResponse)
async def save_flow(payload: SaveFlowRequest):
    flow_id = await db.save_flow(
        flow_id=payload.flow_id,
        name=payload.name,
        nodes=payload.nodes,
        edges=payload.edges,
        input_value=payload.input_value,
    )
    return SaveFlowResponse(flow_id=flow_id, message="Flow saved successfully.")


@router.get("/list")
async def list_flows():
    flows = await db.get_all_flows()
    return {"flows": [_fmt(f) for f in flows]}


@router.get("/route/{route_slug}")
async def get_flow_by_route(route_slug: str, group_id: str | None = None):
    flow = await db.get_flow_by_route(route_slug)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    if group_id is not None and flow.get("group_id") != group_id:
        raise HTTPException(status_code=404, detail="Flow not found in this group.")
    return _fmt(flow)


@router.get("/{flow_id}")
async def get_flow(flow_id: int):
    flow = await db.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return _fmt(flow)


@router.patch("/{flow_id}/group")
async def move_flow(flow_id: int, payload: MoveFlowRequest):
    await _check_group(payload.group_id)
    if not await db.set_flow_group(flow_id, payload.group_id):
        raise HTTPException(status_code=404, detail="Flow not found.")
    return {
        "flow_id": flow_id,
        "group_id": payload.group_id,
        "route_slug": await db.get_route_for_flow(flow_id),
    }


@router.post("/{flow_id}/duplicate", response_model=CreateFlowResponse)
async def duplicate(flow_id: int, payload: DuplicateRequest):
    if not payload.same_group:
        await _check_group(payload.group_id)
    created = await duplicate_flow(flow_id, payload.same_group, payload.group_id)
    if not created:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return CreateFlowResponse(**created)


@router.get("/{flow_id}/executions")
async def get_executions(flow_id: int):
    execs = await db.get_executions(flow_id)
    for e in execs:
        if e.get("executed_at") is not None:
            e["executed_at"] = e["executed_at"].isoformat()
    return {"executions": execs}


@router.delete("/{flow_id}/runs/{run_id}")
async def delete_run(flow_id: int, run_id: int):
    if not await db.delete_run(flow_id, run_id):
        raise HTTPException(status_code=404, detail="Run not found.")
    return {"message": "Run deleted."}


@router.delete("/{flow_id}/runs")
async def delete_all_runs(flow_id: int):
    deleted = await db.delete_all_runs(flow_id)
    return {"message": "Run history cleared.", "deleted": deleted}


@router.get("/{flow_id}/runs")
async def list_runs(flow_id: int):
    return {"runs": await db.list_runs(flow_id)}


@router.get("/{flow_id}/runs/{run_id}")
async def get_run(flow_id: int, run_id: int):
    run = await db.get_run(flow_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@router.delete("/{flow_id}")
async def delete_flow(flow_id: int):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM flows WHERE id=$1", flow_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Flow not found.")
    return {"message": "Flow deleted."}