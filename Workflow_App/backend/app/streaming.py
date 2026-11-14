# app/streaming.py
# Shared helpers for live LLM streaming (SSE framing, chunk text extraction, stream-node selection).

import json

KEEPALIVE = ": keep-alive\n\n"


class GenerationCancelled(Exception):
    """Raised from the token callback when the client stopped / disconnected."""


def sse(event_type: str, **payload) -> str:
    body = json.dumps({"type": event_type, **payload}, ensure_ascii=False, default=str)
    return f"data: {body}\n\n"


def chunk_text(chunk) -> str:
    content = getattr(chunk, "content", chunk)
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and p.get("type") in (None, "text") and isinstance(p.get("text"), str):
                parts.append(p["text"])
        return "".join(parts)
    return str(content)


def terminal_generate_ids(nodes, edges, node_type: str = "rag_generate") -> set:
    """Generate nodes with no other generate node downstream: only these are streamed live."""
    gens = {n.id for n in nodes if n.type == node_type}
    adj: dict = {}
    for e in edges:
        adj.setdefault(e.source, []).append(e.target)

    def reaches_other(start):
        seen, stack = set(), list(adj.get(start, []))
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            if cur in gens:
                return True
            stack.extend(adj.get(cur, []))
        return False

    return {g for g in gens if not reaches_other(g)}