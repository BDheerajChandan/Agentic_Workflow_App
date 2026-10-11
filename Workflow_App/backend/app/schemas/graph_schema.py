# schemas\graph_schema.py

from pydantic import BaseModel
from typing import List, Dict, Any


class Node(BaseModel):
    id: str
    type: str
    data: Dict[str, Any]


class Edge(BaseModel):
    source: str
    target: str


class GraphRequest(BaseModel):
    nodes: List[Node]
    edges: List[Edge]
    input: Any