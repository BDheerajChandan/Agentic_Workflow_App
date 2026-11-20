# app/control/docker_manager.py
# Single Docker Engine connection (Docker SDK). Calls are blocking: run them with asyncio.to_thread.

import threading

import docker
import requests
from docker.errors import APIError, DockerException

from app.config.settings import settings
from app.utils.errors import DockerUnavailable, OperationFailed, PortConflict
from app.utils.logger import get_logger

log = get_logger("docker")

_UNREACHABLE = (
    "cannot find the file", "no such file", "connection refused", "connection aborted",
    "pipe", "max retries", "refused", "timed out", "timeout",
)


def friendly(exc: Exception) -> str:
    low = str(exc).lower()
    if any(h in low for h in _UNREACHABLE):
        return "Docker is not reachable. Start Docker Desktop and wait until it reports 'Engine running'."
    return f"Docker error: {str(exc)[:200]}"


def api_error(exc: APIError, context: str = ""):
    msg = (getattr(exc, "explanation", None) or str(exc) or "").strip()
    low = msg.lower()
    if "port is already allocated" in low or "address already in use" in low or "ports are not available" in low:
        return PortConflict(
            "The host port is already in use. Stop the existing process or configure another host port.",
            details=[msg[:300]],
        )
    return OperationFailed((context + msg[:300]).strip() or "Docker operation failed.")


class DockerManager:
    def __init__(self) -> None:
        self._client = None
        self._lock = threading.Lock()

    def _connect(self):
        try:
            if settings.DOCKER_HOST:
                client = docker.DockerClient(base_url=settings.DOCKER_HOST, timeout=settings.DOCKER_TIMEOUT)
            else:
                client = docker.from_env(timeout=settings.DOCKER_TIMEOUT)
            client.ping()
            return client
        except Exception as exc:  # noqa: BLE001
            raise DockerUnavailable(friendly(exc)) from exc

    def client(self):
        with self._lock:
            if self._client is None:
                self._client = self._connect()
                log.info("Connected to Docker Engine.")
            return self._client

    def reset(self) -> None:
        with self._lock:
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:  # noqa: BLE001
                    pass
            self._client = None

    def run(self, fn, context: str = ""):
        """Run fn(client). Docker 404s are re-raised unchanged for callers; other errors become ApiErrors."""
        client = self.client()
        try:
            return fn(client)
        except APIError as exc:
            if getattr(exc, "status_code", None) == 404:
                raise
            raise api_error(exc, context) from exc
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            self.reset()
            log.warning("Docker connection lost: %s", type(exc).__name__)
            raise DockerUnavailable(friendly(exc)) from exc
        except DockerException as exc:
            raise OperationFailed((context + str(exc)[:300]).strip()) from exc

    # ─── status / info ────────────────────────────────────────────────────────

    def status(self) -> dict:
        down = {"connected": False, "version": None, "api_version": None, "os": None, "arch": None}
        try:
            v = self.run(lambda c: c.version())
            return {
                "connected": True, "error": None, "version": v.get("Version"),
                "api_version": v.get("ApiVersion"), "os": v.get("Os"), "arch": v.get("Arch"),
            }
        except DockerUnavailable as exc:
            return {**down, "error": exc.message}
        except Exception as exc:  # noqa: BLE001
            self.reset()
            return {**down, "error": friendly(exc)}

    def version(self) -> dict:
        v = self.run(lambda c: c.version())
        keys = ("Version", "ApiVersion", "MinAPIVersion", "GitCommit", "GoVersion", "Os", "Arch", "KernelVersion")
        return {k: v.get(k) for k in keys}

    def info(self) -> dict:
        i = self.run(lambda c: c.info())
        keys = (
            "Name", "ServerVersion", "OperatingSystem", "OSType", "Architecture", "NCPU", "MemTotal",
            "Containers", "ContainersRunning", "ContainersPaused", "ContainersStopped", "Images", "Driver",
        )
        return {k: i.get(k) for k in keys}


docker_mgr = DockerManager()