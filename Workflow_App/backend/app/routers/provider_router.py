# app/routers/provider_router.py

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.providers import ENV_KEYS, get_env_key, list_models, normalize_provider

router = APIRouter(prefix="/providers", tags=["providers"])


class ModelsRequest(BaseModel):
    provider: str = "openai"
    mode: Literal["static", "dynamic"] = "static"
    purpose: Literal["chat", "embedding"] = "chat"
    api_key: str | None = None


@router.post("/models")
async def provider_models(payload: ModelsRequest):
    try:
        provider = normalize_provider(payload.provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if payload.mode == "dynamic":
        key = (payload.api_key or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail="API key is required in Dynamic mode.")
    else:
        key = get_env_key(provider)
        if not key:
            raise HTTPException(
                status_code=400,
                detail=f"{ENV_KEYS[provider]} is not set in the backend .env file.",
            )

    try:
        models = await asyncio.to_thread(list_models, provider, key, payload.purpose)
    except Exception as exc:
        if payload.mode == "static":
            detail = f"Failed to fetch {provider} models using the backend key."
        else:
            detail = f"Failed to fetch {provider} models: {str(exc).replace(key, '***')}"
        raise HTTPException(status_code=502, detail=detail)

    return {"provider": provider, "models": models}