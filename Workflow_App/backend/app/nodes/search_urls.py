# app/nodes/search_urls.py
# Query source (first match wins):
#   1. Variables ▸ Input Value Mapping ▸ "Search Query" (only when enabled)
#   2. Output of the connected previous node (e.g. Start input), like the other nodes
#   3. A legacy saved static query (kept for old workflows, not shown in the UI)

from app.search import providers, service
from app.search.providers import SearchError

NO_QUERY = (
    "Search_URLs: no search query. Connect a node that outputs text (e.g. Start) "
    "or enable Variables ▸ Input Value Mapping and map 'Search Query'."
)


def _clean(value, source):
    if value is None:
        return None
    if isinstance(value, bool) or isinstance(value, (dict, list, tuple, set)):
        raise ValueError(
            f"Search_URLs: the {source} must be text or a number, not a structured value. "
            "Use Input Value Mapping with a Path to select a text field."
        )
    text = str(value).strip()
    return text or None


def _query(state, cfg) -> str:
    if "search_query" in state:
        q = _clean(state.get("search_query"), "mapped search query")
        if not q:
            raise ValueError("Search_URLs: the mapped search query is empty.")
        return q

    incoming = state.get("current_value") if "current_value" in state else state.get("input")
    if isinstance(incoming, (dict, list, tuple, set)):
        raise ValueError(
            "Search_URLs: the connected node outputs a structured value. Enable Variables ▸ "
            "Input Value Mapping and map a text field to 'Search Query'."
        )
    q = _clean(incoming, "incoming value")
    if q:
        return q

    q = _clean(cfg.get("query"), "saved query")
    if q:
        return q
    raise ValueError(NO_QUERY)


def search_urls_node(state, config):
    cfg = config or {}
    providers.reset_cooldowns()  # fresh start on every run of this node
    query = _query(state, cfg)

    regex = state.get("search_regex")
    if regex in (None, ""):
        regex = cfg.get("url_regex")

    try:
        out = service.search(
            query=query,
            provider=cfg.get("provider") or "duckduckgo",
            count=service.parse_count(cfg.get("count")),
            regex=regex,
            region=str(cfg.get("region") or "us-en").strip(),
            safesearch=cfg.get("safesearch") or "moderate",
            timeout=service.parse_timeout(cfg.get("timeout")),
        )
    except SearchError as exc:
        raise ValueError(f"Search_URLs: {exc}")

    return {
        "current_value": out,
        "data": {**(state.get("data") or {}), "search_urls": out},
    }