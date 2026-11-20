# app/control/container_manager.py
# Dynamic container creation / lifecycle for registered services. Blocking: use asyncio.to_thread.
# Only containers labelled dj.managed=true AND matching the service id are ever touched.

import hashlib
import json
import os
import re
import shlex
from pathlib import Path

from docker.errors import APIError, BuildError, ImageNotFound
from docker.errors import NotFound as DockerNotFound
from docker.types import Mount

from app.config.settings import settings
from app.control.docker_manager import docker_mgr
from app.utils.errors import Conflict, NotFound, OperationFailed, ValidationFailed
from app.utils.paths import is_within, resolve_local_path, to_host_path
from app.utils.validators import REF_RE, SECRET_KEY_RE

L_MANAGED = "dj.managed"
L_SERVICE = "dj.service_id"
L_PROJECT = "dj.project_id"
L_SIG = "dj.sig"

_SIG_FIELDS = (
    "service_id", "container_name", "runtime_type", "project_path", "docker_image", "dockerfile_path",
    "bind_address", "host_port", "container_port", "restart_policy", "env", "start_command", "install_command",
)

_PY_SCRIPT = """set -e
cd /app
export PATH="/opt/dj_py/bin:$PATH"
if [ -f requirements.txt ]; then
  H=$(sha256sum requirements.txt | cut -d' ' -f1)
  if [ ! -f /opt/dj_py/.deps.sha ] || [ "$(cat /opt/dj_py/.deps.sha)" != "$H" ]; then
    echo "[dj] installing Python dependencies (the first start can take several minutes)..."
    {install}
    mkdir -p /opt/dj_py && echo "$H" > /opt/dj_py/.deps.sha
  fi
fi
echo "[dj] starting application on port $PORT"
exec {start}
"""

_NODE_SCRIPT = """set -e
cd /app
if [ -f package.json ]; then
  H=$(cat package.json package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)
  mkdir -p node_modules
  if [ ! -f node_modules/.dj_deps.sha ] || [ "$(cat node_modules/.dj_deps.sha)" != "$H" ]; then
    echo "[dj] installing Node dependencies (the first start can take a few minutes)..."
    {install}
    echo "$H" > node_modules/.dj_deps.sha
  fi
fi
echo "[dj] starting application on port $PORT"
exec {start}
"""

_LOG_SECRET = re.compile(
    r"(?i)((?:api[_-]?key|secret|token|password|passwd|authorization)\s*[=:]\s*)(\S+)"
)


# ─── pure helpers ─────────────────────────────────────────────────────────────

def signature(service: dict) -> str:
    payload = {k: service.get(k) for k in _SIG_FIELDS}
    payload["_network"] = settings.DOCKER_NETWORK
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]


def resolve_env(env: dict) -> dict:
    out = {}
    for key, value in (env or {}).items():
        text = "" if value is None else str(value)
        if REF_RE.match(text):
            name = text[2:-1]
            resolved = os.environ.get(name)
            if resolved is None:
                raise ValidationFailed(
                    f"Environment reference ${{{name}}} (used by {key}) is not set in the DJ Services environment."
                )
            out[key] = resolved
        else:
            out[key] = text
    return out


def mask_env(env: dict) -> dict:
    out = {}
    for key, value in (env or {}).items():
        text = "" if value is None else str(value)
        out[key] = text if REF_RE.match(text) else ("••••••" if SECRET_KEY_RE.search(key) and text else text)
    return out


def mask_log_line(line: str) -> str:
    return _LOG_SECRET.sub(lambda m: f"{m.group(1)}••••••", line)


def restart_policy_dict(value: str | None) -> dict:
    v = (value or "no").strip()
    if v.startswith("on-failure"):
        _, _, n = v.partition(":")
        return {"Name": "on-failure", "MaximumRetryCount": int(n) if n.isdigit() else 5}
    if v in ("always", "unless-stopped"):
        return {"Name": v}
    return {"Name": "no"}


def describe_path(service: dict) -> dict:
    try:
        local = resolve_local_path(service["project_path"])
        return {"local": str(local), "docker_host": to_host_path(local), "exists": local.is_dir()}
    except ValueError as exc:
        return {"local": None, "docker_host": None, "exists": False, "error": str(exc)}


def _python_start(local: Path, service: dict) -> str:
    if service.get("start_command"):
        return service["start_command"]
    if (local / "run.py").is_file():
        return "python run.py"
    if (local / "app" / "main.py").is_file():
        return 'python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"'
    raise OperationFailed("No run.py or app/main.py found in the project path. Set a start command for this service.")


def _node_start(local: Path, service: dict) -> str:
    if service.get("start_command"):
        return service["start_command"]
    try:
        scripts = json.loads((local / "package.json").read_text(encoding="utf-8")).get("scripts") or {}
    except (OSError, ValueError):
        raise OperationFailed("package.json is missing or unreadable in the project path.")
    if "dev" in scripts:
        return 'npm run dev -- --host 0.0.0.0 --port "$PORT" --strictPort'
    if "start" in scripts:
        return "npm start"
    raise OperationFailed("package.json has no 'dev' or 'start' script. Set a start command for this service.")


def build_spec(service: dict) -> dict:
    sid, runtime = service["service_id"], service["runtime_type"]
    try:
        local = resolve_local_path(service["project_path"])
    except ValueError as exc:
        raise ValidationFailed(f"Project path: {exc}")
    if not local.is_dir():
        raise ValidationFailed(f"Project path does not exist: {service['project_path']}")

    env = {"PORT": str(service["container_port"]), "HOST": "0.0.0.0", "DJ_SERVICE_ID": sid}
    mounts, command, workdir, build = [], None, None, None
    image = service.get("docker_image")

    if runtime == "python":
        workdir = "/app"
        mounts += [
            Mount("/app", to_host_path(local), type="bind"),
            Mount("/opt/dj_py", f"dj_{sid}_pydeps", type="volume"),
            Mount("/root/.cache/pip", "dj_pip_cache", type="volume"),
        ]
        env.update(
            PYTHONUNBUFFERED="1", PYTHONDONTWRITEBYTECODE="1", PYTHONUSERBASE="/opt/dj_py",
            PIP_DISABLE_PIP_VERSION_CHECK="1",
        )
        install = service.get("install_command") or "pip install --user --no-input -r requirements.txt"
        command = ["/bin/sh", "-c", _PY_SCRIPT.format(install=install, start=_python_start(local, service))]
    elif runtime == "node":
        workdir = "/app"
        mounts += [
            Mount("/app", to_host_path(local), type="bind"),
            Mount("/app/node_modules", f"dj_{sid}_node_modules", type="volume"),
            Mount("/root/.npm", "dj_npm_cache", type="volume"),
        ]
        env.update(CHOKIDAR_USEPOLLING="true", WATCHPACK_POLLING="true")
        install = service.get("install_command") or "npm install --no-package-lock --no-audit --no-fund"
        command = ["/bin/sh", "-c", _NODE_SCRIPT.format(install=install, start=_node_start(local, service))]
    elif runtime == "dockerfile":
        target = (local / (service.get("dockerfile_path") or "")).resolve()
        if not is_within(target, local) or not target.is_file():
            raise ValidationFailed("Dockerfile must be a file inside the project path.")
        build = {
            "path": str(local),
            "dockerfile": os.path.relpath(target, local).replace("\\", "/"),
            "tag": f"dj_{sid}:latest",
        }
        image = build["tag"]
        if service.get("start_command"):
            command = shlex.split(service["start_command"])
    else:  # image
        if not image:
            raise ValidationFailed("Docker image is required for the image runtime.")
        if service.get("start_command"):
            command = shlex.split(service["start_command"])

    env.update(resolve_env(service.get("env")))
    return {
        "sig": signature(service),
        "image": image,
        "build": build,
        "command": command,
        "environment": env,
        "mounts": mounts,
        "ports": {f"{service['container_port']}/tcp": (service["bind_address"], service["host_port"])},
        "labels": {
            L_MANAGED: "true", L_SERVICE: sid, L_PROJECT: service["project_id"],
            L_SIG: signature(service), "dj.created_by": "dj_services",
        },
        "restart_policy": restart_policy_dict(service.get("restart_policy")),
        "working_dir": workdir,
        "network": settings.DOCKER_NETWORK,
    }


# ─── summaries ────────────────────────────────────────────────────────────────

def _port_list_from_bindings(bindings: dict) -> list:
    out = []
    for key, binds in (bindings or {}).items():
        port, _, proto = key.partition("/")
        for b in binds or []:
            out.append({
                "container_port": int(port), "protocol": proto or "tcp", "host_ip": b.get("HostIp"),
                "host_port": int(b["HostPort"]) if b.get("HostPort") else None,
            })
    return out


def summarize(c) -> dict:
    """Normalised view of a container from either a list() or an inspect() payload."""
    a = c.attrs or {}
    state = a.get("State")
    if isinstance(state, dict):
        cfg = a.get("Config") or {}
        labels = cfg.get("Labels") or {}
        status = state.get("Status")
        exit_code = state.get("ExitCode") if status not in ("running", "restarting", "created") else None
        name = (a.get("Name") or "").lstrip("/")
        image = cfg.get("Image")
        ports = _port_list_from_bindings((a.get("NetworkSettings") or {}).get("Ports"))
    else:
        labels = a.get("Labels") or {}
        status = state
        m = re.search(r"Exited \((-?\d+)\)", a.get("Status") or "")
        exit_code = int(m.group(1)) if m else None
        names = a.get("Names") or []
        name = (names[0] if names else "").lstrip("/")
        image = a.get("Image")
        ports = [
            {"container_port": p.get("PrivatePort"), "protocol": p.get("Type"), "host_ip": p.get("IP"),
             "host_port": p.get("PublicPort")}
            for p in a.get("Ports") or [] if p.get("PublicPort")
        ]
    cid = a.get("Id") or c.id or ""
    return {
        "container_id": cid, "short_id": cid[:12], "name": name, "status": status, "exit_code": exit_code,
        "image": image, "created": a.get("Created"), "ports": ports, "labels": labels, "sig": labels.get(L_SIG),
    }


def managed_summaries() -> dict:
    """{service_id: summary} for every container labelled dj.managed=true."""
    containers = docker_mgr.run(lambda cl: cl.containers.list(all=True, filters={"label": f"{L_MANAGED}=true"}))
    out = {}
    for c in sorted(containers, key=lambda x: (x.attrs or {}).get("Created") or 0):
        s = summarize(c)
        sid = s["labels"].get(L_SERVICE)
        if sid:
            out[sid] = s
    return out


def list_containers(scope: str = "managed") -> list:
    if scope == "all":
        containers = docker_mgr.run(lambda cl: cl.containers.list(all=True))
        out = []
        for c in containers:
            s = summarize(c)
            out.append({
                "container_id": s["short_id"], "name": s["name"], "image": s["image"], "status": s["status"],
                "ports": s["ports"], "managed": s["labels"].get(L_MANAGED) == "true",
                "service_id": s["labels"].get(L_SERVICE),
            })
        return out
    return [
        {"container_id": s["short_id"], "name": s["name"], "image": s["image"], "status": s["status"],
         "ports": s["ports"], "managed": True, "service_id": sid, "exit_code": s["exit_code"]}
        for sid, s in managed_summaries().items()
    ]


# ─── lookup ───────────────────────────────────────────────────────────────────

def _labels(c) -> dict:
    return ((c.attrs or {}).get("Config") or {}).get("Labels") or {}


def find(service: dict):
    """The service's container, or None. Refuses containers that DJ Services does not own."""
    name = service["container_name"]
    try:
        c = docker_mgr.run(lambda cl: cl.containers.get(name))
    except DockerNotFound:
        return None
    labels = _labels(c)
    if labels.get(L_MANAGED) != "true" or labels.get(L_SERVICE) != service["service_id"]:
        raise Conflict(
            f"A Docker container named '{name}' already exists but is not managed by DJ Services. "
            "Remove or rename it, or choose another container name for this service."
        )
    return c


def inspect_details(c) -> dict:
    docker_mgr.run(lambda _cl: c.reload())
    a = c.attrs
    st, cfg, hc = a.get("State") or {}, a.get("Config") or {}, a.get("HostConfig") or {}
    labels = cfg.get("Labels") or {}

    def ts(v):
        return None if not v or str(v).startswith("0001-") else v

    rp = hc.get("RestartPolicy") or {}
    policy = rp.get("Name") or "no"
    if policy == "on-failure" and rp.get("MaximumRetryCount"):
        policy = f"on-failure:{rp['MaximumRetryCount']}"
    return {
        "container_id": a.get("Id"), "short_id": (a.get("Id") or "")[:12], "name": (a.get("Name") or "").lstrip("/"),
        "image": cfg.get("Image"), "image_id": a.get("Image"), "created": a.get("Created"),
        "status": st.get("Status"), "running": st.get("Running"), "exit_code": st.get("ExitCode"),
        "started_at": ts(st.get("StartedAt")), "finished_at": ts(st.get("FinishedAt")),
        "restart_count": a.get("RestartCount"), "oom_killed": st.get("OOMKilled"),
        "restart_policy": policy, "ports": _port_list_from_bindings(hc.get("PortBindings")),
        "mounts": [
            {"type": m.get("Type"), "source": m.get("Name") or m.get("Source"), "target": m.get("Destination"),
             "read_only": not m.get("RW", True)}
            for m in a.get("Mounts") or []
        ],
        "networks": list(((a.get("NetworkSettings") or {}).get("Networks") or {}).keys()),
        "sig": labels.get(L_SIG),
        "labels": {k: v for k, v in labels.items() if k.startswith("dj.")},
    }


def inspect_managed(container_id: str) -> dict:
    """Details of one managed container by id/name. Containers not owned by DJ Services are invisible."""
    try:
        c = docker_mgr.run(lambda cl: cl.containers.get(container_id))
    except DockerNotFound:
        raise NotFound("Container not found.")
    if _labels(c).get(L_MANAGED) != "true":
        raise NotFound("Container not found or not managed by DJ Services.")
    return inspect_details(c)


# ─── lifecycle ────────────────────────────────────────────────────────────────

def ensure_network(client) -> None:
    name = settings.DOCKER_NETWORK
    if any(n.name == name for n in client.networks.list(names=[name])):
        return
    try:
        client.networks.create(name, driver="bridge", labels={L_MANAGED: "true"})
    except APIError:
        if not any(n.name == name for n in client.networks.list(names=[name])):
            raise


def ensure_image(spec: dict, progress=None) -> None:
    def note(msg):
        if progress:
            progress(msg)

    def work(client):
        if spec["build"]:
            b = spec["build"]
            note(f"Building image {b['tag']} …")
            try:
                client.images.build(path=b["path"], dockerfile=b["dockerfile"], tag=b["tag"], rm=True)
            except BuildError as exc:
                raise OperationFailed(f"Image build failed: {str(exc)[:300]}")
            return
        try:
            client.images.get(spec["image"])
        except ImageNotFound:
            note(f"Pulling image {spec['image']} …")
            try:
                client.images.pull(spec["image"])
            except DockerNotFound:
                raise OperationFailed(f"Image '{spec['image']}' was not found in the registry.")

    docker_mgr.run(work, "Image: ")


def create(service: dict, spec: dict):
    def work(client):
        ensure_network(client)
        return client.containers.create(
            spec["image"], command=spec["command"], name=service["container_name"],
            environment=spec["environment"], ports=spec["ports"], mounts=spec["mounts"],
            labels=spec["labels"], restart_policy=spec["restart_policy"], working_dir=spec["working_dir"],
            network_mode=spec["network"], extra_hosts={"host.docker.internal": "host-gateway"}, init=True,
        )

    return docker_mgr.run(work, "Create container: ")


def start(c) -> None:
    docker_mgr.run(lambda _cl: c.start(), "Start container: ")


def stop(c) -> None:
    docker_mgr.run(lambda _cl: c.stop(timeout=settings.STOP_TIMEOUT), "Stop container: ")


def remove(c) -> None:
    try:
        docker_mgr.run(lambda _cl: c.remove(force=True), "Remove container: ")
    except DockerNotFound:
        pass


def ensure_container(service: dict, spec: dict):
    """Existing container (same configuration), or a freshly (re)created one. Stopped + changed -> recreate."""
    c = find(service)
    if c is not None:
        if _labels(c).get(L_SIG) == spec["sig"]:
            return c
        if c.status in ("running", "restarting"):
            return c  # keep it running; the pending change applies on the next restart
        remove(c)
    return create(service, spec)


def remove_volumes(service: dict) -> None:
    sid = service["service_id"]

    def work(client):
        for name in (f"dj_{sid}_pydeps", f"dj_{sid}_node_modules"):
            try:
                client.volumes.get(name).remove(force=True)
            except (DockerNotFound, APIError):
                pass

    docker_mgr.run(work)


def logs(c, tail: int = 200) -> list:
    tail = max(1, min(int(tail), settings.LOG_TAIL_MAX))
    raw = docker_mgr.run(lambda _cl: c.logs(tail=tail, timestamps=True, stdout=True, stderr=True))
    return [mask_log_line(line) for line in raw.decode("utf-8", "replace").splitlines()]