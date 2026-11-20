# app/control/port_manager.py
# Host-port availability: published by another Docker container, or listened on by a local process.

import socket

from app.config.settings import settings
from app.control.docker_manager import docker_mgr
from app.utils.errors import PortConflict


def _probe(host: str, port: int, timeout: float = 0.4) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def listening_locally(port: int) -> bool:
    return any(_probe(h, port) for h in settings.PORT_PROBE_HOSTS)


def containers_using(port: int, exclude_service: str | None = None) -> list:
    def work(client):
        out = []
        for c in client.containers.list():  # running containers only; they hold the port
            a = c.attrs or {}
            labels = a.get("Labels") or {}
            if exclude_service and labels.get("dj.service_id") == exclude_service:
                continue
            if any(p.get("PublicPort") == port for p in a.get("Ports") or []):
                names = a.get("Names") or []
                out.append({
                    "name": (names[0] if names else c.short_id).lstrip("/"),
                    "service_id": labels.get("dj.service_id"),
                })
        return out

    return docker_mgr.run(work)


def describe(port: int, exclude_service: str | None = None) -> dict:
    users = containers_using(port, exclude_service)
    return {
        "port": port, "in_use": bool(users) or listening_locally(port),
        "containers": [u["name"] for u in users],
    }


def ensure_free(service: dict) -> None:
    port, name = service["host_port"], service["service_name"]
    users = containers_using(port, exclude_service=service["service_id"])
    if users:
        raise PortConflict(
            f"Unable to start {name}.\n\nReason:\nPort {port} is already published by Docker container "
            f"'{users[0]['name']}'.\n\nPlease stop that container or configure another host port.",
            details=[f"container={u['name']}" for u in users],
        )
    if listening_locally(port):
        raise PortConflict(
            f"Unable to start {name}.\n\nReason:\nPort {port} is already occupied.\n\n"
            "Please stop the existing process or configure another host port."
        )