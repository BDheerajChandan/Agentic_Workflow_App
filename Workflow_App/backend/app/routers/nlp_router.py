# app/routers/nlp_router.py

import asyncio

from fastapi import APIRouter, HTTPException

from app.nlp.features import list_voices
from app.nlp.registry import FEATURES
from app.nlp.utils import NlpError

router = APIRouter(prefix="/nlp", tags=["nlp"])


@router.get("/features")
async def features():
    return {"features": FEATURES}


@router.get("/voices")
async def voices():
    try:
        return {"voices": await asyncio.to_thread(list_voices)}
    except NlpError as exc:
        raise HTTPException(status_code=503 if exc.kind == "dependency" else 502, detail=str(exc))