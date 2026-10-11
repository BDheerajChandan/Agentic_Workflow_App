# app/graph/builder.py

import json
import time

from langgraph.graph import StateGraph, END

from app.graph.state import GraphState
from app.nodes.io_schema import find_input, find_output, primary_value
from app.nodes.registry import NODE_REGISTRY
from app.variables import VariableError, VariableRuntime, parse_variable_config


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


def build_graph(nodes, edges, event_callback=None, variable_defs=None, flow_id=None):

    if not nodes:
        raise Exception("No nodes provided")

    # Runtime variable context: one per build_graph call == one per execution.
    runtime = VariableRuntime(variable_defs or [], flow_id)
    runtime.validate_nodes(nodes)

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
                try:
                    transient_key = None

                    # ── Input Value Mapping: Variable → Node Input ──────────
                    if var_cfg and var_cfg["input"]:
                        im = var_cfg["input"]
                        target = find_input(node_type, im["target"])
                        if not target:
                            raise VariableError(
                                f"Input '{im['target']}' does not exist on node type '{node_type}'."
                            )
                        value = runtime.read(im["variable_id"])
                        run_state = {**state, target["state_key"]: value}
                        if target.get("transient"):
                            transient_key = target["state_key"]

                    result = fn(run_state, config)

                    if transient_key and transient_key not in state:
                        result = {k: v for k, v in result.items() if k != transient_key}

                    # ── Output Value Mapping: Node Output / Static → Variable ─
                    if var_cfg and var_cfg["output"]:
                        om = var_cfg["output"]
                        if om["source"] == "static":
                            value = om["static_value"]
                        else:
                            source = find_output(node_type, om["output"])
                            if not source:
                                raise VariableError(
                                    f"Output '{om['output']}' does not exist on node type '{node_type}'."
                                )
                            value = source["resolve"](result)
                            if value is None:
                                raise VariableError(
                                    f"Output '{source['label']}' produced no value to store."
                                )
                        runtime.assign(om["variable_id"], value)

                    snapshot = runtime.snapshot()
                    if snapshot:
                        result = {**result, "variables": snapshot}
                except Exception as exc:
                    error = str(exc)
                    raise
                finally:
                    if event_callback:
                        event_callback(node_id, "trace", {
                            "node_id": node_id,
                            "node_type": node_type,
                            "status": "failed" if error else "passed",
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

    for edge in edges:
        graph.add_edge(edge.source, edge.target)

    output_found = False
    for node in nodes:
        if node.type == "output":
            graph.add_edge(node.id, END)
            output_found = True

    if not output_found:
        last_node = nodes[-1]
        graph.add_edge(last_node.id, END)

    return graph.compile()