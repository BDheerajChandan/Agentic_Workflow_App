# app/output_display.py
# Single source of truth for the Output node's display configuration.
# node.data.display = { mode: "entire" | "variables" | "nodes", variable_ids: [...], node_ids: [...] }

import json


def _cfg(nodes) -> dict:
    node = next((n for n in nodes if n.type == "output"), None)
    data = getattr(node, "data", None) or {}
    display = data.get("display")
    return display if isinstance(display, dict) else {}


def display_mode(nodes) -> str:
    return str(_cfg(nodes).get("mode") or "entire")


def resolve_output_display(nodes, result, traces, variable_defs):
    cfg = _cfg(nodes)
    mode = str(cfg.get("mode") or "entire")

    if mode == "variables":
        ids = cfg.get("variable_ids") or []
        if not ids:
            return "No variables selected in the Output node settings."
        runtime = (result or {}).get("variables") or {}
        out = {}
        for raw in ids:
            try:
                vid = int(raw)
            except (TypeError, ValueError):
                out[f"#{raw}"] = "(variable no longer exists)"
                continue
            d = next((x for x in variable_defs if x["variable_id"] == vid), None)
            if not d:
                out[f"#{vid}"] = "(variable no longer exists)"
                continue
            key = d["name"] if d["name"] in runtime else f"{d['name']} ({d['visibility']})"
            out[d["name"]] = runtime[key] if key in runtime else "(not assigned in this run)"
        return out

    if mode == "nodes":
        ids = cfg.get("node_ids") or []
        if not ids:
            return "No nodes selected in the Output node settings."
        by_id = {n.id: n for n in nodes}
        out = {}
        for nid in ids:
            node = by_id.get(nid)
            label = f"{nid} ({node.type if node else 'unknown'})"
            trace = next((t for t in reversed(traces) if t.get("node_id") == nid), None)
            if not trace:
                out[label] = "(not executed)"
            elif trace.get("status") == "failed":
                out[label] = {"error": trace.get("error")}
            else:
                v = trace.get("value")
                out[label] = v if v is not None else trace.get("output")
        return out

    return result


def render_reply(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, indent=2, ensure_ascii=False, default=str)