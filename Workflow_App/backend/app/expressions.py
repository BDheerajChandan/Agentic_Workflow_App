# app/expressions.py
# Safe, type-aware expression / condition evaluation. No eval(), no exec().

import ast
import json
import re

MAX_EXPR_LEN = 1000
MAX_AST_NODES = 200
MAX_CONDITIONS = 50
OPERATORS = ("<", ">", "<=", ">=", "==", "!=")
ALIASES = {
    "generate": "rag_generate",
    "retrieve": "rag_retrieve",
    "if-else": "if_else",
    "ifelse": "if_else",
}

_REF = re.compile(r"\{\{\s*(.+?)\s*\}\}")
_TOKEN = re.compile(r"\[(\d+)\]|([^.\[\]]+)")
_STR = re.compile(r"""("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')""")
_NUM = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_INT = re.compile(r"^[+-]?\d+$")


class ExpressionError(ValueError):
    pass


# ─── Context / reference resolution ───────────────────────────────────────────

def build_context(state, config=None) -> dict:
    data = state.get("data") or {}
    return {
        "variables": dict((config or {}).get("__variables") or {}),
        "names": data.get("__names") or {},
        "nodes": data.get("__nodes") or {},
        "types": data.get("__types") or {},
        "outs": data.get("__outs") or {},
        "input": state.get("input"),
    }


def _split_path(path: str) -> list:
    return [
        int(m.group(1)) if m.group(1) is not None else m.group(2).strip()
        for m in _TOKEN.finditer(path)
    ]


def _root(ctx, root, ref):
    for key in ("variables", "names", "nodes"):
        if root in ctx[key]:
            return ctx[key][root]
    low = root.lower()
    low = ALIASES.get(low, low)
    if low in ctx["types"]:
        return ctx["types"][low]
    if low == "start":
        return ctx["input"]
    raise ExpressionError(f"Variable '{ref}' could not be resolved: '{root}' not found.")


def _descend(value, tokens, ref):
    for t in tokens:
        if isinstance(value, str) and value.strip()[:1] in ("[", "{"):
            try:
                value = json.loads(value)
            except ValueError:
                pass
        if isinstance(t, int):
            if not isinstance(value, (list, tuple)) or t >= len(value):
                raise ExpressionError(f"Cannot resolve '{ref}': index {t} is unavailable.")
            value = value[t]
        else:
            if not isinstance(value, dict) or t not in value:
                raise ExpressionError(f"Cannot resolve '{ref}': key '{t}' not found.")
            value = value[t]
    return value


def resolve_ref(ref: str, ctx: dict):
    tokens = _split_path(ref.strip())
    if not tokens:
        raise ExpressionError("Empty variable reference.")
    root, rest = str(tokens[0]), tokens[1:]
    if root not in ctx["variables"] and rest and isinstance(rest[0], str):
        low = root.lower()
        outs = ctx.get("outs", {}).get(root) or ctx.get("outs", {}).get(ALIASES.get(low, low))
        if isinstance(outs, dict) and rest[0] in outs:
            return _descend(outs[rest[0]], rest[1:], ref)
    return _descend(_root(ctx, root, ref), rest, ref)


def has_template(value) -> bool:
    return isinstance(value, str) and bool(_REF.search(value))


def _text(v) -> str:
    return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str)


def interpolate(value, ctx):
    """Single {{ref}} keeps the raw typed value; mixed text is string-interpolated."""
    if not isinstance(value, str):
        return value
    m = _REF.fullmatch(value.strip())
    if m:
        return resolve_ref(m.group(1), ctx)
    return _REF.sub(lambda mm: _text(resolve_ref(mm.group(1), ctx)), value)


def render(obj, ctx):
    if isinstance(obj, str):
        return interpolate(obj, ctx)
    if isinstance(obj, list):
        return [render(i, ctx) for i in obj]
    if isinstance(obj, dict):
        return {k: render(v, ctx) for k, v in obj.items()}
    return obj


def parse_literal(text):
    if not isinstance(text, str):
        return text
    s = text.strip()
    low = s.lower()
    if low in ("null", "none"):
        return None
    if low == "true":
        return True
    if low == "false":
        return False
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    if _INT.match(s):
        return int(s)
    if _NUM.match(s):
        return float(s)
    return text


# ─── Type-aware comparison ────────────────────────────────────────────────────

def _is_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def values_equal(a, b) -> bool:
    if _is_num(a) and _is_num(b):
        return a == b
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if a is None or b is None:
        return a is None and b is None
    if type(a) is not type(b):
        return False
    return a == b


def compare(a, op, b) -> bool:
    if op == "==":
        return values_equal(a, b)
    if op == "!=":
        return not values_equal(a, b)
    if op in ("in", "not in"):
        if isinstance(b, str):
            if not isinstance(a, str):
                raise ExpressionError(f"Cannot test {type(a).__name__} in str.")
            hit = a in b
        elif isinstance(b, (list, tuple)):
            hit = any(values_equal(a, i) for i in b)
        elif isinstance(b, dict):
            hit = a in b
        else:
            raise ExpressionError(f"'{op}' needs a list, string or object on the right.")
        return hit if op == "in" else not hit
    if a is None or b is None:
        raise ExpressionError(f"Cannot compare null using '{op}'.")
    if not ((_is_num(a) and _is_num(b)) or (isinstance(a, str) and isinstance(b, str))):
        raise ExpressionError(
            f"Cannot compare {type(a).__name__} with {type(b).__name__} using '{op}'."
        )
    return {"<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b}[op]


# ─── Safe AST evaluator ───────────────────────────────────────────────────────

_CMP = {
    ast.Lt: "<", ast.Gt: ">", ast.LtE: "<=", ast.GtE: ">=",
    ast.Eq: "==", ast.NotEq: "!=", ast.In: "in", ast.NotIn: "not in",
}


def _ev(node, names):
    if isinstance(node, ast.Constant):
        if node.value is None or isinstance(node.value, (bool, int, float, str)):
            return node.value
        raise ExpressionError("Unsupported literal.")
    if isinstance(node, ast.Name):
        if node.id in names:
            return names[node.id]
        raise ExpressionError(f"Unknown name '{node.id}'. Use {{{{Node.field}}}} references.")
    if isinstance(node, ast.UnaryOp):
        v = _ev(node.operand, names)
        if isinstance(node.op, ast.Not):
            return not _truth(v)
        if isinstance(v, LooseStr):
            v = _auto_parse(v)
        if isinstance(node.op, ast.USub) and _is_num(v):
            return -v
        if isinstance(node.op, ast.UAdd) and _is_num(v):
            return v
        raise ExpressionError("Unsupported unary operation.")
    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            return all(_truth(_ev(v, names)) for v in node.values)
        return any(_truth(_ev(v, names)) for v in node.values)
    if isinstance(node, ast.Compare):
        left = _ev(node.left, names)
        for op, comp in zip(node.ops, node.comparators):
            sym = _CMP.get(type(op))
            if not sym:
                raise ExpressionError("Unsupported comparison operator.")
            right = _ev(comp, names)
            l2, r2 = _pair(left, right)
            if not compare(l2, sym, r2):
                return False
            left = right
        return True
    if isinstance(node, ast.BinOp):
        a, b = _pair(_ev(node.left, names), _ev(node.right, names), arith=True)
        if isinstance(node.op, ast.Add) and isinstance(a, str) and isinstance(b, str):
            return a + b
        if not (_is_num(a) and _is_num(b)):
            raise ExpressionError(
                f"Arithmetic requires numbers (got {type(a).__name__} and {type(b).__name__}). "
                "Set the Expression Type to int/float or use {{ref:int}}."
            )
        try:
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
            if isinstance(node.op, ast.Mult):
                return a * b
            if isinstance(node.op, ast.Div):
                return a / b
            if isinstance(node.op, ast.FloorDiv):
                return a // b
            if isinstance(node.op, ast.Mod):
                return a % b
        except ZeroDivisionError:
            raise ExpressionError("Division by zero.")
        raise ExpressionError("Unsupported arithmetic operator.")
    if isinstance(node, (ast.List, ast.Tuple)):
        return [_ev(e, names) for e in node.elts]
    raise ExpressionError(f"Unsupported expression element: {type(node).__name__}.")


def _keywords(expr: str) -> str:
    parts = _STR.split(expr)
    for i in range(0, len(parts), 2):
        p = parts[i]
        for pat, rep in (
            (r"\bAND\b", "and"), (r"\bOR\b", "or"), (r"\bNOT\b", "not"),
            (r"\bNULL\b", "None"), (r"\bTRUE\b", "True"), (r"\bFALSE\b", "False"),
        ):
            p = re.sub(pat, rep, p, flags=re.I)
        parts[i] = p
    return "".join(parts)


_CAST = re.compile(r"^(.*?)\s*:\s*([A-Za-z]+)\s*$")


def _split_cast(inner: str):
    m = _CAST.match(inner)
    if m and m.group(2).strip().lower() in TYPE_ALIASES:
        return m.group(1).strip(), m.group(2).strip().lower()
    return inner.strip(), None


def evaluate_expression(expr, ctx, default_type="auto"):
    """{{ref}} / {{ref:int}} placeholders are typed (auto/str/int/float/bool/list/dict/null)."""
    if not isinstance(expr, str) or not expr.strip():
        raise ExpressionError("Expression is empty.")
    if len(expr) > MAX_EXPR_LEN:
        raise ExpressionError(f"Expression exceeds {MAX_EXPR_LEN} characters.")
    names: dict = {}

    def sub(m):
        ref, cast = _split_cast(m.group(1))
        value = resolve_ref(ref, ctx)
        t = normalize_type(cast or default_type)
        if t == "auto":
            value = LooseStr(value) if isinstance(value, str) else value
        else:
            value = coerce_value(value, t, f"{{{{{ref}}}}}")
        key = f"__v{len(names)}"
        names[key] = value
        return key

    prepared = _keywords(_REF.sub(sub, expr)).strip()
    try:
        tree = ast.parse(prepared, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Invalid expression syntax: {exc.msg}.")
    except (ValueError, RecursionError, MemoryError):
        raise ExpressionError("Expression is too complex.")
    if sum(1 for _ in ast.walk(tree)) > MAX_AST_NODES:
        raise ExpressionError("Expression is too complex.")
    result = _ev(tree.body, names)
    return _auto_parse(result) if isinstance(result, LooseStr) else result

# ─── Operand typing (If-Else left / right type) ───────────────────────────────

TYPE_ALIASES = {
    "": "auto", "auto": "auto",
    "str": "str", "string": "str",
    "int": "int", "integer": "int",
    "float": "float", "number": "float",
    "bool": "bool", "boolean": "bool",
    "null": "null", "none": "null",
    "list": "list", "array": "list",
    "dict": "dict", "object": "dict", "json": "dict",
}


def normalize_type(typ) -> str:
    t = TYPE_ALIASES.get(str(typ or "auto").strip().lower())
    if not t:
        raise ExpressionError(f"Unsupported type '{typ}'. Use auto, str, int, float, bool or null.")
    return t


def _unquote(s: str) -> str:
    t = s.strip()
    return t[1:-1] if len(t) >= 2 and t[0] == t[-1] and t[0] in "\"'" else s


def coerce_value(value, typ, label="value"):
    """Cast a resolved (variable / node / static) value to an explicit type. 'auto' keeps it as is."""
    t = normalize_type(typ)
    if t == "auto":
        return value
    try:
        if t == "null":
            return None
        if t == "str":
            return "" if value is None else _text(value)
        if t in ("list", "dict"):
            v = value
            if isinstance(v, str):
                v = json.loads(v)
            if isinstance(v, tuple):
                v = list(v)
            if not isinstance(v, list if t == "list" else dict):
                raise ValueError
            return v
        if t == "bool":
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)) and value in (0, 1):
                return bool(value)
            s = str(value).strip().lower()
            if s in ("true", "1", "yes"):
                return True
            if s in ("false", "0", "no"):
                return False
            raise ValueError
        if isinstance(value, bool) or value is None:
            raise ValueError
        if t == "int":
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                if value.is_integer():
                    return int(value)
                raise ValueError
            s = str(value).strip()
            if _INT.match(s):
                return int(s)
            if _NUM.match(s) and float(s).is_integer():
                return int(float(s))
            raise ValueError
        if t == "float":
            if isinstance(value, (int, float)):
                return float(value)
            s = str(value).strip()
            if _NUM.match(s):
                return float(s)
            raise ValueError
    except (ValueError, TypeError):
        shown = value if isinstance(value, str) else _text(value)
        raise ExpressionError(f"{label} '{shown}' cannot be converted to {t}.")
    raise ExpressionError(f"Unsupported type '{typ}'.")


def _typed_operand(raw, typ, ctx, label):
    """Resolve {{refs}} or a static value, then cast to the chosen type."""
    if has_template(raw):
        value = interpolate(raw, ctx)
    elif isinstance(raw, str):
        value = _unquote(raw) if normalize_type(typ) == "str" else raw
    else:
        value = raw
    return coerce_value(value, typ, label)


# ─── Condition editor rows ────────────────────────────────────────────────────

def evaluate_condition(cond: dict, ctx: dict) -> bool:
    if not isinstance(cond, dict):
        raise ExpressionError("Invalid condition.")
    op = str(cond.get("operator") or "==").strip()


    
    if op.lower() in ("custom", "custom expression"):
        return bool(evaluate_expression(
            cond.get("expression") or cond.get("custom_expression"),
            ctx,
            cond.get("expression_type") or "auto",
        ))
    
    if op not in OPERATORS:
        raise ExpressionError(f"Unsupported operator '{op}'.")

    raw_l, raw_r = cond.get("left"), cond.get("right")
    if raw_l is None or (isinstance(raw_l, str) and not raw_l.strip()):
        raise ExpressionError("Condition left operand is required.")
    left = interpolate(raw_l, ctx)
    right = interpolate(raw_r, ctx)

    r_static = isinstance(raw_r, str) and not has_template(raw_r)
    r_quoted = r_static and len(raw_r.strip()) >= 2 and raw_r.strip()[0] in "\"'"
    if r_static:
        right = parse_literal(raw_r)
    if isinstance(raw_l, str) and not has_template(raw_l):
        left = parse_literal(raw_l)

    # explicit operand types (auto = legacy behaviour)
    l_type, r_type = normalize_type(cond.get("left_type")), normalize_type(cond.get("right_type"))
    if l_type != "auto":
        left = _typed_operand(raw_l, l_type, ctx, "Left operand")
    if r_type != "auto":
        right = _typed_operand(raw_r, r_type, ctx, "Right operand")

    # auto operands arriving as text are coerced to the type of a typed other side
    if l_type == "auto" and isinstance(left, str) and not isinstance(right, str) and not isinstance(right, (list, dict)):
        left = parse_literal(left)
    elif r_type == "auto" and isinstance(right, str) and not isinstance(left, str) and not r_quoted and not r_static:
        right = parse_literal(right)
    return compare(left, op, right)


def evaluate_conditions(conds: list, ctx: dict):
    """AND binds tighter than OR; cond[i]['logic'] joins condition i to i+1."""
    if len(conds) > MAX_CONDITIONS:
        raise ExpressionError(f"At most {MAX_CONDITIONS} conditions are supported.")
    results = []
    for i, c in enumerate(conds, 1):
        try:
            results.append(evaluate_condition(c, ctx))
        except ExpressionError as exc:
            raise ExpressionError(f"Condition {i}: {exc}")
    groups = [[results[0]]]
    for i in range(1, len(results)):
        if str(conds[i - 1].get("logic") or "AND").upper() == "OR":
            groups.append([results[i]])
        else:
            groups[-1].append(results[i])
    return any(all(g) for g in groups), results


# ─── Switch helpers ───────────────────────────────────────────────────────────

def cast_case_value(value, typ):
    t = str(typ or "auto").strip().lower()
    try:
        if t == "auto":
            return parse_literal(value) if isinstance(value, str) else value
        if t in ("string", "str"):
            return "" if value is None else str(value)
        if t == "char":
            s = "" if value is None else str(value)
            if len(s) != 1:
                raise ExpressionError(f"Case value '{s}' must be a single character.")
            return s
        if t == "int":
            return int(str(value).strip())
        if t == "float":
            return float(str(value).strip())
        if t in ("bool", "boolean"):
            s = str(value).strip().lower()
            if s not in ("true", "false"):
                raise ExpressionError(f"Case value '{value}' is not a boolean.")
            return s == "true"
        if t == "null":
            return None
    except ValueError:
        raise ExpressionError(f"Case value '{value}' is not a valid {t}.")
    raise ExpressionError(f"Unsupported case type '{typ}'.")

class LooseStr(str):
    """Text from an auto-typed {{ref}}: acts as number/bool/null/list when the other side needs it."""


def _auto_parse(v):
    s = str(v).strip()
    low = s.lower()
    if low in ("null", "none"):
        return None
    if low == "true":
        return True
    if low == "false":
        return False
    if _INT.match(s):
        return int(s)
    if _NUM.match(s):
        return float(s)
    if s[:1] in ("[", "{"):
        try:
            return json.loads(s)
        except ValueError:
            pass
    return str(v)


def _truth(v):
    return bool(_auto_parse(v)) if isinstance(v, LooseStr) else bool(v)


def _pair(a, b, arith=False):
    la, lb = isinstance(a, LooseStr), isinstance(b, LooseStr)
    if not (la or lb):
        return a, b
    if la and lb:
        pa, pb = _auto_parse(a), _auto_parse(b)
        if arith or (_is_num(pa) and _is_num(pb)) or (type(pa) is type(pb) and not isinstance(pa, str)):
            return pa, pb
        return str(a), str(b)
    loose, other = (a, b) if la else (b, a)
    if isinstance(other, str):
        conv = str(loose)
    elif isinstance(other, (list, tuple)):
        p = _auto_parse(loose)
        conv = p if any(values_equal(p, i) for i in other) else str(loose)
    else:
        conv = _auto_parse(loose)
    return (conv, b) if la else (a, conv)