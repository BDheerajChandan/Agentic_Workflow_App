# app/routers/converter_router.py

from fastapi import APIRouter
from pydantic import BaseModel

from app.nodes.type_converter import detect_type_name, get_converter_meta

router = APIRouter(prefix="/converter", tags=["converter"])


class DetectRequest(BaseModel):
    value: str = ""


@router.get("/meta")
async def converter_meta():
    return get_converter_meta()


@router.post("/detect")
async def converter_detect(payload: DetectRequest):
    return {"type": detect_type_name(payload.value)}