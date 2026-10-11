# app/nodes/io_schema.py
# Single source of truth for each node's mappable inputs and outputs.
# Add an entry here to make a new node type mappable; unlisted nodes use the default.

from __future__ import annotations


def _docs_text(result: dict):
    docs = result.get("docs") or []
    return "\n\n".join(d.page_content for d in docs)


NODE_IO: dict[str, dict] = {
    "start": {
        "inputs": [
            {"key": "input", "label": "Start Input", "state_key": "input"},
        ],
        "outputs": [
            {"key": "output", "label": "Start Output", "resolve": lambda r: r.get("current_value")},
        ],
    },
    "type_converter": {
        "inputs": [
            {"key": "value", "label": "Value to Convert", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "converted", "label": "Converted Value", "resolve": lambda r: r.get("current_value")},
        ],
    },
    "output": {
        "inputs": [
            {"key": "value", "label": "Output Value", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "final_output", "label": "Final Output", "resolve": lambda r: r.get("final_output")},
        ],
    },
    "rag_retrieve": {
        "inputs": [
            {"key": "question", "label": "Question / Query", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "documents", "label": "Retriever Output", "resolve": _docs_text},
            {
                "key": "average_confidence",
                "label": "Average Confidence",
                "resolve": lambda r: (r.get("data") or {}).get("average_confidence"),
            },
        ],
    },
    "rag_generate": {
        "inputs": [
            {"key": "question", "label": "Question", "state_key": "current_value"},
            {"key": "context", "label": "Context", "state_key": "variable_context", "transient": True},
        ],
        "outputs": [
            {"key": "answer", "label": "Generate Answer", "resolve": lambda r: r.get("current_value")},
            {
                "key": "confidence",
                "label": "Confidence",
                "resolve": lambda r: (r.get("data") or {}).get("confidence"),
            },
        ],
    },
}

_DEFAULT_IO: dict = {
    "inputs": [
        {"key": "value", "label": "Input Value", "state_key": "current_value"},
    ],
    "outputs": [
        {"key": "output", "label": "Node Output", "resolve": lambda r: r.get("current_value")},
    ],
}


def get_node_io(node_type: str | None) -> dict:
    return NODE_IO.get(node_type or "", _DEFAULT_IO)


def find_input(node_type: str | None, key: str) -> dict | None:
    return next((i for i in get_node_io(node_type)["inputs"] if i["key"] == key), None)


def find_output(node_type: str | None, key: str) -> dict | None:
    return next((o for o in get_node_io(node_type)["outputs"] if o["key"] == key), None)


def _public(io: dict) -> dict:
    return {
        "inputs":  [{"key": i["key"], "label": i["label"]} for i in io["inputs"]],
        "outputs": [{"key": o["key"], "label": o["label"]} for o in io["outputs"]],
    }


def public_node_io() -> dict:
    return {
        "nodes":   {t: _public(io) for t, io in NODE_IO.items()},
        "default": _public(_DEFAULT_IO),
    }



def primary_value(node_type: str | None, result) -> object:
    """The node's primary output value (first declared output), used for display/history."""
    if not isinstance(result, dict):
        return None
    try:
        return get_node_io(node_type)["outputs"][0]["resolve"](result)
    except Exception:
        return None