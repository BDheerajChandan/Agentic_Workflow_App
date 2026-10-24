# app/resume.py
# Durable resume of paused runs (Time Operation, HITL). Single engine, no extra service.

import asyncio
from datetime import datetime, timezone

from app import db
from app.graph.builder import build_graph
from app.graph.state import GraphState
from app.output_display import resolve_output_display
from app.pause import PauseRequested, revive, to_jsonable
from app.schemas.graph_schema import Edge, Node

POLL_SECONDS = 5
_TASKS: set = set()


def spawn(coro):
    task = asyncio.create_task(coro)
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return task


def _iso(value):
    return value.isoformat() if value else None


async def store_pause(exc: PauseRequested, flow_id: int, nodes: list, edges: list, input_value: str) -> int:
    return await db.create_pause(
        flow_id=flow_id,
        node_id=exc.node_id,
        operation=exc.operation,
        state=to_jsonable(exc.state or {}),
        variables=to_jsonable(exc.variables or {}),
        nodes=to_jsonable(nodes),
        edges=to_jsonable(edges),
        input_value=input_value,
        resume_at=exc.resume_at,
        hold_expires_at=exc.hold_expires_at,
        on_timeout=exc.on_timeout,
        info=to_jsonable(exc.info or {}),
    )


def paused_result(exc: PauseRequested, pause_id: int) -> dict:
    hitl = (exc.info or {}).get("hitl")
    if hitl:
        message = f"Workflow paused at '{exc.node_id}' waiting for human input."
    else:
        waiting = (
            f"until {_iso(exc.resume_at)}" if exc.resume_at else "until it is resumed"
        )
        message = f"Workflow paused at '{exc.node_id}' {waiting}. Downstream nodes run after resume."
    out = {
        "paused": True,
        "pause_id": pause_id,
        "node_id": exc.node_id,
        "operation": exc.operation,
        "resume_at": _iso(exc.resume_at),
        "hold_expires_at": _iso(exc.hold_expires_at),
        "message": message,
    }
    if hitl:
        out["hitl"] = {**hitl, "pause_id": pause_id}
    return out


def _reachable(nodes, edges, start):
    adj: dict = {}
    for e in edges:
        adj.setdefault(e.source, []).append(e.target)
    seen, stack = set(), [start]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(adj.get(cur, []))
    return [n for n in nodes if n.id in seen]


async def resume_pause(pause_id: int, reason: str = "resumed", extra: dict | None = None):
    """
    Returns None when the pause was already claimed, otherwise
    {"result", "error", "paused", "display"} for the resumed segment.
    """
    row = await db.claim_pause(pause_id)
    if not row:
        return None

    flow_id = row["flow_id"]
    started = datetime.now(timezone.utc)
    defs = await db.list_variables()
    traces: list = []
    ctx: dict = {}

    def cb(node_id, status, detail=None):
        if status == "trace" and detail:
            traces.append(detail)

    def work():
        all_nodes = [Node.model_validate(n) for n in row["nodes"]]
        all_edges = [Edge.model_validate(e) for e in row["edges"]]
        keep = _reachable(all_nodes, all_edges, row["node_id"])
        ctx["nodes"] = keep
        ids = {n.id for n in keep}
        keep_edges = [e for e in all_edges if e.source in ids and e.target in ids]

        graph = build_graph(
            keep, keep_edges,
            event_callback=cb,
            variable_defs=defs,
            flow_id=flow_id,
            entry_node_id=row["node_id"],
            initial_variables=row["variables"],
            node_overrides={
                row["node_id"]: {
                    "__resume": reason,
                    "__paused_at": _iso(row["created_at"]),
                    "__scheduled_for": (row["info"] or {}).get("scheduled_for"),
                    **(extra or {}),
                }
            },
        )
        schema_keys = set(GraphState.__annotations__.keys())
        state = {k: revive(v) for k, v in (row["state"] or {}).items() if k in schema_keys}
        return graph.invoke(state)

    result, error, paused = None, None, False
    try:
        result = to_jsonable(await asyncio.to_thread(work))
    except PauseRequested as exc:
        try:
            new_id = await store_pause(exc, flow_id, row["nodes"], row["edges"], row["input"] or "")
            result = paused_result(exc, new_id)
            paused = True
        except Exception as inner:  # noqa: BLE001
            error = str(inner)
    except Exception as exc:  # noqa: BLE001
        error = str(exc)

    await db.finish_pause(pause_id, "failed" if error else "done", error)

    try:
        status = "failed" if error else ("paused" if paused else "passed")
        if status == "passed" and result is not None:
            await db.record_execution(flow_id, row["input"] or "", result)
        variables = result.get("variables") if isinstance(result, dict) else None
        await db.record_run(
            flow_id=flow_id,
            status=status,
            started_at=started,
            ended_at=datetime.now(timezone.utc),
            input_value=row["input"] or "",
            result=result,
            node_states=traces,
            variables=variables if isinstance(variables, dict) else {},
            error=error,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️  Failed to persist resumed run: {exc}")

    display = None
    if not error and not paused and result is not None:
        try:
            display = to_jsonable(
                resolve_output_display(ctx.get("nodes", []), result, traces, defs)
            )
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️  Failed to resolve output display: {exc}")

    return {"result": result, "error": error, "paused": paused, "display": display}


async def expire_pause(pause_id: int) -> None:
    row = await db.claim_pause(pause_id)
    if not row:
        return
    message = "Time Operation: hold timed out without being resumed."
    await db.finish_pause(pause_id, "failed", message)
    try:
        await db.record_run(
            flow_id=row["flow_id"],
            status="failed",
            started_at=row["created_at"],
            ended_at=datetime.now(timezone.utc),
            input_value=row["input"] or "",
            result=None,
            node_states=[],
            variables={},
            error=message,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️  Failed to persist expired hold: {exc}")


async def scheduler_loop() -> None:
    while True:
        try:
            for pid in await db.due_pause_ids():
                spawn(resume_pause(pid, "scheduled"))
            for row in await db.expired_hold_rows():
                if row["on_timeout"] == "continue":
                    spawn(resume_pause(row["pause_id"], "timeout_continue"))
                else:
                    spawn(expire_pause(row["pause_id"]))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️  Pause scheduler error: {exc}")
        await asyncio.sleep(POLL_SECONDS)