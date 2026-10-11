# app/graph/builder.py

from langgraph.graph import StateGraph, END

from app.graph.state import GraphState
from app.nodes.registry import NODE_REGISTRY


def build_graph(nodes, edges, event_callback=None):

    if not nodes:
        raise Exception("No nodes provided")

    graph = StateGraph(GraphState)
    node_configs = {}

    for node in nodes:

        node_fn = NODE_REGISTRY.get(node.type)
        if not node_fn:
            raise Exception(f"Unknown node type: {node.type}")

        node_configs[node.id] = node

        def create_wrapped_function(fn, config, node_id):

            def wrapped(state):
                if event_callback:
                    event_callback(node_id, "running")
                try:
                    result = fn(state, config)
                finally:
                    if event_callback:
                        event_callback(node_id, "done")
                return result

            return wrapped

        graph.add_node(
            node.id,
            create_wrapped_function(node_fn, node.data, node.id)
        )

    targets = set()
    for edge in edges:
        targets.add(edge.target)

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