# app/nodes/geo_location.py

import math
import os

import requests

DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_USER_AGENT = "GeoLoc/1.0 (contact: b.dheeraj@csm.tech)"

DEFAULT_TIMEOUT = 15
MAX_TIMEOUT = 120
DEFAULT_LIMIT = 1
MAX_LIMIT = 10


def _headers():
    return {
        "User-Agent": os.getenv("NOMINATIM_USER_AGENT", DEFAULT_USER_AGENT),
        "Accept": "application/json",
    }


def _positive(value, label, default, maximum, integer=False):
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Geo Location: {label} must be a number.")
    if isinstance(value, bool) or math.isnan(num) or num <= 0 or num > maximum:
        raise ValueError(f"Geo Location: {label} must be greater than 0 and at most {maximum}.")
    if integer:
        if not num.is_integer():
            raise ValueError(f"Geo Location: {label} must be a whole number.")
        return int(num)
    return num


def _mode(config):
    mode = str(config.get("config_mode") or "").strip().lower()
    return mode if mode in ("static", "dynamic") else "legacy"


def _resolve_query(state, config):
    mode = _mode(config)

    raw = state.get("current_value")
    dynamic_val = None
    if isinstance(raw, (str, int, float)) and not isinstance(raw, bool) and str(raw).strip():
        dynamic_val = str(raw).strip()

    static = config.get("location_name")
    static_val = static.strip() if isinstance(static, str) and static.strip() else None

    if mode == "static":
        value = static_val
    elif mode == "dynamic":
        value = dynamic_val
    else:
        value = dynamic_val or static_val

    if not value:
        if mode == "dynamic":
            raise ValueError(
                "Geo Location: location name / address is required in Dynamic mode "
                "(map a variable or connect a node)."
            )
        raise ValueError(
            "Geo Location: location name / address is required "
            "(connect a node, map a variable, or enter a value)."
        )
    return value

def _place(p, with_address):
    return {
        "name": p.get("name"),
        "display_name": p.get("display_name"),
        "latitude": float(p["lat"]),
        "longitude": float(p["lon"]),
        "type": p.get("type"),
        "category": p.get("category"),
        "address": p.get("address", {}) if with_address else {},
        "osm_type": p.get("osm_type"),
        "osm_id": p.get("osm_id"),
    }


def _response(success, message, query, data=None, results=None, details=None):
    return {
        "success": success,
        "message": message,
        "query": query,
        "count": len(results) if results else 0,
        "data": data,
        "results": results or [],
        "details": details,
    }


def get_location(query, timeout, limit, with_address):
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": limit,
        "addressdetails": 1 if with_address else 0,
    }

    try:
        response = requests.get(
            os.getenv("NOMINATIM_URL", DEFAULT_NOMINATIM_URL),
            params=params,
            headers=_headers(),
            timeout=timeout,
        )

        if response.status_code == 403:
            return _response(
                False,
                "Access forbidden by Nominatim. Check the User-Agent and whether your IP is blocked.",
                query,
                details=response.text[:1000],
            )
        if response.status_code == 429:
            return _response(
                False,
                "Nominatim rate limit exceeded. Try again later.",
                query,
                details=response.text[:1000],
            )

        response.raise_for_status()
        raw = response.json()

        if not isinstance(raw, list) or not raw:
            return _response(False, "Location not found", query)

        results = [_place(p, with_address) for p in raw]
        return _response(True, "Location retrieved successfully", query, data=results[0], results=results)

    except requests.exceptions.Timeout:
        return _response(False, "Request timed out", query)
    except requests.exceptions.HTTPError as exc:
        return _response(False, f"HTTP error: {exc}", query)
    except requests.exceptions.RequestException as exc:
        return _response(False, f"Network error: {exc}", query)
    except (ValueError, KeyError, TypeError) as exc:
        return _response(False, f"Invalid API response: {exc}", query)


def geo_location_node(state, config):
    cfg = config or {}

    query   = _resolve_query(state, cfg)
    timeout = _positive(cfg.get("timeout"), "Request timeout", DEFAULT_TIMEOUT, MAX_TIMEOUT)
    limit   = _positive(cfg.get("limit"), "Result limit", DEFAULT_LIMIT, MAX_LIMIT, integer=True)
    address = cfg.get("address_details", True)
    with_address = True if address is None else bool(address)

    response = get_location(query, timeout, limit, with_address)

    return {
        "current_value": response,
        "data": {**state.get("data", {}), "geo_location": response},
    }