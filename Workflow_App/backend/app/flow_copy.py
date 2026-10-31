# app/flow_copy.py
# Flow duplication: COPY_<n>_OF naming (persisted counter) + private-variable cloning.

import copy

from app import db


def _m(mapping, x):
    if x is None or x == "":
        return x
    try:
        return mapping.get(int(x), x)
    except (TypeError, ValueError):
        return x


def remap_variables(data, mapping):
    if not mapping:
        return data
    d = copy.deepcopy(data or {})
    v = d.get("variable")
    if isinstance(v, dict):
        if v.get("variable_id") is not None:
            v["variable_id"] = _m(mapping, v["variable_id"])
        im = v.get("input_mapping")
        if isinstance(im, dict):
            if im.get("variable_id") is not None:
                im["variable_id"] = _m(mapping, im["variable_id"])
            for b in (im.get("bindings") or {}).values():
                if isinstance(b, dict) and b.get("variable_id") is not None:
                    b["variable_id"] = _m(mapping, b["variable_id"])
        om = v.get("output_mapping")
        if isinstance(om, dict):
            if om.get("variable_id") is not None:
                om["variable_id"] = _m(mapping, om["variable_id"])
            if isinstance(om.get("bindings"), dict):
                om["bindings"] = {
                    (k if k == "" else str(_m(mapping, k))): b for k, b in om["bindings"].items()
                }
            if isinstance(om.get("order"), list):
                om["order"] = [k if k == "" else str(_m(mapping, k)) for k in om["order"]]
    disp = d.get("display")
    if isinstance(disp, dict) and isinstance(disp.get("variable_ids"), list):
        disp["variable_ids"] = [_m(mapping, x) for x in disp["variable_ids"]]
    return d


async def duplicate_flow(flow_id: int, same_group: bool = True, group_id: str | None = None):
    src = await db.get_flow(flow_id)
    if not src:
        return None
    target = src.get("group_id") if same_group else group_id
    created = await db.create_flow(src["name"], group_id=target, copy_of=src["name"])
    try:
        mapping = {}
        for v in await db.list_variables(flow_id):
            if v["visibility"] == "private" and v["flow_id"] == flow_id:
                c = await db.create_variable(v["name"], "private", created["flow_id"])
                mapping[v["variable_id"]] = c["variable_id"]
        nodes = [{**n, "data": remap_variables(n.get("data") or {}, mapping)} for n in src["nodes"]]
        await db.save_flow(created["flow_id"], created["name"], nodes, src["edges"], src["input_value"])
    except Exception:
        await db.delete_flow(created["flow_id"])
        raise
    return created