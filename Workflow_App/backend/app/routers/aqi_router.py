# app/routers/aqi_router.py

import asyncio

from fastapi import APIRouter, HTTPException

from app.aqi import locations
from app.aqi.scraper import AqiError, AqiNotFound

router = APIRouter(prefix="/aqi", tags=["aqi"])


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, locations.LocationError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, AqiError):
        suffix = f" (HTTP {exc.status})" if exc.status and str(exc.status) not in exc.message else ""
        return HTTPException(status_code=404 if isinstance(exc, AqiNotFound) else 502,
                             detail=f"{exc.message}{suffix}")
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/countries")
async def countries():
    return {"countries": locations.list_countries()}


@router.get("/countries/{country}/states")
async def states(country: str, refresh: bool = False):
    try:
        return await asyncio.to_thread(locations.list_states, country, refresh)
    except (locations.LocationError, AqiError) as exc:
        raise _http(exc)


@router.get("/countries/{country}/states/{state}/cities")
async def cities(country: str, state: str, refresh: bool = False):
    try:
        return await asyncio.to_thread(locations.list_cities, country, state, refresh)
    except (locations.LocationError, AqiError) as exc:
        raise _http(exc)