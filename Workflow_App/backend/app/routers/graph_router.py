"""
app/routers/graph_router.py
Graph execution endpoints: /run (existing, preserved) and /run-stream (SSE, for
live node execution highlighting).
"""

import asyncio
import json
import queue
import threading
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.graph.builder import build_graph
from app.schemas.graph_schema import GraphRequest
from app import db

router = APIRouter()


class GraphRunRequest(GraphRequest):
    """Extends GraphRequest with optional flow_id for persistence."""
    flow_id: int | None = None


@router.post("/run")
async def run_graph(payload: GraphRunRequest):
    graph = build_graph(payload.nodes, payload.edges)

    result = graph.invoke({
        "input": payload.input,
        "data": {},
    })

    print("result :", result)

    if payload.flow_id is not None:
        try:
            await db.record_execution(
                flow_id=payload.flow_id,
                input_value=str(payload.input),
                result=_serialise(result),
            )
        except Exception as exc:
            print(f"⚠️  Failed to persist execution: {exc}")

    return {"result": result}


@router.post("/run-stream")
async def run_graph_stream(payload: GraphRunRequest):
    events: "queue.Queue[dict]" = queue.Queue()
    loop = asyncio.get_event_loop()

    def event_callback(node_id: str, status: str):
        events.put({"type": "node", "node_id": node_id, "status": status})

    def worker():
        try:
            graph = build_graph(payload.nodes, payload.edges, event_callback=event_callback)
            result = graph.invoke({"input": payload.input, "data": {}})
            events.put({"type": "result", "result": _serialise(result)})
        except Exception as exc:
            events.put({"type": "error", "message": str(exc)})
        finally:
            events.put({"type": "__end__"})

    threading.Thread(target=worker, daemon=True).start()

    async def event_generator():
        final_result: dict | None = None
        while True:
            evt = await loop.run_in_executor(None, events.get)
            if evt["type"] == "__end__":
                break
            if evt["type"] == "result":
                final_result = evt["result"]
            yield f"data: {json.dumps(evt)}\n\n"

        if payload.flow_id is not None and final_result is not None:
            try:
                await db.record_execution(
                    flow_id=payload.flow_id,
                    input_value=str(payload.input),
                    result=final_result,
                )
            except Exception as exc:
                print(f"⚠️  Failed to persist execution: {exc}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _serialise(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _serialise(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialise(i) for i in obj]
    if hasattr(obj, "page_content"):
        return {"page_content": obj.page_content, "metadata": obj.metadata}
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)