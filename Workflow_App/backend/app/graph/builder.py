# graph\builder.py
from langgraph.graph import StateGraph, END

from app.graph.state import GraphState
from app.nodes.registry import NODE_REGISTRY


def build_graph(nodes, edges):

    if not nodes:
        raise Exception("No nodes provided")

    graph = StateGraph(GraphState)

    # Store frontend node configs
    node_configs = {}

    # =========================
    # REGISTER NODES
    # =========================
    for node in nodes:

        node_fn = NODE_REGISTRY.get(node.type)

        if not node_fn:
            raise Exception(f"Unknown node type: {node.type}")

        node_configs[node.id] = node

        # wrapper to inject config
        def create_wrapped_function(fn, config):

            def wrapped(state):
                return fn(state, config)

            return wrapped

        graph.add_node(
            node.id,
            create_wrapped_function(node_fn, node.data)
        )

    # =========================
    # FIND ENTRY NODE
    # =========================

    targets = set()

    for edge in edges:
        targets.add(edge.target)

    entry_nodes = [
        node.id for node in nodes
        if node.id not in targets
    ]

    # fallback safety
    if not entry_nodes:

        # try finding explicit start node
        start_nodes = [
            node.id for node in nodes
            if node.type == "start"
        ]

        if start_nodes:
            entry = start_nodes[0]
        else:
            raise Exception(
                "No valid entry node found. "
                "Please connect graph properly."
            )

    else:
        entry = entry_nodes[0]

    graph.set_entry_point(entry)

    # =========================
    # ADD EDGES
    # =========================

    for edge in edges:
        graph.add_edge(edge.source, edge.target)

    # =========================
    # CONNECT OUTPUT -> END
    # =========================

    output_found = False

    for node in nodes:

        if node.type == "output":

            graph.add_edge(node.id, END)
            output_found = True

    # fallback
    if not output_found:
        last_node = nodes[-1]
        graph.add_edge(last_node.id, END)

    return graph.compile()