# app/utils/validators.py

import re

from app.config.settings import settings
from app.utils.errors import Conflict, ValidationFailed
from app.utils.paths import is_within, resolve_local_path

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}$")
CONTAINER_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,62}$")
IMAGE_RE = re.compile(r"^[a-z0-9][a-z0-9._\-/]*(:[A-Za-z0-9._-]{1,128})?(@sha256:[a-f0-9]{64})?$")
HOST_RE = re.compile(r"^[A-Za-z0-9.-]{1,253}$")
ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SECRET_KEY_RE = re.compile(r"(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE|CREDENTIAL)", re.I)
REF_RE = re.compile(r"^\$\{[A-Za-z_][A-Za-z0-9_]*\}$")

SERVICE_TYPES = ("backend", "frontend", "worker", "database", "other")
RUNTIMES = ("python", "node", "image", "dockerfile")
PROTOCOLS = ("http", "https")

RUNTIME_BY_TYPE = {"backend": "python", "frontend": "node", "worker": "python", "database": "image", "other": "image"}
IMAGE_BY_RUNTIME = {"python": "python:3.11", "node": "node:20-alpine"}
START_PERIOD = {"python": 900, "node": 300, "image": 120, "dockerfile": 300}

KEY_MAP = {
    "id": "service_id", "name": "service_name", "type": "service_type", "path": "project_path",
    "port": "host_port", "health_check": "health_check_path", "runtime": "runtime_type",
}


def normalize_service_keys(data: dict) -> dict:
    return {KEY_MAP.get(k, k): v for k, v in (data or {}).items()}


def restart_policy_for(auto_start: bool, auto_restart: bool) -> str:
    if auto_restart and auto_start:
        return "unless-stopped"
    if auto_restart:
        return "on-failure:5"
    return "no"


def slugify_id(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")[:60]


def _bool(value, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, (bool, int, float)):
        return bool(value)
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _int(value, label: str, lo: int, hi: int, errors: list):
    try:
        if isinstance(value, bool):
            raise ValueError
        n = int(str(value).strip())
    except (TypeError, ValueError):
        errors.append(f"{label} must be a whole number.")
        return None
    if not lo <= n <= hi:
        errors.append(f"{label} must be between {lo} and {hi}.")
        return None
    return n


def _text(value) -> str:
    return "" if value is None else str(value).strip()


def _env(value, errors: list) -> dict:
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        errors.append("Environment must be an object of KEY: value pairs.")
        return {}
    out = {}
    for k, v in value.items():
        key, val = str(k).strip(), "" if v is None else str(v)
        if not ENV_KEY_RE.match(key):
            errors.append(f"Environment variable name '{key}' is invalid.")
        elif len(val) > 2000 or "\x00" in val:
            errors.append(f"Environment variable '{key}' has an invalid value.")
        elif SECRET_KEY_RE.search(key) and val and not REF_RE.match(val):
            errors.append(
                f"'{key}' looks like a secret. Use a reference such as ${{{key}}} "
                "(resolved from the DJ Services environment) instead of a literal value."
            )
        else:
            out[key] = val
    return out


def find_cycle(graph: dict) -> list | None:
    state: dict = {}

    def visit(node, trail):
        state[node] = 1
        for dep in graph.get(node, []):
            if state.get(dep) == 1:
                return trail + [node, dep]
            if state.get(dep) is None and dep in graph:
                found = visit(dep, trail + [node])
                if found:
                    return found
        state[node] = 2
        return None

    for n in list(graph):
        if state.get(n) is None:
            found = visit(n, [])
            if found:
                return found
    return None


def validate_project(data: dict, *, source: str = "api") -> dict:
    errors = []
    pid = _text(data.get("project_id"))
    if not ID_RE.match(pid):
        errors.append("Project ID must be 2-63 chars: lowercase letters, digits, '_' or '-'.")
    name = _text(data.get("project_name"))
    if not name or len(name) > 100:
        errors.append("Project name is required (max 100 characters).")
    path = _text(data.get("project_path"))
    if path:
        try:
            if not resolve_local_path(path).is_dir():
                errors.append(f"Project path does not exist or is not a folder: {path}")
        except ValueError as exc:
            errors.append(f"Project path: {exc}")
    desc = _text(data.get("description"))
    if len(desc) > 500:
        errors.append("Description is limited to 500 characters.")
    if errors:
        raise ValidationFailed("Project configuration is invalid.", details=errors)
    return {
        "project_id": pid, "project_name": name, "project_path": path,
        "description": desc, "enabled": _bool(data.get("enabled"), True),
    }


def validate_service(data: dict, *, source: str = "api") -> dict:
    d = normalize_service_keys(data)
    errors: list = []

    sid = _text(d.get("service_id"))
    if not ID_RE.match(sid):
        errors.append("Service ID must be 2-63 chars: lowercase letters, digits, '_' or '-'.")
    pid = _text(d.get("project_id"))
    if not ID_RE.match(pid):
        errors.append("Project ID is invalid.")
    name = _text(d.get("service_name"))
    if not name or len(name) > 100:
        errors.append("Service name is required (max 100 characters).")

    stype = _text(d.get("service_type") or "other").lower()
    if stype not in SERVICE_TYPES:
        errors.append(f"Service type must be one of: {', '.join(SERVICE_TYPES)}.")
        stype = "other"
    runtime = _text(d.get("runtime_type") or RUNTIME_BY_TYPE[stype]).lower()
    if runtime not in RUNTIMES:
        errors.append(f"Runtime must be one of: {', '.join(RUNTIMES)}.")
        runtime = RUNTIME_BY_TYPE[stype]

    path_raw = _text(d.get("project_path"))
    local = None
    try:
        local = resolve_local_path(path_raw)
        if not local.is_dir():
            errors.append(f"Project path does not exist or is not a folder: {path_raw}")
            local = None
    except ValueError as exc:
        errors.append(f"Project path: {exc}")

    start_cmd = _text(d.get("start_command")) or None
    install_cmd = _text(d.get("install_command")) or None
    for label, cmd in (("Start command", start_cmd), ("Install command", install_cmd)):
        if cmd and (len(cmd) > 2000 or "\x00" in cmd):
            errors.append(f"{label} is invalid.")
    if (start_cmd or install_cmd) and source == "api" and not settings.ALLOW_CUSTOM_COMMANDS:
        errors.append(
            "Custom start/install commands can only be defined in App_cofig.json "
            "(or by enabling ALLOW_CUSTOM_COMMANDS)."
        )

    if local and runtime == "node" and not (local / "package.json").is_file() and not start_cmd:
        errors.append("package.json was not found in the project path (required for the node runtime).")

    dockerfile = _text(d.get("dockerfile_path")) or None
    if runtime == "dockerfile":
        if not dockerfile:
            errors.append("Dockerfile path is required for the dockerfile runtime.")
        elif local:
            target = (local / dockerfile).resolve()
            if not is_within(target, local) or not target.is_file():
                errors.append("Dockerfile must be a file inside the project path.")
    compose = _text(d.get("compose_file_path")) or None
    if compose:
        try:
            if not resolve_local_path(compose).is_file():
                errors.append("Compose file path does not point to a file.")
        except ValueError as exc:
            errors.append(f"Compose file path: {exc}")

    host = _text(d.get("host") or "localhost")
    if not HOST_RE.match(host):
        errors.append("Host is invalid.")
    bind = _text(d.get("bind_address") or "127.0.0.1")
    if bind not in ("127.0.0.1", "0.0.0.0"):
        errors.append("Bind address must be 127.0.0.1 or 0.0.0.0.")
    elif bind == "0.0.0.0" and not settings.ALLOW_REMOTE_BIND:
        errors.append("Binding to 0.0.0.0 exposes the service to your network. Set ALLOW_REMOTE_BIND=true to allow it.")

    host_port = _int(d.get("host_port"), "Host port", 1, 65535, errors)
    container_port = _int(d.get("container_port"), "Container port", 1, 65535, errors)
    if host_port in settings.RESERVED_PORTS:
        errors.append(f"Host port {host_port} is reserved by DJ Services / PostgreSQL.")

    proto = _text(d.get("protocol") or "http").lower()
    if proto not in PROTOCOLS:
        errors.append("Protocol must be http or https.")
    health = _text(d.get("health_check_path") or "/")
    if not health.startswith("/") or len(health) > 300 or re.search(r"\s", health):
        errors.append("Health check path must start with '/' and contain no spaces.")

    image = _text(d.get("docker_image")) or IMAGE_BY_RUNTIME.get(runtime) or None
    if runtime == "image" and not image:
        errors.append("Docker image is required for the image runtime.")
    if image and not IMAGE_RE.match(image):
        errors.append("Docker image name is invalid.")

    cname = _text(d.get("container_name")) or f"dj_{sid}"
    if not CONTAINER_RE.match(cname):
        errors.append("Container name may contain letters, digits, '_', '.', '-' (2-63 chars).")

    deps = d.get("depends_on") or []
    if not isinstance(deps, list) or any(not ID_RE.match(_text(x)) for x in deps):
        errors.append("Dependencies must be a list of valid service IDs.")
        deps = []
    deps = list(dict.fromkeys(_text(x) for x in deps))
    if sid in deps:
        errors.append("A service cannot depend on itself.")

    start_period = d.get("start_period_seconds")
    start_period = (
        START_PERIOD[runtime] if start_period in (None, "") else _int(start_period, "Start period", 5, 7200, errors)
    )

    auto_start = _bool(d.get("auto_start"), False)
    auto_restart = _bool(d.get("auto_restart"), True)

    if errors:
        raise ValidationFailed("Service configuration is invalid.", details=errors)

    return {
        "service_id": sid, "project_id": pid, "service_name": name, "service_type": stype,
        "project_path": path_raw, "runtime_type": runtime, "dockerfile_path": dockerfile,
        "compose_file_path": compose, "container_name": cname, "docker_image": image,
        "host": host, "bind_address": bind, "host_port": host_port, "container_port": container_port,
        "protocol": proto, "health_check_path": health, "enabled": _bool(d.get("enabled"), True),
        "auto_start": auto_start, "auto_restart": auto_restart,
        "restart_policy": restart_policy_for(auto_start, auto_restart),
        "depends_on": deps, "env": _env(d.get("env"), errors) if not errors else {},
        "start_command": start_cmd, "install_command": install_cmd,
        "start_period_seconds": start_period,
    }


async def check_conflicts(cleaned: dict, *, existing_id: str | None = None) -> None:
    """Duplicate ID / container name / host port, unknown dependencies, dependency cycles."""
    from app.database import repository as repo

    services = await repo.list_services()
    others = [s for s in services if s["service_id"] != existing_id]
    dupes, problems = [], []

    if existing_id is None and any(s["service_id"] == cleaned["service_id"] for s in services):
        dupes.append(f"Service ID '{cleaned['service_id']}' already exists.")
    for s in others:
        if s["container_name"] == cleaned["container_name"]:
            dupes.append(f"Container name '{cleaned['container_name']}' is already used by '{s['service_name']}'.")
        if s["host_port"] == cleaned["host_port"]:
            dupes.append(f"Host port {cleaned['host_port']} is already assigned to '{s['service_name']}'.")

    known = {s["service_id"] for s in services} | {cleaned["service_id"]}
    missing = [x for x in cleaned["depends_on"] if x not in known]
    if missing:
        problems.append(f"Unknown dependency service(s): {', '.join(missing)}.")
    graph = {s["service_id"]: list(s["depends_on"]) for s in others}
    graph[cleaned["service_id"]] = list(cleaned["depends_on"])
    cycle = find_cycle(graph)
    if cycle:
        problems.append("Dependency cycle: " + " -> ".join(cycle))

    if dupes:
        raise Conflict(dupes[0], details=dupes + problems)
    if problems:
        raise ValidationFailed("Service configuration is invalid.", details=problems)