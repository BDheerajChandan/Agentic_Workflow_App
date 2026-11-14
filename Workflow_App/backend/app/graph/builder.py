# app/graph/builder.py

import json
import time

from langgraph.graph import StateGraph, END

from app.graph.state import GraphState
from app.nodes.io_schema import find_input, find_output, get_node_io, primary_value
from app.nodes.registry import NODE_REGISTRY
from app.pause import PauseRequested
from app.variables import VariableError, VariableRuntime, parse_variable_config, resolve_path

BRANCH_TYPES = {"if_else", "switch"}


def _router(node_id, routes):
    def route(state):
        branch = ((state.get("data") or {}).get("__route") or {}).get(node_id)
        targets = routes.get(branch) if branch else None
        return list(dict.fromkeys(targets)) if targets else END
    return route


def _safe(obj):
    if isinstance(obj, dict):
        return {k: _safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe(i) for i in obj]
    if hasattr(obj, "page_content"):
        return {"page_content": obj.page_content, "metadata": obj.metadata}
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def build_graph(
    nodes,
    edges,
    event_callback=None,
    variable_defs=None,
    flow_id=None,
    entry_node_id=None,
    initial_variables=None,
    node_overrides=None,
    token_callback=None,
):

    if not nodes:
        raise Exception("No nodes provided")

    # Runtime variable context: one per build_graph call == one per execution.
    runtime = VariableRuntime(variable_defs or [], flow_id)
    runtime.validate_nodes(nodes)
    if initial_variables:
        runtime.load_values(initial_variables)

    overrides = node_overrides or {}

    targets = set()
    for edge in edges:
        targets.add(edge.target)

    graph = StateGraph(GraphState)
    node_configs = {}

    for node in nodes:

        node_fn = NODE_REGISTRY.get(node.type)
        if not node_fn:
            raise Exception(f"Unknown node type: {node.type}")

        node_configs[node.id] = node

        def create_wrapped_function(fn, config, node_id, node_type, var_cfg):

            def wrapped(state):
                started = time.time()
                if event_callback:
                    event_callback(node_id, "running")
                run_state = state
                result = None
                error = None
                paused = False
                try:
                    transient_keys = set()

                    # ── Input Value Mapping: Variable → Node Input (configured order) ──
                    if var_cfg and var_cfg["input"]:
                        updates = {}
                        for im in var_cfg["input"]:
                            target = find_input(node_type, im["target"], config)
                            if not target:
                                raise VariableError(
                                    f"Input '{im['target']}' does not exist on node type '{node_type}'."
                                )
                            updates[target["state_key"]] = runtime.read(
                                im["variable_id"], im.get("path")
                            )
                            if target.get("transient"):
                                transient_keys.add(target["state_key"])
                        run_state = {**state, **updates}

                    result = fn(
                        run_state,
                        {
                            **(config or {}),
                            **overrides.get(node_id, {}),
                            "__flow_id": flow_id,
                            "__node_id": node_id,
                            "__variables": runtime.snapshot(),
                            "__stream": token_callback,
                        },
                    )

                    strip = {k for k in transient_keys if k not in state}
                    if strip:
                        result = {k: v for k, v in result.items() if k not in strip}

                    # ── Record node output for {{Node.field}} resolution ──
                    if isinstance(result, dict):
                        _cfg = config or {}
                        _prev = state.get("data") or {}
                        _data = dict(result.get("data") or {})
                        for _k in ("__nodes", "__types", "__names", "__outs", "__route"):
                            if _k not in _data and _k in _prev:
                                _data[_k] = _prev[_k]
                        _val = primary_value(node_type, result)
                        _outs = {}
                        for _o in get_node_io(node_type, config)["outputs"]:
                            try:
                                _outs[_o["key"]] = _o["resolve"](result)
                            except Exception:
                                _outs[_o["key"]] = None
                        for _k, _key in (
                            ("__nodes", node_id),
                            ("__types", node_type),
                            ("__names", _cfg.get("aka")),
                        ):
                            if _key:
                                _data[_k] = {**(_data.get(_k) or {}), _key: _val}
                        for _key in (node_id, node_type, _cfg.get("aka")):
                            if _key:
                                _data["__outs"] = {**(_data.get("__outs") or {}), _key: _outs}
                        result = {**result, "data": _data}

                    # ── Output Value Mapping: Node Output / Static → Variable (configured order) ──
                    if var_cfg and var_cfg["output"]:
                        for om in var_cfg["output"]:
                            if om["source"] == "static":
                                value = om["static_value"]
                            else:
                                source = find_output(node_type, om["output"], config)
                                if not source:
                                    raise VariableError(
                                        f"Output '{om['output']}' does not exist on node type '{node_type}'."
                                    )
                                value = source["resolve"](result)
                                if value is None:
                                    raise VariableError(
                                        f"Output '{source['label']}' produced no value to store."
                                    )
                                value = resolve_path(value, om.get("path"), source["label"])
                            runtime.assign(om["variable_id"], value)

                    snapshot = runtime.snapshot()
                    if snapshot:
                        result = {**result, "variables": snapshot}
                except PauseRequested as exc:
                    exc.state = run_state
                    exc.variables = runtime.export_values()
                    paused = True
                    raise
                except Exception as exc:
                    error = str(exc)
                    raise
                finally:
                    if event_callback:
                        event_callback(node_id, "trace", {
                            "node_id": node_id,
                            "node_type": node_type,
                            "aka": (config or {}).get("aka") or None,
                            "status": "paused" if paused else ("failed" if error else "passed"),
                            "input": _safe(run_state),
                            "output": _safe(result),
                            "value": _safe(primary_value(node_type, result)),
                            "error": error,
                            "duration_ms": int((time.time() - started) * 1000),
                        })
                        event_callback(node_id, "done")
                return result

            return wrapped

        graph.add_node(
            node.id,
            create_wrapped_function(
                node_fn,
                node.data,
                node.id,
                node.type,
                parse_variable_config(node.data, node.type),
            )
        )

    if entry_node_id:
        if entry_node_id not in node_configs:
            raise Exception(f"Resume entry node '{entry_node_id}' not found.")
        entry = entry_node_id
    else:
        entry_nodes = [node.id for node in nodes if node.id not in targets]

        if not entry_nodes:
            start_nodes = [node.id for node in nodes if node.type == "start"]
            if start_nodes:
                entry = start_nodes[0]
            else:
                raise Exception(
                    "No valid entry node found. Please connect graph properly."
                )
        else:
            entry = entry_nodes[0]

    graph.set_entry_point(entry)

    branch_ids = {n.id for n in nodes if n.type in BRANCH_TYPES}
    if_else_ids = {n.id for n in nodes if n.type == "if_else"}
    branch_routes: dict = {}
    for edge in edges:
        if edge.source in branch_ids:
            handle = getattr(edge, "sourceHandle", None) or "default"
            if edge.source in if_else_ids and handle not in ("true", "false"):
                continue  # legacy If-Else Default edge: never traversed, never converted
            branch_routes.setdefault(edge.source, {}).setdefault(handle, []).append(edge.target)
        else:
            graph.add_edge(edge.source, edge.target)

    for nid, routes in branch_routes.items():
        graph.add_conditional_edges(nid, _router(nid, routes))

    output_found = False
    for node in nodes:
        if node.type == "output":
            graph.add_edge(node.id, END)
            output_found = True

    if not output_found:
        last_node = nodes[-1]
        if last_node.id not in branch_ids:
            graph.add_edge(last_node.id, END)

    return graph.compile()