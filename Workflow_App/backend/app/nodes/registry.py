# nodes\registry.py

from app.nodes.start import start_node
from app.nodes.type_converter import type_converter_node
from app.nodes.output import output_node

# NEW RAG NODES
from app.nodes.rag_retrieve import rag_retrieve_node
from app.nodes.rag_generate import rag_generate_node

NODE_REGISTRY = {
    "start": start_node,
    "type_converter": type_converter_node,
    "output": output_node,

    # RAG
    "rag_retrieve": rag_retrieve_node,
    "rag_generate": rag_generate_node,
}