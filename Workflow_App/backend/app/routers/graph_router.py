"""
app/routers/graph_router.py
Graph execution endpoints: /run (existing, preserved) and /run-stream (SSE, for
live node execution highlighting + run history persistence).
"""

import asyncio
import json
import queue
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.graph.builder import build_graph
from app.schemas.graph_schema import GraphRequest
from app.variables import VariableError
from app import db

router = APIRouter()


class GraphRunRequest(GraphRequest):
    """Extends GraphRequest with optional flow_id for persistence."""
    flow_id: int | None = None


@router.post("/run")
async def run_graph(payload: GraphRunRequest):
    try:
        defs = await db.list_variables()
        graph = build_graph(
            payload.nodes, payload.edges,
            variable_defs=defs, flow_id=payload.flow_id,
        )

        result = graph.invoke({
            "input": payload.input,
            "data": {},
        })
    except VariableError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

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


def _run_variables(final_result: dict | None, traces: list[dict]) -> dict:
    if final_result and isinstance(final_result.get("variables"), dict):
        return final_result["variables"]
    for t in reversed(traces):
        out = t.get("output")
        if isinstance(out, dict) and isinstance(out.get("variables"), dict):
            return out["variables"]
    return {}


@router.post("/run-stream")
async def run_graph_stream(payload: GraphRunRequest):
    events: "queue.Queue[dict]" = queue.Queue()
    loop = asyncio.get_event_loop()
    defs = await db.list_variables()
    started_at = datetime.now(timezone.utc)

    def event_callback(node_id: str, status: str, detail=None):
        events.put({"type": "node", "node_id": node_id, "status": status, "detail": detail})

    def worker():
        try:
            graph = build_graph(
                payload.nodes, payload.edges,
                event_callback=event_callback,
                variable_defs=defs, flow_id=payload.flow_id,
            )
            result = graph.invoke({"input": payload.input, "data": {}})
            events.put({"type": "result", "result": _serialise(result)})
        except Exception as exc:
            events.put({"type": "error", "message": str(exc)})
        finally:
            events.put({"type": "__end__"})

    threading.Thread(target=worker, daemon=True).start()

    async def event_generator():
        final_result: dict | None = None
        error_msg: str | None = None
        traces: list[dict] = []

        while True:
            evt = await loop.run_in_executor(None, events.get)
            if evt["type"] == "__end__":
                break
            if evt["type"] == "result":
                final_result = evt["result"]
            elif evt["type"] == "error":
                error_msg = evt["message"]
            elif evt["type"] == "node" and evt.get("status") == "trace" and evt.get("detail"):
                traces.append(evt["detail"])
            yield f"data: {json.dumps(evt)}\n\n"

        ended_at = datetime.now(timezone.utc)

        if payload.flow_id is not None:
            if final_result is not None:
                try:
                    await db.record_execution(
                        flow_id=payload.flow_id,
                        input_value=str(payload.input),
                        result=final_result,
                    )
                except Exception as exc:
                    print(f"⚠️  Failed to persist execution: {exc}")

            try:
                failed = error_msg is not None or final_result is None
                await db.record_run(
                    flow_id=payload.flow_id,
                    status="failed" if failed else "passed",
                    started_at=started_at,
                    ended_at=ended_at,
                    input_value=str(payload.input),
                    result=final_result,
                    node_states=traces,
                    variables=_run_variables(final_result, traces),
                    error=error_msg,
                )
            except Exception as exc:
                print(f"⚠️  Failed to persist run history: {exc}")

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