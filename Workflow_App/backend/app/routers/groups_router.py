# app/routers/groups_router.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db

router = APIRouter(prefix="/groups", tags=["groups"])


class GroupRequest(BaseModel):
    name: str


def _clean(name: str) -> str:
    n = (name or "").strip()
    if not n:
        raise HTTPException(status_code=400, detail="Group name is required.")
    if len(n) > 100:
        raise HTTPException(status_code=400, detail="Group name must be 100 characters or fewer.")
    return n


@router.get("")
async def list_groups():
    return {"groups": await db.list_groups()}


@router.post("")
async def create_group(payload: GroupRequest):
    return await db.create_group(_clean(payload.name))


@router.get("/{group_id}")
async def get_group(group_id: str):
    group = await db.get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    return group


@router.patch("/{group_id}")
async def rename_group(group_id: str, payload: GroupRequest):
    group = await db.rename_group(group_id, _clean(payload.name))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    return group


@router.delete("/{group_id}")
async def delete_group(group_id: str):
    moved = await db.delete_group(group_id)
    if moved is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return {"message": "Group deleted. Its flows were moved to ungrouped.", "moved_flows": moved}