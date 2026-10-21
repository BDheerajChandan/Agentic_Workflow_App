# nodes/type_converter.py

import ast
import json

# ─── Advanced (Type Explorer) support ─────────────────────────────────────────

TYPE_MAP = {
    "int": int,
    "float": float,
    "str": str,
    "list": list,
    "tuple": tuple,
    "set": set,
    "dict": dict,
    "bool": bool,
}

CONVERSION_MAP = {
    "int":   ["str()", "float()", "bool()"],
    "float": ["int()", "str()", "bool()"],
    "str":   ["int()", "float()", "bool()", "list()"],
    "list":  ["tuple()", "set()", "str()", "len()"],
    "tuple": ["list()", "set()", "str()", "len()"],
    "set":   ["list()", "tuple()", "str()", "len()"],
    "dict":  ["str()", "len()", "json.dumps()"],
    "bool":  ["int()", "str()"],
}

CONVERSION_FUNCS = {
    "int()": int,
    "float()": float,
    "str()": str,
    "bool()": bool,
    "list()": list,
    "tuple()": tuple,
    "set()": set,
    "len()": len,
    "json.dumps()": json.dumps,
}

ALL_CONVERSIONS = list(CONVERSION_FUNCS.keys())

# str.format / format_map allow attribute traversal inside format strings
BLOCKED_METHODS = {"format", "format_map"}
MAX_ARG_INT = 1_000_000


def _methods_for(type_name):
    return [
        m for m in dir(TYPE_MAP[type_name])
        if not m.startswith("_") and m not in BLOCKED_METHODS
    ]


def get_converter_meta():
    return {
        "types": list(TYPE_MAP.keys()),
        "conversions": ALL_CONVERSIONS,
        "methods": {
            t: CONVERSION_MAP.get(t, []) + _methods_for(t) for t in TYPE_MAP
        },
    }


def parse_input(raw):
    if isinstance(raw, str):
        try:
            return ast.literal_eval(raw.strip())
        except (ValueError, SyntaxError, MemoryError, RecursionError):
            return raw
    return raw


def detect_type_name(raw):
    return type(parse_input(raw)).__name__


def _parse_args(text):
    text = str(text or "").strip()
    if not text:
        return []
    try:
        args = list(ast.literal_eval(f"({text},)"))
    except (ValueError, SyntaxError):
        args = [text]
    for a in args:
        if isinstance(a, int) and not isinstance(a, bool) and abs(a) > MAX_ARG_INT:
            raise ValueError("Type Converter: numeric argument is too large.")
    return args


def _resolve_value(raw, declared):
    if declared == "auto":
        return parse_input(raw)
    if declared not in TYPE_MAP:
        raise ValueError(f"Type Converter: unsupported input type '{declared}'.")
    if declared == "str":
        return raw if isinstance(raw, str) else str(raw)
    value = parse_input(raw)
    target = TYPE_MAP[declared]
    if type(value) is target:
        return value
    try:
        return target(value)
    except Exception as exc:
        raise ValueError(
            f"Type Converter: cannot interpret input as {declared} ({exc})."
        )


def _advanced(state, config):
    data = state.get("data", {})

    raw = state.get("current_value")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raw = config.get("input_value")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise ValueError(
            "Type Converter: input value is required (connect a node, map a variable, or enter a value)."
        )

    declared = str(config.get("input_type") or "auto").strip().lower()
    method = str(config.get("method") or "").strip()
    if not method:
        raise ValueError("Type Converter: select an operation / method.")

    value = _resolve_value(raw, declared)

    if method in CONVERSION_FUNCS:
        try:
            result = CONVERSION_FUNCS[method](value)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError(
                f"Type Converter: {method} is not applicable to {type(value).__name__} ({exc})."
            )
    else:
        type_name = type(value).__name__
        if type_name not in TYPE_MAP:
            raise ValueError(f"Type Converter: unsupported input type '{type_name}'.")
        if method not in _methods_for(type_name):
            raise ValueError(
                f"Type Converter: method '{method}' is not supported for type '{type_name}'."
            )
        attr = getattr(value, method)
        if callable(attr):
            args = _parse_args(config.get("method_args"))
            try:
                out = attr(*args)
            except Exception as exc:
                raise ValueError(f"Type Converter: {type_name}.{method}() failed ({exc}).")
            result = value if out is None else out  # in-place methods
        else:
            result = attr

    return {
        "current_value": result,
        "data": {
            **data,
            "converted": result,
            "converted_type": type(result).__name__,
        },
    }


# ─── Node ─────────────────────────────────────────────────────────────────────

def type_converter_node(state, config):
    """
    Converts the most recent data value in state["data"].
    Reads from "start" key (written by start_node),
    or falls back to any last available value.
    operation == "advanced" -> Type Explorer (type detection, built-ins, object methods).
    """
    print("state of type_converter_node : ", state)

    op = config.get("operation", "str")

    if op == "advanced":
        return _advanced(state, config)

    data = state.get("data", {})

    value = state.get("current_value", "")

    split_param = config.get("split_param", " ")

    if op == "str":
        result = str(value)
    elif op == "len":
        result = len(str(value))
    elif op == "split":
        if split_param:
            result = str(value).split(split_param)
        else:
            result = str(value).split()
    elif op == "upper":
        result = str(value).upper()
    elif op == "lower":
        result = str(value).lower()
    elif op == "strip":
        result = str(value).strip()
    else:
        result = value

    return {

    "current_value": result,

    "data": {
        **data,
        "converted": result,
        "converted_type": type(result).__name__,
    }
}