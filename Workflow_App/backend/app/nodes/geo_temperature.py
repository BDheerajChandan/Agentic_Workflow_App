# app/nodes/geo_temperature.py

import math
import os
import time
from datetime import datetime, timezone

import requests

DEFAULT_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DEFAULT_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client"

DEFAULT_HOURS = 5
DEFAULT_TIMEOUT = 10
DEFAULT_INTERVAL_MIN = 1
DEFAULT_CYCLES = 3

MAX_HOURS = 168
MAX_TIMEOUT = 120
MAX_INTERVAL_MIN = 10
MAX_CYCLES = 10


# ─── Validation helpers ───────────────────────────────────────────────────────

def _to_float(value, label, low, high):
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise ValueError(f"Geo Temperature: {label} must be a number.")
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Geo Temperature: {label} must be a number.")
    if math.isnan(num) or math.isinf(num) or not (low <= num <= high):
        raise ValueError(f"Geo Temperature: {label} must be between {low} and {high}.")
    return num


def _connected_coord(state, key):
    cv = state.get("current_value")
    if not isinstance(cv, dict):
        return None
    inner = cv.get("data") if isinstance(cv.get("data"), dict) else cv
    return inner.get(key)


def _resolve_coord(state, config, key, label, low, high, env_name):
    # mapped variable > connected node output > node setting > env fallback
    candidates = (
        state.get(f"geo_{key}"),
        _connected_coord(state, key),
        config.get(key),
        os.getenv(env_name),
    )
    for candidate in candidates:
        num = _to_float(candidate, label, low, high)
        if num is not None:
            return num
    raise ValueError(f"Geo Temperature: {label} is required.")


def _positive(value, label, default, maximum, integer=False):
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Geo Temperature: {label} must be a number.")
    if isinstance(value, bool) or math.isnan(num) or num <= 0 or num > maximum:
        raise ValueError(f"Geo Temperature: {label} must be greater than 0 and at most {maximum}.")
    if integer:
        if not num.is_integer():
            raise ValueError(f"Geo Temperature: {label} must be a whole number.")
        return int(num)
    return num


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _get_json(url, params, timeout):
    resp = requests.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _describe(exc):
    if isinstance(exc, requests.exceptions.Timeout):
        return "Request timed out"
    if isinstance(exc, requests.exceptions.HTTPError):
        return f"HTTP error: {exc}"
    if isinstance(exc, (ValueError, KeyError, TypeError)):
        return f"Invalid API response: {exc}"
    if isinstance(exc, requests.exceptions.RequestException):
        return f"Network error: {exc}"
    return str(exc)


def _reverse_geocode(lat, lon, timeout):
    try:
        data = _get_json(
            os.getenv("BIGDATACLOUD_URL", DEFAULT_GEOCODE_URL),
            {"latitude": lat, "longitude": lon, "localityLanguage": "en"},
            timeout,
        )
        city = data.get("city") or data.get("locality") or "Unknown"
        state = data.get("principalSubdivision") or "Unknown"
        country = data.get("countryName") or "Unknown"
        return {
            "city": city,
            "state": state,
            "country": country,
            "display": f"{city}, {state}, {country}",
        }
    except (requests.exceptions.RequestException, ValueError, AttributeError):
        return {"city": None, "state": None, "country": None, "display": "Unknown Location"}


# ─── Single weather snapshot ──────────────────────────────────────────────────

def _run_once(lat, lon, hours, timeout):
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        weather = _get_json(
            os.getenv("OPEN_METEO_URL", DEFAULT_FORECAST_URL),
            {
                "latitude": lat,
                "longitude": lon,
                "hourly": "temperature_2m,relative_humidity_2m",
                "current_weather": "true",
                "wind_speed_unit": "ms",
                "timezone": "auto",
            },
            timeout,
        )

        current = weather.get("current_weather") or {}
        if "temperature" not in current:
            raise ValueError("current weather missing from response")

        units = weather.get("current_weather_units") or {}
        hourly = weather.get("hourly") or {}
        times = hourly.get("time") or []
        temps = hourly.get("temperature_2m") or []
        hums = hourly.get("relative_humidity_2m") or []

        current_time = current.get("time") or datetime.now().strftime("%Y-%m-%dT%H:%M")
        hour_key = f"{current_time[:13]}:00"
        index = next((i for i, t in enumerate(times) if t >= hour_key), 0)

        entries = [
            {
                "time": times[i],
                "temperature_c": temps[i] if i < len(temps) else None,
                "relative_humidity_pct": hums[i] if i < len(hums) else None,
            }
            for i in range(index, min(index + hours, len(times)))
        ]
    except (requests.exceptions.RequestException, ValueError, KeyError, TypeError) as exc:
        msg = _describe(exc)
        return {"success": False, "message": msg, "timestamp": timestamp, "data": None, "error": msg}

    return {
        "success": True,
        "message": "Weather retrieved successfully",
        "timestamp": timestamp,
        "data": {
            "location": _reverse_geocode(lat, lon, timeout),
            "coordinates": {"latitude": lat, "longitude": lon},
            "current": {
                "time": current_time,
                "temperature_c": current.get("temperature"),
                "wind_speed": current.get("windspeed"),
                "wind_speed_unit": units.get("windspeed", "m/s"),
            },
            "forecast": {"hours": hours, "entries": entries},
        },
        "error": None,
    }


# ─── Node ─────────────────────────────────────────────────────────────────────

def geo_temperature_node(state, config):
    cfg = config or {}

    lat = _resolve_coord(state, cfg, "latitude", "Latitude", -90, 90, "LATITUDE")
    lon = _resolve_coord(state, cfg, "longitude", "Longitude", -180, 180, "LONGITUDE")
    hours = _positive(cfg.get("forecast_hours"), "Forecast hours", DEFAULT_HOURS, MAX_HOURS, integer=True)
    timeout = _positive(cfg.get("timeout"), "Timeout", DEFAULT_TIMEOUT, MAX_TIMEOUT)

    repeat = bool(cfg.get("repeat_updates"))
    interval = DEFAULT_INTERVAL_MIN
    cycles = 1
    if repeat:
        interval = _positive(cfg.get("update_interval"), "Update interval", DEFAULT_INTERVAL_MIN, MAX_INTERVAL_MIN)
        cycles = _positive(cfg.get("update_cycles"), "Update cycles", DEFAULT_CYCLES, MAX_CYCLES, integer=True)

    snapshots = []
    for n in range(cycles):
        snapshots.append(_run_once(lat, lon, hours, timeout))
        if n < cycles - 1:
            time.sleep(interval * 60)

    latest = snapshots[-1]
    response = {
        "success": latest["success"],
        "message": latest["message"],
        "timestamp": latest["timestamp"],
        "request": {
            "latitude": lat,
            "longitude": lon,
            "forecast_hours": hours,
            "timeout_seconds": timeout,
            "repeat_updates": repeat,
        },
        "data": latest["data"],
        "error": latest["error"],
    }
    if repeat:
        response["request"]["update_interval_minutes"] = interval
        response["request"]["update_cycles"] = cycles
        response["updates"] = snapshots

    return {
        "current_value": response,
        "data": {**state.get("data", {}), "geo_temperature": response},
    }