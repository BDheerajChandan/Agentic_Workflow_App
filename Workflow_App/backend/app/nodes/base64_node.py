# app/nodes/base64_node.py

import base64
import binascii
import json


def _text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _empty(value):
    return value is None or (isinstance(value, str) and value == "")


def base64_node(state, config):
    cfg = config or {}

    operation = str(cfg.get("operation") or "encode").strip().lower()
    if operation not in ("encode", "decode"):
        raise ValueError("Base64 E/D: operation must be 'encode' or 'decode'.")

    mode = str(cfg.get("config_mode") or "").strip().lower()
    runtime_value = state.get("current_value")
    static_value = cfg.get("input_value")

    if mode == "static":
        value = static_value
        if _empty(value):
            raise ValueError("Base64 E/D: input value is required in Static mode.")
    elif mode == "dynamic":
        value = runtime_value
        if _empty(value):
            raise ValueError(
                "Base64 E/D: no runtime input resolved in Dynamic mode (map a variable or connect a node)."
            )
    else:
        # legacy workflows (no mode saved): connected/mapped value first, setting as fallback
        value = runtime_value if not _empty(runtime_value) else static_value
        if _empty(value):
            raise ValueError(
                "Base64 E/D: input value is required (connect a node, map a variable, or enter a value)."
            )

    text = _text(value)

    if operation == "encode":
        result = base64.b64encode(text.encode("utf-8")).decode("utf-8")
    else:
        try:
            result = base64.b64decode("".join(text.split()), validate=True).decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("Base64 E/D: decoded bytes are not valid UTF-8 text.")
        except (binascii.Error, ValueError) as exc:
            raise ValueError(f"Base64 E/D: invalid Base64 input ({exc}).")

    return {
        "current_value": result,
        "data": {
            **state.get("data", {}),
            "base64": result,
            "base64_operation": operation,
        },
    }