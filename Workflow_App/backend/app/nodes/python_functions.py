# app/nodes/python_functions.py

import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

RUNNER = str(Path(__file__).resolve().parent / "python_runner.py")
MARK = "__PYFN_RESULT__"

DEFAULT_TIMEOUT = 10
MAX_TIMEOUT = 60
DEFAULT_MEMORY_MB = 256
MIN_MEMORY_MB = 64
MAX_MEMORY_MB = 1024
MAX_OUTPUT_BYTES = 5 * 1024 * 1024

INPUT_SOURCES = ("current_value", "full", "node_results", "variables", "combined")


def _jsonable(obj):
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_jsonable(i) for i in obj]
    if hasattr(obj, "page_content"):
        return {"page_content": obj.page_content, "metadata": _jsonable(obj.metadata)}
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def _bounded(value, label, default, low, high):
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Python Functions: {label} must be a number.")
    if isinstance(value, bool) or math.isnan(num) or not (low <= num <= high):
        raise ValueError(f"Python Functions: {label} must be between {low} and {high}.")
    return num


def _resolve_inputs(state, cfg):
    if "python_inputs" in state:  # Input Value Mapping wins
        return state["python_inputs"]
    source = str(cfg.get("input_source") or "current_value").strip().lower()
    if source not in INPUT_SOURCES:
        raise ValueError(f"Python Functions: unsupported input source '{source}'.")
    if source == "current_value":
        return state.get("current_value")
    if source == "node_results":
        return state.get("data") or {}
    if source == "variables":
        return state.get("variables") or {}
    if source == "combined":
        return {
            "current_value": state.get("current_value"),
            "data": state.get("data") or {},
            "variables": state.get("variables") or {},
        }
    return {
        k: state.get(k)
        for k in ("input", "current_value", "data", "variables", "final_output")
        if k in state
    }


def _run_sandbox(code, inputs, context, timeout, memory_mb):
    payload = json.dumps(
        {"code": code, "inputs": _jsonable(inputs), "context": _jsonable(context), "memory_mb": int(memory_mb)}
    ).encode("utf-8")

    env = {"PYTHONIOENCODING": "utf-8"}
    if os.environ.get("SYSTEMROOT"):
        env["SYSTEMROOT"] = os.environ["SYSTEMROOT"]

    try:
        with tempfile.TemporaryDirectory(prefix="pyfn_") as tmp:
            proc = subprocess.run(
                [sys.executable, "-I", "-B", RUNNER],
                input=payload,
                capture_output=True,
                timeout=timeout,
                env=env,
                cwd=tmp,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": {"type": "TimeoutError", "message": f"Execution exceeded {timeout:g}s and was terminated.", "line": None, "trace": []}, "stdout": ""}

    if len(proc.stdout) > MAX_OUTPUT_BYTES:
        return {"ok": False, "error": {"type": "OutputTooLarge", "message": "Output exceeded the allowed size.", "line": None, "trace": []}, "stdout": ""}

    text = proc.stdout.decode("utf-8", errors="replace")
    idx = text.rfind(MARK)
    if idx == -1:
        if proc.returncode == 137:
            msg = f"Memory limit of {int(memory_mb)} MB exceeded."
            kind = "MemoryError"
        else:
            msg = f"Sandbox terminated without a result (exit code {proc.returncode})."
            kind = "SandboxError"
        return {"ok": False, "error": {"type": kind, "message": msg, "line": None, "trace": []}, "stdout": ""}

    try:
        return json.loads(text[idx + len(MARK):].strip())
    except ValueError:
        return {"ok": False, "error": {"type": "SandboxError", "message": "Malformed sandbox result.", "line": None, "trace": []}, "stdout": ""}


def python_functions_node(state, config):
    cfg = config or {}
    node_id = cfg.get("__node_id")

    source_mode = str(cfg.get("source_mode") or "static").strip().lower()
    if source_mode == "dynamic":
        code = str(cfg.get("file_code") or "")
        if not code.strip():
            raise ValueError("Python Functions: no .py file uploaded (Dynamic mode).")
    else:
        code = str(cfg.get("code") or "")
        if not code.strip():
            raise ValueError("Python Functions: code is required (define a 'main' function).")

    timeout = _bounded(cfg.get("timeout"), "Timeout", DEFAULT_TIMEOUT, 1, MAX_TIMEOUT)
    memory_mb = _bounded(cfg.get("memory_mb"), "Memory limit (MB)", DEFAULT_MEMORY_MB, MIN_MEMORY_MB, MAX_MEMORY_MB)

    inputs = _resolve_inputs(state, cfg)
    context = {"node_id": node_id, "flow_id": cfg.get("__flow_id")}

    outcome = _run_sandbox(code, inputs, context, timeout, memory_mb)
    stdout = outcome.get("stdout", "")

    if not outcome.get("ok"):
        err = outcome.get("error") or {}
        where = f" at line {err['line']}" if err.get("line") else ""
        msg = f"Python Functions [{node_id}] {err.get('type', 'Error')}{where}: {err.get('message', '')}"
        if err.get("trace"):
            msg += " | trace: " + " > ".join(err["trace"])
        if stdout.strip():
            msg += f" | stdout: {stdout.strip()[-500:]}"
        raise ValueError(msg)

    result = outcome.get("result")
    return {
        "current_value": result,
        "data": {
            **state.get("data", {}),
            "python_result": result,
            "python_stdout": stdout,
        },
    }