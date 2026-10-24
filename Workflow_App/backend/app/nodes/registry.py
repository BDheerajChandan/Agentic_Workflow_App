# nodes\registry.py

from app.nodes.start import start_node
from app.nodes.type_converter import type_converter_node
from app.nodes.output import output_node

# NEW RAG NODES
from app.nodes.rag_retrieve import rag_retrieve_node
from app.nodes.rag_generate import rag_generate_node

# NEW UTILITY / GEO NODES
from app.nodes.base64_node import base64_node
from app.nodes.geo_temperature import geo_temperature_node
from app.nodes.geo_location import geo_location_node
from app.nodes.python_functions import python_functions_node
from app.nodes.time_operation import time_operation_node
from app.nodes.HILT_Node import hitl_node

NODE_REGISTRY = {
    "start": start_node,
    "type_converter": type_converter_node,
    "output": output_node,

    # RAG
    "rag_retrieve": rag_retrieve_node,
    "rag_generate": rag_generate_node,

    # Utility / Geo
    "base64": base64_node,
    "geo_temperature": geo_temperature_node,
    "geo_location": geo_location_node,
    "python_functions": python_functions_node,
    "time_operation": time_operation_node,
    "hitl": hitl_node,
}