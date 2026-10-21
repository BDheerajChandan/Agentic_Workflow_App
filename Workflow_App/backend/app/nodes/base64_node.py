# app/nodes/base64_node.py

import base64
import binascii
import json


def base64_node(state, config):
    cfg = config or {}

    operation = str(cfg.get("operation") or "encode").strip().lower()
    if operation not in ("encode", "decode"):
        raise ValueError("Base64 E/D: operation must be 'encode' or 'decode'.")

    # Connected / mapped value first, static settings value as fallback
    value = state.get("current_value")
    if value is None or (isinstance(value, str) and value == ""):
        value = cfg.get("input_value")
    if value is None or (isinstance(value, str) and value == ""):
        raise ValueError(
            "Base64 E/D: input value is required (connect a node, map a variable, or enter a value)."
        )

    if isinstance(value, str):
        text = value
    elif isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False)
    else:
        text = str(value)

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