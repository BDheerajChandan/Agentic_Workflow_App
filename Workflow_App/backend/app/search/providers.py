# app/search/providers.py
# Replaceable search providers. No CAPTCHA/anti-bot bypass, no retries on rate limits:
# a rate-limit or block starts a short cooldown during which the provider is not called again.

import os
import threading
import time

COOLDOWN_SECONDS = 300
DDG_BACKEND = os.getenv("SEARCH_DDG_BACKEND", "")

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


class Provider:
    name = ""
    label = ""
    empty_hint = ""

    def search(self, query, limit, region, safesearch, timeout):
        _check(self.name)
        try:
            return self._search(query, limit, region, safesearch, timeout)
        except SearchRateLimitError as exc:
            _block(
                self.name,
                f"{self.label} is rate-limiting or blocking requests ({exc}). "
                f"Not retrying for {COOLDOWN_SECONDS // 60} minutes.",
            )
            raise

    def _search(self, query, limit, region, safesearch, timeout):
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

    def _search(self, query, limit, region, safesearch, timeout):
        DDGS, modern = self._client()
        kwargs = {"max_results": limit}
        if region and region != "us-en":
            kwargs["region"] = region
        if safesearch and safesearch != "moderate":
            kwargs["safesearch"] = safesearch
        if modern and DDG_BACKEND:
            kwargs["backend"] = DDG_BACKEND

        rows = []
        for attempt in range(2):
            try:
                # brand-new client + connection on every attempt (no reused / stale h2 connection)
                with DDGS(timeout=timeout) as ddgs:
                    rows = ddgs.text(query, **kwargs)
                break
            except Exception as exc:  # noqa: BLE001
                name, msg = type(exc).__name__.lower(), str(exc)
                low = msg.lower()
                if "ratelimit" in name or "ratelimit" in low or "429" in msg or "202" in msg:
                    raise SearchRateLimitError(msg[:200] or "rate limit")
                if "no results" in low:
                    return []
                dropped = any(k in low for k in ("connection reset", "h2", "connection closed", "broken pipe"))
                if dropped and attempt == 0:
                    continue  # one reset-and-retry with a fresh client for dropped connections only
                if "timeout" in name or "timed out" in low:
                    raise SearchError(f"DuckDuckGo search timed out after {timeout}s.")
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

    def _search(self, query, limit, region, safesearch, timeout):
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
                    timeout=timeout, unique=True, sleep_interval=0,
                )
            )
        except requests.HTTPError as exc:
            code = getattr(exc.response, "status_code", None)
            if code in (403, 429):
                raise SearchRateLimitError(f"HTTP {code}")
            raise SearchError(f"Google search failed with HTTP {code}.")
        except requests.Timeout:
            raise SearchError(f"Google search timed out after {timeout}s.")
        except requests.RequestException as exc:
            raise SearchError(f"Google search network error: {exc}")
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