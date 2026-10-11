# routers\graph_router.py

from fastapi import APIRouter
from app.graph.builder import build_graph
from app.schemas.graph_schema import GraphRequest

router = APIRouter()


@router.post("/run")
def run_graph(payload: GraphRequest):

    graph = build_graph(payload.nodes, payload.edges)

    result = graph.invoke({
        "input": payload.input,
        "data": {}
    })
    
    print("result : ",result)
    return {
        "result": result
    }