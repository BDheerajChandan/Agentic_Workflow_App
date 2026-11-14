# app/search/service.py

from itertools import zip_longest

from app.search.providers import (
    SearchConfigError, SearchDependencyError, SearchError, get_provider,
)
from app.search.urlfilter import compile_filter, normalize_url

MIN_COUNT, MAX_COUNT, MAX_FETCH, MAX_QUERY = 1, 50, 100, 500
CHOICES = ("duckduckgo", "google", "both")
SAFESEARCH = ("on", "moderate", "off")


def parse_count(value, default=5):
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    if isinstance(value, bool):
        raise SearchConfigError("Number of URLs must be a whole number.")
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise SearchConfigError("Number of URLs must be a whole number.")
    if not n.is_integer() or not (MIN_COUNT <= n <= MAX_COUNT):
        raise SearchConfigError(f"Number of URLs must be a whole number between {MIN_COUNT} and {MAX_COUNT}.")
    return int(n)


def parse_timeout(value, default=30):
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise SearchConfigError("Timeout must be a number.")
    if isinstance(value, bool) or not (1 <= n <= 60):
        raise SearchConfigError("Timeout must be between 1 and 60 seconds.")
    return n

def search(query, provider, count, regex=None, region="us-en", safesearch="moderate", timeout=30):
    q = str(query or "").strip()
    if not q:
        raise SearchConfigError("Search query is required.")
    if len(q) > MAX_QUERY:
        raise SearchConfigError(f"Search query exceeds {MAX_QUERY} characters.")
    choice = str(provider or "duckduckgo").strip().lower()
    if choice not in CHOICES:
        raise SearchConfigError(f"Unsupported provider '{provider}'.")
    safe = str(safesearch or "moderate").lower()
    if safe not in SAFESEARCH:
        raise SearchConfigError("Safe search must be on, moderate or off.")
    n = parse_count(count)
    pattern = compile_filter(regex)
    names = ["duckduckgo", "google"] if choice == "both" else [choice]
    fetch = min(MAX_FETCH, n * 3 if pattern else n + 5)

    raw, errors, warnings = {}, {}, []
    for name in names:
        prov = get_provider(name)
        try:
            raw[name] = prov.search(q, fetch, region or "us-en", safe, timeout)
        except SearchError as exc:
            errors[name] = {"type": exc.kind, "message": str(exc)}
        else:
            if not raw[name] and prov.empty_hint:
                warnings.append(prov.empty_hint)

    if not raw:
        detail = "; ".join(f"{k}: {v['message']}" for k, v in errors.items())
        exc = SearchDependencyError if all(v["type"] == "dependency" for v in errors.values()) else SearchError
        raise exc(detail)

    results, seen = [], {}
    fetched = dup = invalid = filtered = 0
    done = False
    for group in zip_longest(*(raw[nm] for nm in names if nm in raw)):
        for item in group:
            if item is None:
                continue
            fetched += 1
            norm = normalize_url(item["url"])
            if norm is None:
                invalid += 1
                continue
            clean, key = norm
            if key in seen:
                dup += 1
                if item["source"] not in seen[key]["sources"]:
                    seen[key]["sources"].append(item["source"])
                continue
            if pattern and not pattern.search(clean):
                filtered += 1
                continue
            if len(results) >= n:
                done = True
                break
            rec = {"rank": len(results) + 1, "title": item["title"], "url": clean,
                   "snippet": item["snippet"], "sources": [item["source"]]}
            seen[key] = rec
            results.append(rec)
        if done or len(results) >= n:
            break

    if results and len(results) < n:
        message = f"Only {len(results)} of {n} requested URLs were available" + (
            " after filtering." if pattern else ".")
    elif not results and fetched == 0:
        message = "The provider returned no results."
    elif not results:
        message = (f"{fetched} results were returned but none matched the URL regex filter."
                   if pattern else "No valid URLs were found in the results.")
    else:
        message = ""
    status = "partial" if errors else ("success" if results else "no_results")

    return {
        "query": q, "provider": choice, "requested_count": n, "returned_count": len(results),
        "regex_filter": pattern.pattern if pattern else None,
        "fetched_count": fetched, "filtered_out_count": filtered,
        "duplicates_removed": dup, "invalid_urls_dropped": invalid,
        "results": results, "urls": [r["url"] for r in results],
        "status": status, "message": message,
        "provider_errors": errors, "warnings": warnings,
    }