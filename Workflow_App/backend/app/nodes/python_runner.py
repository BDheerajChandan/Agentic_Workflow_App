# app/nodes/python_runner.py
# Executed ONLY as an isolated child process by python_functions.py. Never import this module.

import inspect
import io
import json
import os
import sys
import threading
import time
import traceback

MARK = "__PYFN_RESULT__"
SRC_NAME = "<python_functions>"

_guard_ident = None

_PRELOAD = (
    "json", "math", "re", "datetime", "collections", "itertools", "functools",
    "statistics", "base64", "decimal", "fractions", "string", "textwrap",
    "random", "hashlib", "copy", "operator", "typing", "time", "html",
    "urllib.parse", "zoneinfo", "calendar", "enum", "dataclasses", "heapq", "bisect",
)

BLOCKED_IMPORTS = {
    "subprocess", "socket", "_socket", "ctypes", "_ctypes", "multiprocessing",
    "shutil", "winreg", "_winapi", "msvcrt", "tempfile", "ftplib", "smtplib",
    "http", "urllib3", "requests", "webbrowser", "pty", "sqlite3", "asyncio",
}

BLOCKED_PREFIXES = (
    "socket.", "subprocess.", "ctypes.", "winreg.", "shutil.", "urllib.Request",
    "http.client.", "ftplib.", "smtplib.", "webbrowser.", "pty.",
    "os.exec", "os.spawn", "os.posix_spawn", "os.system", "os.fork",
    "os.startfile", "os.remove", "os.rename", "os.replace", "os.rmdir",
    "os.mkdir", "os.chmod", "os.chown", "os.truncate", "os.symlink", "os.link",
    "os.listdir", "os.scandir", "os.putenv", "os.unsetenv", "os.kill",
    "os.utime", "os.add_dll_directory", "glob.glob", "msvcrt.",
)

_WRITE_FLAGS = (
    getattr(os, "O_WRONLY", 0) | getattr(os, "O_RDWR", 0) | getattr(os, "O_CREAT", 0)
    | getattr(os, "O_TRUNC", 0) | getattr(os, "O_APPEND", 0)
)


class _MissingMain(Exception):
    pass


class _Unserializable(Exception):
    pass


def _roots():
    seen = []
    for p in (sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix):
        n = os.path.normcase(os.path.realpath(p))
        if n not in seen:
            seen.append(n)
    return tuple(seen)


_ALLOWED_ROOTS = _roots()


def _check_open(args):
    path, mode, flags = (list(args) + [None, None, None])[:3]
    if isinstance(path, int):
        return
    m = mode or ""
    if any(c in str(m) for c in "wax+"):
        raise PermissionError("File writes are not permitted in the Python Functions sandbox.")
    if isinstance(flags, int) and flags & _WRITE_FLAGS:
        raise PermissionError("File writes are not permitted in the Python Functions sandbox.")
    try:
        real = os.path.normcase(os.path.realpath(os.fsdecode(path)))
    except Exception:
        raise PermissionError("File access is not permitted in the Python Functions sandbox.")
    if not any(real == r or real.startswith(r + os.sep) for r in _ALLOWED_ROOTS):
        raise PermissionError("File access outside the Python runtime is not permitted.")


def _hook(event, args):
    if threading.get_ident() == _guard_ident:
        return
    if event == "open":
        _check_open(args)
        return
    if event == "import":
        if str(args[0]).split(".")[0] in BLOCKED_IMPORTS:
            raise PermissionError(f"Import of '{args[0]}' is not permitted in the Python Functions sandbox.")
        return
    if event.startswith(BLOCKED_PREFIXES):
        raise PermissionError(f"Operation not permitted in the Python Functions sandbox: {event}")


def _start_memory_guard(limit_mb):
    global _guard_ident
    limit = limit_mb * 1024 * 1024

    if os.name != "nt":
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        return

    import ctypes
    from ctypes import wintypes

    class PMC(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    gpmi = k32.K32GetProcessMemoryInfo
    gpmi.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
    gpmi.restype = wintypes.BOOL
    handle = k32.GetCurrentProcess()

    def guard():
        while True:
            c = PMC()
            c.cb = ctypes.sizeof(PMC)
            if gpmi(handle, ctypes.byref(c), c.cb) and c.PagefileUsage > limit:
                os._exit(137)
            time.sleep(0.05)

    t = threading.Thread(target=guard, daemon=True)
    t.start()
    _guard_ident = t.ident


def _invoke(fn, inputs, context):
    P = inspect.Parameter
    params = list(inspect.signature(fn).parameters.values())
    pos = [p for p in params if p.kind in (P.POSITIONAL_ONLY, P.POSITIONAL_OR_KEYWORD)]
    var_pos = any(p.kind == P.VAR_POSITIONAL for p in params)
    var_kw = any(p.kind == P.VAR_KEYWORD for p in params)

    if var_kw and not pos and not var_pos:
        kwargs = inputs if isinstance(inputs, dict) else {"input": inputs}
        return fn(**{str(k): v for k, v in kwargs.items()})
    if var_pos and not pos and not var_kw:
        args = list(inputs) if isinstance(inputs, (list, tuple)) else [inputs]
        return fn(*args)
    if len(pos) == 0:
        return fn()
    if len(pos) == 1:
        return fn(inputs)
    return fn(inputs, context)


def _describe(exc):
    if isinstance(exc, _MissingMain):
        kind = "MissingEntryPoint"
    elif isinstance(exc, _Unserializable):
        kind = "SerializationError"
    else:
        kind = type(exc).__name__
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == SRC_NAME]
    line = frames[-1].lineno if frames else getattr(exc, "lineno", None)
    return {
        "type": kind,
        "message": str(exc)[:1000],
        "line": line,
        "trace": [f"line {f.lineno} in {f.name}" for f in frames][-8:],
    }


def main():
    real_out = sys.stdout
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))

    for name in _PRELOAD:
        try:
            __import__(name)
        except Exception:
            pass

    _start_memory_guard(int(payload.get("memory_mb") or 256))
    for name in BLOCKED_IMPORTS:
        sys.modules.pop(name, None)

    buf = io.StringIO()
    sys.stdout = sys.stderr = buf
    sys.stdin = io.StringIO("")

    try:
        sys.addaudithook(_hook)
        code = compile(payload["code"], SRC_NAME, "exec")
        ns = {"__name__": "__sandbox__"}
        exec(code, ns)
        fn = ns.get("main")
        if not callable(fn):
            raise _MissingMain("No callable 'main' function defined.")
        value = _invoke(fn, payload.get("inputs"), payload.get("context") or {})
        try:
            json.dumps(value)
        except (TypeError, ValueError) as exc:
            raise _Unserializable(f"Return value is not JSON-serializable: {exc}")
        result = {"ok": True, "result": value}
    except BaseException as exc:  # noqa: BLE001 - every failure is reported, never swallowed
        result = {"ok": False, "error": _describe(exc)}

    result["stdout"] = buf.getvalue()[-10000:]
    real_out.write("\n" + MARK + json.dumps(result) + "\n")
    real_out.flush()


if __name__ == "__main__":
    main()