# app/variables.py
# Variable definitions live in the DB; runtime values live only in a VariableRuntime
# instance, which is created per workflow execution.

from __future__ import annotations

import threading
from typing import Any

MODES = ("assign", "read")
SOURCES = ("node_output", "static")


class VariableError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def parse_variable_config(node_data: dict | None) -> dict | None:
    """Return a normalised variable config for a node, or None when disabled."""
    cfg = (node_data or {}).get("variable")
    if not isinstance(cfg, dict) or not cfg.get("enabled"):
        return None

    mode = str(cfg.get("mode") or "").strip().lower()
    if mode not in MODES:
        raise VariableError("Variable mode must be 'assign' or 'read'.")

    try:
        variable_id = int(cfg.get("variable_id"))
    except (TypeError, ValueError):
        raise VariableError("No variable selected.")

    parsed: dict[str, Any] = {"mode": mode, "variable_id": variable_id}

    if mode == "assign":
        source = str(cfg.get("source") or "").strip().lower()
        if source not in SOURCES:
            raise VariableError("Value source must be 'Node Output' or 'Static Value'.")
        if source == "static":
            value = cfg.get("static_value")
            if value is None or value == "":
                raise VariableError("Static Value source requires a value.")
            parsed["static_value"] = value
        parsed["source"] = source

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
                cfg = parse_variable_config(node.data)
                if cfg:
                    self.definition(cfg["variable_id"])
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