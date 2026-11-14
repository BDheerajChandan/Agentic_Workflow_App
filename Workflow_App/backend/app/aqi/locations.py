# app/aqi/locations.py
# Country -> State -> City hierarchy using AQI.in slugs.
# Countries/states: seeded list where a country's states are fixed (India), else discovered.
# Cities: discovered from the public AQI.in state page links, cached on disk.
# Replace `_discover` to switch to an authorized API/data source.

import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from app.aqi.scraper import AqiError, build_url, prettify, slugify, fetch_html

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CACHE_FILE = Path(os.getenv("AQI_CACHE_DIR", str(BASE_DIR / "aqi_cache"))) / "locations.json"
TTL_SECONDS = float(os.getenv("AQI_LOCATION_TTL_HOURS", "168")) * 3600

COUNTRIES = {"india": {"name": "India"}}

_INDIA = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
    "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
]
SEED_STATES = {"india": [{"slug": slugify(n), "name": n} for n in _INDIA]}

_PATH = re.compile(
    r"^/(?:[a-z]{2}/)?dashboard/([a-z0-9-]+)(?:/([a-z0-9-]+))?(?:/([a-z0-9-]+))?/?$"
)
_NON_LOCATION = {
    "historical-analysis", "ranking", "rankings", "map", "compare", "forecast", "live",
    "api", "widgets", "pm", "pm25", "pm10", "co", "no2", "so2", "o3",
}
_LOCK = threading.Lock()


class LocationError(LookupError):
    pass


def list_countries():
    return [{"slug": k, "name": v["name"]} for k, v in COUNTRIES.items()]


def is_known_state(country, state) -> bool:
    seed = SEED_STATES.get(country)
    return True if seed is None else any(s["slug"] == state for s in seed)


def extract_links(html: str, country: str, state: str | None = None) -> list:
    soup = BeautifulSoup(html, "html.parser")
    found = {}
    for a in soup.find_all("a", href=True):
        p = urlparse(a["href"])
        if p.netloc and not p.netloc.lower().endswith("aqi.in"):
            continue
        m = _PATH.match(p.path.lower())
        if not m or m.group(1) != country:
            continue
        s2, s3 = m.group(2), m.group(3)
        if state is None:
            slug = s2 if s2 and not s3 else None
        else:
            slug = s3 if s2 == state and s3 else None
        if not slug or slug in _NON_LOCATION or slug in found:
            continue
        text = a.get_text(" ", strip=True)
        found[slug] = text if text and slugify(text) == slug else prettify(slug)
    return sorted(({"slug": k, "name": v} for k, v in found.items()), key=lambda i: i["name"])


def _load() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(cache: dict) -> None:
    try:
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = CACHE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, CACHE_FILE)
    except OSError:
        pass


def _discover(country: str, state: str | None = None) -> list:
    url = build_url(country, state)
    html, _ = fetch_html(url)
    items = extract_links(html, country, state)
    if not items:
        kind = "cities" if state else "states"
        raise AqiError(f"No {kind} could be discovered from {url}.")
    return items


def _cached(key: str, refresh: bool, loader):
    now = time.time()
    with _LOCK:
        entry = _load().get(key)
    fresh = bool(entry) and now - entry.get("ts", 0) < TTL_SECONDS
    if fresh and not refresh:
        return {"items": entry["items"], "source": "cache", "stale": False}
    try:
        items = loader()
    except AqiError as exc:
        if entry:
            return {"items": entry["items"], "source": "cache", "stale": True, "warning": exc.message}
        raise
    with _LOCK:
        cache = _load()
        cache[key] = {"ts": now, "items": items}
        _save(cache)
    return {"items": items, "source": "live", "stale": False}


def list_states(country: str, refresh: bool = False) -> dict:
    if country not in COUNTRIES:
        raise LocationError(f"Unsupported country '{country}'.")
    seed = SEED_STATES.get(country)
    if seed is not None:
        return {"items": seed, "source": "seed", "stale": False}
    return _cached(country, refresh, lambda: _discover(country))


def list_cities(country: str, state: str, refresh: bool = False) -> dict:
    if country not in COUNTRIES:
        raise LocationError(f"Unsupported country '{country}'.")
    if not is_known_state(country, state):
        raise LocationError(f"Unsupported state '{state}' for {country}.")
    return _cached(f"{country}/{state}", refresh, lambda: _discover(country, state))