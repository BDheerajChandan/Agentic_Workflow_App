# app/routers/search_router.py

import importlib.util

from fastapi import APIRouter
from pydantic import BaseModel

from app.search.providers import SearchConfigError
from app.search.urlfilter import compile_filter

router = APIRouter(prefix="/search", tags=["search"])


class RegexRequest(BaseModel):
    pattern: str = ""


def _has(*modules):
    return any(importlib.util.find_spec(m) is not None for m in modules)


@router.get("/providers")
async def providers():
    ddg = _has("ddgs", "duckduckgo_search")
    google = _has("googlesearch")
    return {
        "providers": [
            {"value": "duckduckgo", "label": "DuckDuckGo", "available": ddg, "install": "pip install ddgs"},
            {"value": "google", "label": "Google", "available": google, "install": "pip install googlesearch-python"},
            {"value": "both", "label": "Both (merged, de-duplicated)", "available": ddg or google,
             "install": "pip install ddgs googlesearch-python"},
        ]
    }


@router.post("/validate-regex")
async def validate_regex(payload: RegexRequest):
    try:
        compiled = compile_filter(payload.pattern)
    except SearchConfigError as exc:
        return {"valid": False, "empty": False, "error": str(exc)}
    return {"valid": True, "empty": compiled is None, "error": None}