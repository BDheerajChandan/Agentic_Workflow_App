# app/search/providers.py
# Replaceable search providers. No CAPTCHA/anti-bot bypass. Rate-limit/block responses are never
# retried (5-minute cooldown). Network failures are retried, rotating the DuckDuckGo backend.

import os
import re
import threading
import time

COOLDOWN_SECONDS = 300
DDG_BACKENDS = [
    b.strip()
    for b in os.getenv("SEARCH_DDG_BACKENDS", "auto,duckduckgo,brave,mojeek,startpage").split(",")
    if b.strip()
] or ["auto"]
PROXY = os.getenv("SEARCH_PROXY", "").strip() or None
NETWORK_HINT = " Network unreachable: check internet / VPN / firewall / IPv6, or set SEARCH_PROXY in .env."

_NETWORK_MARKERS = (
    "connecterror", "connection reset", "connection closed", "connection refused", "connection aborted",
    "unreachable", "10051", "10054", "10060", "timed out", "timeout", "dns", "error sending request",
    "broken pipe", "h2 ", "max retries exceeded", "name resolution", "ssl",
)

_LOCK = threading.Lock()
_COOLDOWN: dict = {}


class SearchError(ValueError):
    kind = "error"


class SearchConfigError(SearchError):
    kind = "config"


class SearchDependencyError(SearchError):
    kind = "dependency"


class SearchRateLimitError(SearchError):
    kind = "rate_limit"


class SearchNetworkError(SearchError):
    kind = "network"


def _check(name):
    with _LOCK:
        until, msg = _COOLDOWN.get(name, (0.0, ""))
    if until > time.time():
        raise SearchRateLimitError(msg)


def _block(name, msg):
    with _LOCK:
        _COOLDOWN[name] = (time.time() + COOLDOWN_SECONDS, msg)


def reset_cooldowns():
    with _LOCK:
        _COOLDOWN.clear()


def _is_rate_limit(name: str, msg: str) -> bool:
    low = msg.lower()
    return (
        "ratelimit" in name
        or "ratelimit" in low
        or "rate limit" in low
        or bool(re.search(r"\b429\b", msg))
    )


def _is_network(name: str, msg: str) -> bool:
    low = msg.lower()
    return "timeout" in name or "connect" in name or any(m in low for m in _NETWORK_MARKERS)


class Provider:
    name = ""
    label = ""
    empty_hint = ""

    def search(self, query, limit, region, safesearch, timeout, retries=0):
        _check(self.name)
        last = None
        for attempt in range(retries + 1):
            try:
                return self._search(query, limit, region, safesearch, timeout, attempt)
            except SearchRateLimitError as exc:
                _block(
                    self.name,
                    f"{self.label} is rate-limiting or blocking requests ({exc}). "
                    f"Not retrying for {COOLDOWN_SECONDS // 60} minutes.",
                )
                raise
            except SearchNetworkError as exc:
                last = exc
                if attempt < retries:
                    time.sleep(min(1.0 + attempt, 3.0))
        raise SearchNetworkError(f"{last} (after {retries + 1} attempt(s)).{NETWORK_HINT}")

    def _search(self, query, limit, region, safesearch, timeout, attempt=0):
        raise NotImplementedError


class DuckDuckGo(Provider):
    name = "duckduckgo"
    label = "DuckDuckGo"

    @staticmethod
    def _client():
        try:
            from ddgs import DDGS
            return DDGS, True
        except ImportError:
            pass
        try:
            from duckduckgo_search import DDGS  # deprecated name of ddgs
            return DDGS, False
        except ImportError:
            raise SearchDependencyError(
                "No DuckDuckGo search package is installed. Install it with: pip install ddgs"
            )

    def _search(self, query, limit, region, safesearch, timeout, attempt=0):
        DDGS, modern = self._client()
        kwargs = {"max_results": limit}
        if region and region != "us-en":
            kwargs["region"] = region
        if safesearch and safesearch != "moderate":
            kwargs["safesearch"] = safesearch

        backend = "auto"
        if modern:
            backend = DDG_BACKENDS[attempt % len(DDG_BACKENDS)]
            if backend != "auto":
                kwargs["backend"] = backend

        client = {"timeout": timeout}
        if PROXY:
            client["proxy"] = PROXY

        try:
            with DDGS(**client) as ddgs:  # fresh client / connection on every attempt
                rows = ddgs.text(query, **kwargs)
        except Exception as exc:  # noqa: BLE001
            name, msg = type(exc).__name__.lower(), str(exc)
            if _is_rate_limit(name, msg):
                raise SearchRateLimitError(msg[:200] or "rate limit")
            if "no results" in msg.lower():
                return []
            if _is_network(name, msg):
                raise SearchNetworkError(f"DuckDuckGo search failed [{backend}]: {msg[:220]}")
            raise SearchError(f"DuckDuckGo search failed: {msg[:300] or type(exc).__name__}")
        return [
            {
                "title": (r.get("title") or "").strip(),
                "url": (r.get("href") or r.get("url") or "").strip(),
                "snippet": (r.get("body") or "").strip(),
                "source": self.name,
            }
            for r in rows or []
        ]


class Google(Provider):
    name = "google"
    label = "Google"
    empty_hint = (
        "Google returned no results; it may be blocking automated requests "
        "(no bypass is attempted)."
    )

    def _search(self, query, limit, region, safesearch, timeout, attempt=0):
        try:
            from googlesearch import search as gsearch
        except ImportError:
            raise SearchDependencyError(
                "'googlesearch-python' is not installed. Install it with: pip install googlesearch-python"
            )
        import requests

        country, _, lang = region.partition("-")
        try:
            items = list(
                gsearch(
                    query, num_results=limit, advanced=True, lang=lang or "en",
                    region=country or None, safe="active" if safesearch != "off" else None,
                    timeout=timeout, unique=True, sleep_interval=0, proxy=PROXY,
                )
            )
        except requests.HTTPError as exc:
            code = getattr(exc.response, "status_code", None)
            if code in (403, 429):
                raise SearchRateLimitError(f"HTTP {code}")
            raise SearchError(f"Google search failed with HTTP {code}.")
        except requests.Timeout:
            raise SearchNetworkError(f"Google search timed out after {timeout}s.")
        except requests.RequestException as exc:
            raise SearchNetworkError(f"Google search network error: {str(exc)[:220]}")
        return [
            {
                "title": (getattr(i, "title", "") or "").strip(),
                "url": (getattr(i, "url", "") or "").strip(),
                "snippet": (getattr(i, "description", "") or "").strip(),
                "source": self.name,
            }
            for i in items
        ]


PROVIDERS = {"duckduckgo": DuckDuckGo(), "google": Google()}


def get_provider(name):
    try:
        return PROVIDERS[name]
    except KeyError:
        raise SearchConfigError(f"Unsupported search provider '{name}'.")