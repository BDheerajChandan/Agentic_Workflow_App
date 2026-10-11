# app/graph/builder.py

from langgraph.graph import StateGraph, END

from app.graph.state import GraphState
from app.nodes.registry import NODE_REGISTRY, NODE_OUTPUT_RESOLVERS
from app.variables import VariableRuntime, parse_variable_config


def _node_output(node_type, result, run_state):
    resolver = NODE_OUTPUT_RESOLVERS.get(node_type)
    if resolver:
        return resolver(result)
    if "current_value" in result:
        return result["current_value"]
    if "final_output" in result:
        return result["final_output"]
    return run_state.get("current_value")


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

        def create_wrapped_function(fn, config, node_id, node_type, is_entry, var_cfg):

            def wrapped(state):
                if event_callback:
                    event_callback(node_id, "running")
                try:
                    run_state = state

                    if var_cfg and var_cfg["mode"] == "read":
                        value = runtime.read(var_cfg["variable_id"])
                        run_state = {**state, "current_value": value}
                        if is_entry:
                            run_state["input"] = value

                    result = fn(run_state, config)

                    if var_cfg and var_cfg["mode"] == "assign":
                        if var_cfg["source"] == "static":
                            value = var_cfg["static_value"]
                        else:
                            value = _node_output(node_type, result, run_state)
                        runtime.assign(var_cfg["variable_id"], value)

                    snapshot = runtime.snapshot()
                    if snapshot:
                        result = {**result, "variables": snapshot}
                finally:
                    if event_callback:
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
                node.id not in targets,
                parse_variable_config(node.data),
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