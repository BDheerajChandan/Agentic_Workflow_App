# app/variables.py
# Variable definitions live in the DB; runtime values live only in a VariableRuntime
# instance, which is created per workflow execution.

from __future__ import annotations

import threading
from typing import Any

from app.nodes.io_schema import get_node_io

SOURCES = ("node_output", "static")


class VariableError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _upgrade_legacy(cfg: dict, io: dict) -> dict:
    """Convert the old {mode, variable_id, source, static_value} shape to mappings."""
    mode = str(cfg.get("mode") or "").strip().lower()
    if mode == "read":
        return {
            "input_mapping": {
                "enabled": True,
                "variable_id": cfg.get("variable_id"),
                "target": io["inputs"][0]["key"],
            }
        }
    if mode == "assign":
        return {
            "output_mapping": {
                "enabled": True,
                "variable_id": cfg.get("variable_id"),
                "source": cfg.get("source") or "node_output",
                "output": io["outputs"][0]["key"],
                "static_value": cfg.get("static_value"),
            }
        }
    raise VariableError("Variable mode must be 'assign' or 'read'.")


# ─── Binding dictionaries ─────────────────────────────────────────────────────
# bindings: dict (1 key = single mapping, n keys = multiple mappings)
# order:    list of keys; JSONB does not preserve object key order, arrays it does.

def _ordered(bindings: dict, order) -> list[tuple[str, Any]]:
    seen: set[str] = set()
    keys: list[str] = []
    for k in order if isinstance(order, list) else []:
        if isinstance(k, str) and k in bindings and k not in seen:
            seen.add(k)
            keys.append(k)
    for k in bindings:
        if k not in seen:
            seen.add(k)
            keys.append(k)
    return [(k, bindings[k]) for k in keys]


def _bindings(mapping: dict, kind: str) -> list[tuple[str, dict]]:
    """Ordered (key, value) pairs for both the dictionary shape and the legacy flat shape."""
    raw = mapping.get("bindings")
    if isinstance(raw, dict):
        return [
            (k, v if isinstance(v, dict) else {})
            for k, v in _ordered(raw, mapping.get("order"))
        ]
    # legacy flat single mapping == one-key dictionary
    if kind == "input":
        return [(
            str(mapping.get("target") or "").strip(),
            {"variable_id": mapping.get("variable_id")},
        )]
    vid = mapping.get("variable_id")
    return [(
        "" if vid is None else str(vid),
        {k: mapping.get(k) for k in ("source", "output", "static_value")},
    )]


def _to_variable_id(raw, label: str) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise VariableError(f"{label}: no variable selected.")


def _parse_input(mapping: dict, io: dict) -> list[dict]:
    label = "Input Value Mapping"
    by_key = {i["key"]: i for i in io["inputs"]}
    parsed: list[dict] = []

    for key, binding in _bindings(mapping, "input"):
        target = str(key or "").strip()
        if not target:
            raise VariableError(f"{label}: select a target input.")
        if target not in by_key:
            raise VariableError(f"{label}: input '{target}' does not exist on this node.")
        parsed.append({
            "variable_id": _to_variable_id(binding.get("variable_id"), label),
            "target": target,
        })

    if len(parsed) > len(io["inputs"]):
        raise VariableError(
            f"{label}: this node supports at most {len(io['inputs'])} input mapping(s)."
        )
    targets = [p["target"] for p in parsed]
    state_keys = [by_key[t]["state_key"] for t in targets]
    if len(set(targets)) != len(targets) or len(set(state_keys)) != len(state_keys):
        raise VariableError(f"{label}: conflicting mappings, an input is mapped more than once.")
    return parsed


def _parse_output(mapping: dict, io: dict) -> list[dict]:
    label = "Output Value Mapping"
    outputs = {o["key"] for o in io["outputs"]}
    parsed: list[dict] = []

    for key, binding in _bindings(mapping, "output"):
        variable_id = _to_variable_id(key, label)
        source = str(binding.get("source") or "node_output").strip().lower()
        if source not in SOURCES:
            raise VariableError(f"{label}: source must be 'Node Output' or 'Static Value'.")

        item: dict[str, Any] = {"variable_id": variable_id, "source": source}
        if source == "static":
            value = binding.get("static_value")
            if value is None or value == "":
                raise VariableError(f"{label}: Static Value source requires a value.")
            item["static_value"] = value
        else:
            output = str(binding.get("output") or "").strip()
            if not output:
                raise VariableError(f"{label}: select a source output.")
            if output not in outputs:
                raise VariableError(f"{label}: output '{output}' does not exist on this node.")
            item["output"] = output
        parsed.append(item)

    ids = [p["variable_id"] for p in parsed]
    if len(set(ids)) != len(ids):
        raise VariableError(f"{label}: conflicting mappings, a variable is assigned more than once.")
    return parsed


def parse_variable_config(node_data: dict | None, node_type: str | None = None) -> dict | None:
    """
    Returns {"input": [ {variable_id, target}, ... ] | None,
             "output": [ {variable_id, source, output|static_value}, ... ] | None}
    in configured order, or None when variables are disabled / no mapping is enabled.
    """
    cfg = (node_data or {}).get("variable")
    if not isinstance(cfg, dict) or not cfg.get("enabled"):
        return None

    io = get_node_io(node_type)

    if "input_mapping" not in cfg and "output_mapping" not in cfg and "mode" in cfg:
        cfg = _upgrade_legacy(cfg, io)

    im = cfg.get("input_mapping")
    om = cfg.get("output_mapping")

    parsed = {
        "input":  (_parse_input(im, io) or None)  if isinstance(im, dict) and im.get("enabled") else None,
        "output": (_parse_output(om, io) or None) if isinstance(om, dict) and om.get("enabled") else None,
    }
    if not parsed["input"] and not parsed["output"]:
        return None
    return parsed


class VariableRuntime:
    def __init__(self, definitions: list[dict], flow_id: int | None):
        self.flow_id = flow_id
        self._defs = {d["variable_id"]: d for d in definitions}
        self._values: dict[int, Any] = {}
        self._lock = threading.Lock()

    def definition(self, variable_id: int) -> dict:
        d = self._defs.get(variable_id)
        if not d:
            raise VariableError(f"Variable (id {variable_id}) does not exist.", 404)
        if d["visibility"] == "private" and d["flow_id"] != self.flow_id:
            raise VariableError(
                f"Variable '{d['name']}' is private to another workflow and cannot be used here.",
                403,
            )
        return d

    def validate_nodes(self, nodes) -> None:
        for node in nodes:
            try:
                cfg = parse_variable_config(node.data, node.type)
                if cfg:
                    for key in ("input", "output"):
                        for binding in cfg[key] or []:
                            self.definition(binding["variable_id"])
            except VariableError as exc:
                raise VariableError(
                    f"Node '{node.id}' ({node.type}): {exc.message}", exc.status_code
                )

    def assign(self, variable_id: int, value: Any) -> None:
        self.definition(variable_id)
        with self._lock:
            self._values[variable_id] = value

    def read(self, variable_id: int) -> Any:
        d = self.definition(variable_id)
        with self._lock:
            if variable_id not in self._values:
                raise VariableError(
                    f"Variable '{d['name']}' was read before it was assigned in this execution."
                )
            return self._values[variable_id]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            items = list(self._values.items())
        out: dict[str, Any] = {}
        for variable_id, value in items:
            d = self._defs[variable_id]
            key = d["name"]
            if key in out:
                key = f"{key} ({d['visibility']})"
            out[key] = value
        return out