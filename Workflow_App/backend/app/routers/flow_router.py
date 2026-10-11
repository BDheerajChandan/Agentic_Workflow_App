# app/routers/flow_router.py

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from app import db

router = APIRouter(prefix="/flows", tags=["flows"])


class CreateFlowRequest(BaseModel):
    name: str = "Untitled Flow"


class CreateFlowResponse(BaseModel):
    flow_id: int
    route_slug: str


class SaveFlowRequest(BaseModel):
    flow_id: int | None = None
    name: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    input_value: str = ""


class SaveFlowResponse(BaseModel):
    flow_id: int
    message: str


def _fmt(flow: dict) -> dict:
    for key in ("last_executed_at", "created_at", "updated_at"):
        if flow.get(key) is not None:
            flow[key] = flow[key].isoformat()
    return flow


@router.post("/create", response_model=CreateFlowResponse)
async def create_flow(payload: CreateFlowRequest):
    created = await db.create_flow(name=payload.name)
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
async def get_flow_by_route(route_slug: str):
    flow = await db.get_flow_by_route(route_slug)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return _fmt(flow)


@router.get("/{flow_id}")
async def get_flow(flow_id: int):
    flow = await db.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return _fmt(flow)


@router.get("/{flow_id}/executions")
async def get_executions(flow_id: int):
    execs = await db.get_executions(flow_id)
    for e in execs:
        if e.get("executed_at") is not None:
            e["executed_at"] = e["executed_at"].isoformat()
    return {"executions": execs}


@router.delete("/{flow_id}")
async def delete_flow(flow_id: int):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM flows WHERE id=$1", flow_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Flow not found.")
    return {"message": "Flow deleted."}