# app/app_info.py
# Public, read-only release metadata. Only these three keys are ever exposed.

import os

from dotenv import load_dotenv
from fastapi import APIRouter

load_dotenv()

router = APIRouter(tags=["app"])


def _value(key: str):
    v = os.getenv(key, "").strip()
    return v or None


def read_app_info() -> dict:
    return {
        "version": _value("APP_VERSION"),
        "release_date": _value("APP_RELEASE_DATE"),
        "release_time": _value("APP_RELEASE_TIME"),
    }


@router.get("/app-info")
async def app_info():
    return read_app_info()