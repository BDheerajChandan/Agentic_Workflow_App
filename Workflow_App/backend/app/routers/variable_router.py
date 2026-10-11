# app/routers/variable_router.py

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.variables import VariableError

router = APIRouter(prefix="/variables", tags=["variables"])


class CreateVariableRequest(BaseModel):
    name: str
    visibility: Literal["public", "private"] = "public"
    flow_id: int | None = None


class UpdateVariableRequest(BaseModel):
    name: str | None = None
    visibility: Literal["public", "private"] | None = None
    flow_id: int | None = None


def _http(exc: VariableError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
async def list_variables(flow_id: int | None = None):
    return {"variables": await db.list_variables(flow_id)}


@router.post("")
async def create_variable(payload: CreateVariableRequest):
    try:
        return await db.create_variable(payload.name, payload.visibility, payload.flow_id)
    except VariableError as exc:
        raise _http(exc)


@router.put("/{variable_id}")
async def update_variable(variable_id: int, payload: UpdateVariableRequest):
    try:
        variable = await db.update_variable(
            variable_id,
            name=payload.name,
            visibility=payload.visibility,
            flow_id=payload.flow_id,
        )
    except VariableError as exc:
        raise _http(exc)
    if not variable:
        raise HTTPException(status_code=404, detail="Variable not found.")
    return variable


@router.delete("/{variable_id}")
async def delete_variable(variable_id: int):
    if not await db.delete_variable(variable_id):
        raise HTTPException(status_code=404, detail="Variable not found.")
    return {"message": "Variable deleted."}