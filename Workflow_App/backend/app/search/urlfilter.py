# app/search/urlfilter.py

import re
from urllib.parse import urlsplit

from app.search.providers import SearchConfigError

MAX_PATTERN = 500
MAX_URL = 2048

_NESTED = re.compile(r"\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})")
_ALT_REPEAT = re.compile(r"\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})")


def compile_filter(pattern):
    p = "" if pattern is None else str(pattern)
    if not p.strip():
        return None
    if len(p) > MAX_PATTERN:
        raise SearchConfigError(f"URL regex exceeds {MAX_PATTERN} characters.")
    if _NESTED.search(p) or _ALT_REPEAT.search(p):
        raise SearchConfigError(
            "URL regex rejected: nested or alternated repetition such as (a+)+ or (a|b)+ "
            "can take exponential time. Use a simpler pattern."
        )
    try:
        return re.compile(p)
    except re.error as exc:
        raise SearchConfigError(f"Invalid URL regex: {exc}.")


def normalize_url(url):
    """Returns (original_clean_url, dedupe_key) or None for invalid URLs."""
    u = str(url or "").strip()
    if not u or len(u) > MAX_URL or re.search(r"\s", u):
        return None
    try:
        p = urlsplit(u)
        host, port = p.hostname, p.port
    except ValueError:
        return None
    if p.scheme.lower() not in ("http", "https") or not host:
        return None
    netloc = host.lower() + (f":{port}" if port and port not in (80, 443) else "")
    key = f"{netloc}{p.path.rstrip('/') or '/'}" + (f"?{p.query}" if p.query else "")
    return u, key