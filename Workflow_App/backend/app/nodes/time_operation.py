# app/nodes/time_operation.py

import math
import os
import threading
from datetime import datetime, timedelta, timezone

from app.pause import PauseRequested

INLINE_WAIT_MAX = float(os.getenv("TIME_OP_INLINE_MAX_SECONDS", "30"))
HARD_MAX_WAIT = int(os.getenv("TIME_OP_MAX_WAIT_SECONDS", str(30 * 86400)))
DEFAULT_MAX_WAIT = 86400
UNITS = {"seconds": 1, "minutes": 60, "hours": 3600}

_LOCK = threading.Lock()
_WAITS: dict = {}


class _Wait:
    def __init__(self):
        self.event = threading.Event()
        self.action = None


def signal_waits(flow_id, node_id, action) -> int:
    """Resume (ends the wait early) or cancel every active inline wait of a node."""
    with _LOCK:
        waits = list(_WAITS.get((flow_id, node_id), []))
    for w in waits:
        w.action = action
        w.event.set()
    return len(waits)


def _wait(key, seconds):
    w = _Wait()
    with _LOCK:
        _WAITS.setdefault(key, []).append(w)
    try:
        w.event.wait(timeout=seconds)
    finally:
        with _LOCK:
            lst = _WAITS.get(key, [])
            if w in lst:
                lst.remove(w)
            if not lst:
                _WAITS.pop(key, None)
    return w.action


def _non_negative(value, label):
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ValueError(f"Time Operation: {label} is required.")
    if isinstance(value, bool):
        raise ValueError(f"Time Operation: {label} must be a number.")
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Time Operation: {label} must be a number.")
    if math.isnan(num) or math.isinf(num) or num < 0:
        raise ValueError(f"Time Operation: {label} must be zero or greater.")
    return num


def _max_wait(cfg):
    raw = cfg.get("max_wait_seconds")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return min(DEFAULT_MAX_WAIT, HARD_MAX_WAIT)
    num = _non_negative(raw, "Maximum wait")
    if num <= 0:
        raise ValueError("Time Operation: maximum wait must be greater than 0.")
    return min(num, HARD_MAX_WAIT)


def _target(cfg):
    d = str(cfg.get("scheduled_date") or "").strip()
    t = str(cfg.get("scheduled_clock") or "").strip()
    if d or t:
        if not (d and t):
            raise ValueError("Time Operation: both scheduled date and time are required.")
        raw = f"{d}T{t}"
    else:
        raw = str(cfg.get("scheduled_time") or "").strip()  # legacy field
    if not raw:
        raise ValueError("Time Operation: scheduled date and time are required.")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        raise ValueError("Time Operation: scheduled date/time is invalid.")
    if dt.tzinfo is None:
        tz_name = str(cfg.get("timezone") or "").strip()
        if tz_name:
            try:
                from zoneinfo import ZoneInfo
                dt = dt.replace(tzinfo=ZoneInfo(tz_name))
            except Exception:
                raise ValueError(
                    f"Time Operation: unknown timezone '{tz_name}' (on Windows also run: pip install tzdata)."
                )
        else:
            dt = dt.astimezone()  # naive -> server local timezone
    return dt.astimezone(timezone.utc)


def _parse_iso(value):
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def _result(state, info):
    return {
        "current_value": state.get("current_value"),
        "data": {**state.get("data", {}), "time_operation": info},
    }


def time_operation_node(state, config):
    cfg = config or {}
    op = str(cfg.get("operation") or "duration").strip().lower()
    if op not in ("duration", "until", "hold"):
        raise ValueError("Time Operation: operation must be 'duration', 'until' or 'hold'.")

    # ── Resumed run: the wait/hold already happened, continue exactly once ───
    resume = cfg.get("__resume")
    if resume:
        completed = datetime.now(timezone.utc)
        started = _parse_iso(cfg.get("__paused_at")) or completed
        status = {
            "resumed": "resumed",
            "scheduled": "completed",
            "timeout_continue": "timed_out_continued",
        }.get(resume, "resumed")
        return _result(state, {
            "operation": op,
            "status": status,
            "started_at": started.isoformat(),
            "scheduled_for": cfg.get("__scheduled_for"),
            "completed_at": completed.isoformat(),
            "elapsed_seconds": round((completed - started).total_seconds(), 3),
        })

    max_wait = _max_wait(cfg)
    flow_id = cfg.get("__flow_id")
    node_id = cfg.get("__node_id")
    started = datetime.now(timezone.utc)
    scheduled_for = None
    past_skipped = False
    hold_expires = None
    on_timeout = str(cfg.get("hold_on_timeout") or "fail").strip().lower()
    seconds = 0.0

    if op == "duration":
        unit = str(cfg.get("unit") or "seconds").strip().lower()
        if unit not in UNITS:
            raise ValueError("Time Operation: unit must be seconds, minutes or hours.")
        seconds = _non_negative(cfg.get("duration"), "Duration") * UNITS[unit]
    elif op == "until":
        target = _target(cfg)
        scheduled_for = target
        seconds = (target - started).total_seconds()
        if seconds <= 0:
            if str(cfg.get("past_behavior") or "error").strip().lower() == "continue":
                seconds = 0
                past_skipped = True
            else:
                raise ValueError("Time Operation: scheduled time is in the past.")
    else:
        raw = cfg.get("hold_timeout_seconds")
        if raw not in (None, ""):
            hold_for = _non_negative(raw, "Hold timeout")
            if hold_for > 0:
                if hold_for > max_wait:
                    raise ValueError(
                        f"Time Operation: hold timeout exceeds the maximum allowed wait of {int(max_wait)}s."
                    )
                hold_expires = started + timedelta(seconds=hold_for)

    if op != "hold" and seconds > max_wait:
        raise ValueError(
            f"Time Operation: wait of {int(seconds)}s exceeds the maximum allowed wait of {int(max_wait)}s."
        )

    # ── Durable path: persisted checkpoint, resumed by the scheduler / API ───
    if op == "hold" or seconds > INLINE_WAIT_MAX:
        if flow_id is None:
            raise ValueError("Time Operation: save the workflow first — long waits and Hold/Pause need a saved workflow.")
        raise PauseRequested(
            node_id=node_id,
            operation=op,
            resume_at=None if op == "hold" else started + timedelta(seconds=seconds),
            hold_expires_at=hold_expires,
            on_timeout=on_timeout if on_timeout in ("fail", "continue") else "fail",
            info={
                "started_at": started.isoformat(),
                "scheduled_for": scheduled_for.isoformat() if scheduled_for else None,
            },
        )

    # ── Short inline wait ────────────────────────────────────────────────────
    action = _wait((flow_id, node_id), seconds) if seconds > 0 else None
    if action == "cancel":
        raise ValueError("Time Operation: wait was cancelled.")

    if past_skipped:
        status = "skipped_past"
    else:
        status = "skipped" if action == "resume" else "completed"

    completed = datetime.now(timezone.utc)
    return _result(state, {
        "operation": op,
        "status": status,
        "started_at": started.isoformat(),
        "scheduled_for": scheduled_for.isoformat() if scheduled_for else None,
        "completed_at": completed.isoformat(),
        "elapsed_seconds": round((completed - started).total_seconds(), 3),
    })