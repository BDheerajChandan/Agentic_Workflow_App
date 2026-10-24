# app/database/base.py
# Small shared helpers (no DB access).

import json
import secrets


def jsonable(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


def json_field(value):
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def deleted_count(result: str) -> int:
    return int(result.split()[-1])


def generate_route_slug() -> str:
    return secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:11]