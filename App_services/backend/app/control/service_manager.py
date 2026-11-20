# app/control/service_manager.py
# Orchestration: views, start/stop/restart, Start All / Stop All jobs, details, logs, reconcile, monitor.
# Docker Engine is the source of truth for container state; PostgreSQL for configuration + intent.

import asyncio
import time
import uuid
from collections import OrderedDict
from datetime import datetime, timezone

from app.config.settings import settings
from app.control import container_manager as cm
from app.control import health_manager as hm
from app.control import port_manager as pm
from app.control.docker_manager import docker_mgr
from app.database import repository as repo
from app.utils.errors import (
    ApiError, Conflict, DockerUnavailable, NotFound, OperationFailed, PortConflict,
)
from app.utils.logger import audit, get_logger

log = get_logger("service")

RUNNING = ("running", "restarting")
STATE_LABEL = {
    "active": "ACTIVE", "starting": "STARTING", "unhealthy": "UNHEALTHY",
    "inactive": "INACTIVE", "disabled": "DISABLED", "unavailable": "UNAVAILABLE",
}
CACHE_SECONDS = 2.0
OP_VISIBLE_SECONDS = 120


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(ts):
    if ts is None or isinstance(ts, datetime):
        return ts
    try:
        return datetime.fromisoformat(str(ts))
    except ValueError:
        return None


def _iso(dt):
    return dt.isoformat() if dt else None


def _iso_ts(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None


def start_levels(services: list) -> list:
    """Dependency levels: every service appears after the services it depends on."""
    by_id = {s["service_id"]: s for s in services}
    remaining, done, levels = set(by_id), set(), []
    while remaining:
        ready = [i for i in remaining if all(d in done or d not in by_id for d in by_id[i]["depends_on"])]
        if not ready:  # cycle guard (the validator rejects cycles)
            ready = list(remaining)
        levels.append([by_id[i] for i in sorted(ready)])
        done.update(ready)
        remaining -= set(ready)
    return levels


class ServiceManager:
    def __init__(self) -> None:
        self._locks: dict = {}
        self._ops: dict = {}
        self._tasks: dict = {}
        self._jobs: OrderedDict = OrderedDict()
        self._health_ok_at: dict = {}
        self._started_at: dict = {}
        self._cache = (0.0, None)
        self._refresh_lock = asyncio.Lock()

    # ─── plumbing ─────────────────────────────────────────────────────────────

    def _lock(self, sid: str) -> asyncio.Lock:
        return self._locks.setdefault(sid, asyncio.Lock())

    def _invalidate(self) -> None:
        self._cache = (0.0, None)

    def _set_op(self, sid, action, state, message="", error=None) -> None:
        prev = self._ops.get(sid)
        now = time.time()
        keep = bool(prev) and prev["state"] == "running" and prev["action"] == action
        self._ops[sid] = {
            "action": action, "state": state, "message": message, "error": error,
            "ts_started": prev["ts_started"] if keep else now,
            "ts_finished": None if state == "running" else now,
        }

    def _live_op(self, sid):
        op = self._ops.get(sid)
        if not op:
            return None
        if op["state"] != "running" and time.time() - (op["ts_finished"] or 0) > OP_VISIBLE_SECONDS:
            return None
        return {
            "action": op["action"], "state": op["state"], "message": op["message"], "error": op["error"],
            "started_at": _iso_ts(op["ts_started"]), "finished_at": _iso_ts(op["ts_finished"]),
        }

    async def _ensure_docker(self) -> dict:
        st = await asyncio.to_thread(docker_mgr.status)
        if not st["connected"]:
            raise DockerUnavailable(st["error"] or "Docker is not reachable.")
        return st

    async def _service(self, sid: str) -> dict:
        s = await repo.get_service(sid)
        if not s:
            raise NotFound("Service not found.")
        return s

    async def _event(self, sid, etype, message) -> None:
        try:
            await repo.add_event(sid, etype, message)
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not record event for %s: %s", sid, type(exc).__name__)

    async def _tail(self, s, n: int = 20) -> list:
        try:
            ctr = await asyncio.to_thread(cm.find, s)
            return await asyncio.to_thread(cm.logs, ctr, n) if ctr else []
        except Exception:  # noqa: BLE001
            return []

    async def _fail(self, s, action, err: ApiError) -> None:
        sid = s["service_id"]
        self._set_op(sid, action, "failed", err.message, err.message)
        log.error("%s failed for %s: %s", action, sid, err.message.replace("\n", " "))
        audit(action, sid, outcome="failed", reason=err.code)
        try:
            await repo.set_runtime(sid, last_error=err.message[:2000])
        except Exception:  # noqa: BLE001
            pass
        await self._event(sid, f"{action}_failed", err.message[:500])
        self._invalidate()

    # ─── views ────────────────────────────────────────────────────────────────

    def _view(self, s, project, rt, ctr, probe, docker_ok) -> dict:
        sid = s["service_id"]
        rt = rt or {}
        docker_status = (ctr["status"] if ctr else "not_found") if docker_ok else None
        started = self._started_at.get(sid) or _parse(rt.get("last_started_at"))
        health = hm.classify(s, docker_status, probe, started)
        if probe and probe.get("ok"):
            self._health_ok_at[sid] = _now()
        op = self._live_op(sid)

        if not docker_ok:
            state = "unavailable"
        elif docker_status in RUNNING:
            state = "active" if health == "healthy" else ("starting" if health == "starting" else "unhealthy")
        elif not s["enabled"]:
            state = "disabled"
        elif op and op["state"] == "running" and op["action"] in ("start", "restart"):
            state = "starting"
        else:
            state = "inactive"

        return {
            "service_id": sid, "project_id": s["project_id"],
            "project_name": (project or {}).get("project_name") or s["project_id"],
            "service_name": s["service_name"], "service_type": s["service_type"], "runtime_type": s["runtime_type"],
            "host": s["host"], "bind_address": s["bind_address"], "host_port": s["host_port"],
            "container_port": s["container_port"], "protocol": s["protocol"],
            "url": f"{s['protocol']}://{s['host']}:{s['host_port']}",
            "health_check_path": s["health_check_path"], "container_name": s["container_name"],
            "enabled": s["enabled"], "auto_start": s["auto_start"], "auto_restart": s["auto_restart"],
            "restart_policy": s["restart_policy"], "depends_on": s["depends_on"],
            "docker_status": docker_status, "container_id": ctr["short_id"] if ctr else None,
            "health": health,
            "health_detail": {k: probe.get(k) for k in ("status_code", "latency_ms", "error")} if probe else None,
            "state": state, "state_label": STATE_LABEL[state], "active": docker_status == "running",
            "desired_state": rt.get("desired_state"),
            "last_started_at": rt.get("last_started_at"), "last_stopped_at": rt.get("last_stopped_at"),
            "last_health_check_at": _iso(self._health_ok_at.get(sid)) or rt.get("last_health_check_at"),
            "last_error": rt.get("last_error"),
            "pending_recreate": bool(ctr) and ctr.get("sig") not in (None, cm.signature(s)),
            "operation": op,
        }

    async def _persist(self, views, runtimes, ctr_map) -> None:
        """Write runtime state only when it changed (never on every poll)."""
        for v in views:
            sid = v["service_id"]
            prev = runtimes.get(sid) or {}
            status, health, cid = v["docker_status"], v["health"], v["container_id"]
            old, old_health = prev.get("container_status"), prev.get("health_status")
            if (status, health) == (old, old_health) and cid == (prev.get("container_id") or "")[:12] or (
                status, health, cid) == (old, old_health, prev.get("container_id")):
                continue
            fields = {
                "container_id": (ctr_map.get(sid) or {}).get("container_id"),
                "container_status": status, "health_status": health,
            }
            now = _now()
            if status == "running" and old != "running":
                recent = self._started_at.get(sid)
                if not recent or (now - recent).total_seconds() > 30:
                    fields["last_started_at"] = now
                    self._started_at[sid] = now
            if old in RUNNING and status not in RUNNING:
                fields["last_stopped_at"] = now
                code = (ctr_map.get(sid) or {}).get("exit_code")
                if prev.get("desired_state") == "running" and code not in (0, None):
                    msg = f"Container exited unexpectedly with code {code}."
                    fields["last_error"] = msg
                    log.warning("%s: %s", sid, msg)
                    await self._event(sid, "crashed", msg)
            if old_health is not None and health != old_health:
                if health == "unhealthy":
                    await self._event(sid, "unhealthy", "Health check failing.")
                elif health == "healthy" and old_health in ("unhealthy", "starting"):
                    await self._event(sid, "healthy", "Health check passing.")
            if health == "healthy":
                fields["last_health_check_at"] = self._health_ok_at.get(sid) or now
                if prev.get("last_error"):
                    fields["last_error"] = None
            try:
                await repo.set_runtime(sid, **fields)
            except Exception as exc:  # noqa: BLE001
                log.warning("Could not persist runtime for %s: %s", sid, type(exc).__name__)

    async def _collect(self) -> dict:
        services = await repo.list_services()
        projects = {p["project_id"]: p for p in await repo.list_projects()}
        runtimes = await repo.list_runtimes()
        docker_info = await asyncio.to_thread(docker_mgr.status)

        ctr_map: dict = {}
        if docker_info["connected"]:
            try:
                ctr_map = await asyncio.to_thread(cm.managed_summaries)
            except ApiError as exc:
                docker_info = {**docker_info, "connected": False, "error": exc.message}

        probes: dict = {}
        if docker_info["connected"]:
            running = [s for s in services if (ctr_map.get(s["service_id"]) or {}).get("status") in RUNNING]
            results = await asyncio.gather(
                *[asyncio.to_thread(hm.check, s) for s in running], return_exceptions=True
            )
            probes = {s["service_id"]: r for s, r in zip(running, results) if isinstance(r, dict)}

        ok = docker_info["connected"]
        views = [
            self._view(s, projects.get(s["project_id"]), runtimes.get(s["service_id"]),
                       ctr_map.get(s["service_id"]), probes.get(s["service_id"]), ok)
            for s in services
        ]
        if ok:
            await self._persist(views, runtimes, ctr_map)

        states = [v["state"] for v in views]
        return {
            "services": views,
            "summary": {
                "total": len(views), "active": states.count("active"), "inactive": states.count("inactive"),
                "unhealthy": states.count("unhealthy"), "starting": states.count("starting"),
                "disabled": states.count("disabled"), "docker": "connected" if ok else "disconnected",
            },
            "docker": docker_info,
            "refreshed_at": _now().isoformat(),
        }

    async def list_views(self, force: bool = False) -> dict:
        ts, cached = self._cache
        if not force and cached is not None and time.time() - ts < CACHE_SECONDS:
            return cached
        async with self._refresh_lock:
            ts, cached = self._cache
            if not force and cached is not None and time.time() - ts < CACHE_SECONDS:
                return cached
            result = await self._collect()
            self._cache = (time.time(), result)
            return result

    async def get_view(self, sid: str, *, force: bool = False) -> dict:
        data = await self.list_views(force=force)
        for v in data["services"]:
            if v["service_id"] == sid:
                return v
        raise NotFound("Service not found.")

    # ─── start ────────────────────────────────────────────────────────────────

    async def _confirm_running(self, s) -> None:
        deadline = time.monotonic() + 3.0
        while True:
            ctr = await asyncio.to_thread(cm.find, s)
            status = ctr.status if ctr else "not_found"
            if status in ("exited", "dead", "not_found"):
                code = (ctr.attrs.get("State") or {}).get("ExitCode") if ctr else None
                raise OperationFailed(
                    f"The container exited immediately (exit code {code}).", details=await self._tail(s) or None
                )
            if time.monotonic() >= deadline:
                return
            await asyncio.sleep(0.5)

    async def _wait_healthy(self, s, action):
        sid, name = s["service_id"], s["service_name"]
        limit = max(10, int(s.get("start_period_seconds") or 300))
        deadline = time.monotonic() + limit
        try:
            while time.monotonic() < deadline:
                ctr = await asyncio.to_thread(cm.find, s)
                status = ctr.status if ctr else "not_found"
                if status not in RUNNING:
                    rt = await repo.get_runtime(sid) or {}
                    if rt.get("desired_state") == "stopped":
                        self._set_op(sid, action, "cancelled", "Stopped before it became healthy.")
                        return None
                    code = (ctr.attrs.get("State") or {}).get("ExitCode") if ctr else None
                    err = OperationFailed(f"{name} stopped unexpectedly (exit code {code}).", details=await self._tail(s))
                    await self._fail(s, action, err)
                    return err
                probe = await asyncio.to_thread(hm.check, s)
                if probe["ok"]:
                    self._health_ok_at[sid] = _now()
                    self._set_op(sid, action, "succeeded", "Service is healthy.")
                    await self._event(sid, "healthy", f"{name} is healthy (HTTP {probe['status_code']})")
                    self._invalidate()
                    return None
                await asyncio.sleep(2)
        except ApiError as exc:
            await self._fail(s, action, exc)
            return exc
        err = OperationFailed(
            f"{name} did not become healthy within {limit}s. It may still be installing dependencies; check the logs."
        )
        await self._fail(s, action, err)
        return err

    async def _start_task(self, s, action: str = "start"):
        """Create/start the container, then wait for health. Returns None on success or the error."""
        sid, name = s["service_id"], s["service_name"]
        try:
            async with self._lock(sid):
                self._set_op(sid, action, "running", "Preparing container…")
                spec = await asyncio.to_thread(cm.build_spec, s)
                await asyncio.to_thread(cm.ensure_image, spec, lambda m: self._set_op(sid, action, "running", m))
                self._set_op(sid, action, "running", "Creating container…")
                ctr = await asyncio.to_thread(cm.ensure_container, s, spec)
                self._set_op(sid, action, "running", "Starting container…")
                await asyncio.to_thread(cm.start, ctr)
                now = _now()
                self._started_at[sid] = now
                await repo.set_runtime(
                    sid, desired_state="running", last_started_at=now, last_error=None, container_id=ctr.id,
                    container_status="running", health_status="starting", config_hash=spec["sig"],
                )
                await self._event(sid, "started" if action == "start" else "restarted",
                                  f"Container {s['container_name']} started")
                audit(action, sid)
                self._invalidate()
                await self._confirm_running(s)
            # lock released: Stop stays possible while the application is still booting
            self._set_op(sid, action, "running", "Waiting for the application to respond…")
            return await self._wait_healthy(s, action)
        except PortConflict as exc:
            err = exc if exc.message.startswith("Unable to start") else PortConflict(
                f"Unable to start {name}.\n\nReason:\n{exc.message}", details=exc.details
            )
            await self._fail(s, action, err)
            return err
        except ApiError as exc:
            await self._fail(s, action, exc)
            return exc
        except Exception:  # noqa: BLE001
            log.exception("Unexpected error while starting %s", sid)
            err = OperationFailed("Unexpected error while starting the service. See the DJ Services log for details.")
            await self._fail(s, action, err)
            return err

    async def _launch(self, s, action: str, wait: bool = True) -> dict:
        sid, name = s["service_id"], s["service_name"]
        op = self._ops.get(sid)
        if op and op["state"] == "running" and op["action"] in ("start", "restart"):
            return {"service": await self.get_view(sid, force=True),
                    "message": f"{name} is already starting.", "in_progress": True}

        task = asyncio.create_task(self._start_task(s, action))
        self._tasks[sid] = task
        if wait:
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=settings.START_WAIT_SECONDS)
            except asyncio.TimeoutError:
                pass
        if task.done():
            err = task.result()
            if err is not None:
                raise err
        self._invalidate()
        view = await self.get_view(sid, force=True)
        in_progress = not task.done()
        if in_progress:
            message = f"{name} is starting. Pulling images or installing dependencies can take several minutes."
        elif view["state"] == "active":
            message = f"{name} started and is healthy."
        else:
            message = f"{name} started."
        return {"service": view, "message": message, "in_progress": in_progress}

    async def start(self, sid: str, *, wait: bool = True) -> dict:
        s = await self._service(sid)
        if not s["enabled"]:
            raise Conflict(f"'{s['service_name']}' is disabled. Enable it before starting.")
        await self._ensure_docker()
        ctr = await asyncio.to_thread(cm.find, s)
        if ctr is not None and ctr.status in RUNNING:
            await repo.set_runtime(sid, desired_state="running")
            self._invalidate()
            return {"service": await self.get_view(sid, force=True),
                    "message": f"{s['service_name']} is already running.", "in_progress": False}
        await asyncio.to_thread(pm.ensure_free, s)
        return await self._launch(s, "start", wait)

    # ─── stop / restart / remove ──────────────────────────────────────────────

    async def _stop_locked(self, s) -> bool:
        sid = s["service_id"]
        ctr = await asyncio.to_thread(cm.find, s)
        was_running = ctr is not None and ctr.status in RUNNING
        if was_running:
            await asyncio.to_thread(cm.stop, ctr)
        self._started_at.pop(sid, None)
        op = self._ops.get(sid)
        if op and op["state"] == "running":
            self._set_op(sid, op["action"], "cancelled", "Stopped by user.")
        fields = {
            "desired_state": "stopped", "health_status": "stopped", "last_error": None,
            "container_status": "exited" if ctr is not None else "not_found",
        }
        if was_running:
            fields["last_stopped_at"] = _now()
        await repo.set_runtime(sid, **fields)
        await self._event(sid, "stopped" if was_running else "stop_noop",
                          "Stopped by user" if was_running else "Stop requested; container was not running")
        audit("stop", sid, outcome="ok" if was_running else "noop")
        self._invalidate()
        return was_running

    async def stop(self, sid: str) -> dict:
        s = await self._service(sid)
        await self._ensure_docker()
        async with self._lock(sid):
            was_running = await self._stop_locked(s)
        return {
            "service": await self.get_view(sid, force=True),
            "message": f"{s['service_name']} stopped." if was_running else f"{s['service_name']} was not running.",
            "in_progress": False,
        }

    async def restart(self, sid: str) -> dict:
        s = await self._service(sid)
        if not s["enabled"]:
            raise Conflict(f"'{s['service_name']}' is disabled. Enable it before starting.")
        await self._ensure_docker()
        async with self._lock(sid):
            await self._stop_locked(s)
        await asyncio.to_thread(pm.ensure_free, s)
        return await self._launch(s, "restart", True)

    async def remove_container(self, sid: str, *, volumes: bool = False) -> dict:
        s = await self._service(sid)
        await self._ensure_docker()
        async with self._lock(sid):
            ctr = await asyncio.to_thread(cm.find, s)
            if ctr is not None:
                await asyncio.to_thread(cm.remove, ctr)
            if volumes:
                await asyncio.to_thread(cm.remove_volumes, s)
            await repo.set_runtime(
                sid, desired_state="stopped", container_id=None, container_status="not_found",
                health_status="stopped", last_stopped_at=_now(),
            )
            await self._event(sid, "removed", "Container removed" + (" (with volumes)" if volumes else ""))
            audit("remove", sid, volumes=volumes)
            self._invalidate()
        return {"service_id": sid, "removed": ctr is not None, "message": f"Container for {s['service_name']} removed."}

    # ─── Start All / Stop All (background jobs) ───────────────────────────────

    def _new_job(self, action: str, services: list) -> dict:
        job = {
            "job_id": uuid.uuid4().hex[:12], "action": action, "state": "running", "message": "",
            "started_at": _now().isoformat(), "finished_at": None,
            "steps": [
                {"service_id": s["service_id"], "name": s["service_name"], "state": "pending", "message": ""}
                for s in services
            ],
        }
        self._jobs[job["job_id"]] = job
        while len(self._jobs) > 20:
            self._jobs.popitem(last=False)
        return job

    def get_job(self, job_id: str) -> dict:
        job = self._jobs.get(job_id)
        if not job:
            raise NotFound("Job not found.")
        return job

    def invalidate(self) -> None:
        self._invalidate()

    def forget(self, sid: str) -> None:
        """Drop in-memory state of a deleted service."""
        for store in (self._ops, self._tasks, self._locks, self._health_ok_at, self._started_at):
            store.pop(sid, None)
        self._invalidate()

    async def container_exists(self, service: dict) -> bool:
        await self._ensure_docker()
        return await asyncio.to_thread(cm.find, service) is not None

    async def _run_start_all(self, job: dict, services: list) -> None:
        steps = {st["service_id"]: st for st in job["steps"]}
        selected = {s["service_id"] for s in services}
        failed, ok = set(), set()

        async def one(s):
            sid, st = s["service_id"], steps[s["service_id"]]
            blocked = [d for d in s["depends_on"] if d in failed]
            for d in s["depends_on"]:
                if d not in selected and d not in blocked:
                    try:
                        if (await self.get_view(d))["state"] != "active":
                            blocked.append(d)
                    except ApiError:
                        blocked.append(d)
            if blocked:
                st.update(state="skipped", message="Blocked: dependency not healthy (" + ", ".join(blocked) + ").")
                failed.add(sid)
                return
            st.update(state="running", message="Starting…")
            err = None
            try:
                ctr = await asyncio.to_thread(cm.find, s)
                if not (ctr is not None and ctr.status in RUNNING):
                    await asyncio.to_thread(pm.ensure_free, s)
                err = await self._start_task(s, "start")
            except ApiError as exc:
                err = exc
            except Exception:  # noqa: BLE001
                log.exception("Start All failed for %s", sid)
                err = OperationFailed("Unexpected error. See the DJ Services log.")
            if err is not None:
                st.update(state="failed", message=err.message.replace("\n\n", " "))
                failed.add(sid)
            else:
                st.update(state="ok", message="Healthy.")
                ok.add(sid)

        try:
            for level in start_levels(services):
                await asyncio.gather(*[one(s) for s in level])
        except Exception:  # noqa: BLE001
            log.exception("Start job crashed")
            failed.add("job")
        finally:
            job["state"] = "failed" if failed else "done"
            job["finished_at"] = _now().isoformat()
            job["message"] = f"{len(ok)} started, {len(failed - {'job'})} failed or skipped."
            audit(job["action"], None, outcome=job["state"], started=len(ok), failed=len(failed))
            self._invalidate()

    async def start_all(self) -> dict:
        await self._ensure_docker()
        projects = {p["project_id"]: p for p in await repo.list_projects()}
        services = [
            s for s in await repo.list_services()
            if s["enabled"] and (projects.get(s["project_id"]) or {}).get("enabled", True)
        ]
        job = self._new_job("start_all", services)
        asyncio.create_task(self._run_start_all(job, services))
        return job

    async def _run_stop_all(self, job: dict, services: list) -> None:
        steps = {st["service_id"]: st for st in job["steps"]}
        failed = 0

        async def one(s):
            nonlocal failed
            sid, st = s["service_id"], steps[s["service_id"]]
            st.update(state="running", message="Stopping…")
            try:
                async with self._lock(sid):
                    was = await self._stop_locked(s)
                st.update(state="ok", message="Stopped." if was else "Already stopped.")
            except ApiError as exc:
                failed += 1
                st.update(state="failed", message=exc.message)
            except Exception:  # noqa: BLE001
                failed += 1
                log.exception("Stop All failed for %s", sid)
                st.update(state="failed", message="Unexpected error. See the DJ Services log.")

        try:
            for level in reversed(start_levels(services)):  # dependents first
                await asyncio.gather(*[one(s) for s in level])
        finally:
            job["state"] = "failed" if failed else "done"
            job["finished_at"] = _now().isoformat()
            job["message"] = f"{len(services) - failed} stopped, {failed} failed."
            audit("stop_all", None, outcome=job["state"])
            self._invalidate()

    async def stop_all(self) -> dict:
        await self._ensure_docker()
        services = await repo.list_services()
        job = self._new_job("stop_all", services)
        asyncio.create_task(self._run_stop_all(job, services))
        return job

    # ─── status / health / details / logs ─────────────────────────────────────

    async def status(self, sid: str) -> dict:
        v = await self.get_view(sid, force=True)
        keys = ("service_id", "state", "state_label", "active", "docker_status", "container_id", "health",
                "last_started_at", "last_stopped_at", "last_error", "pending_recreate", "operation")
        return {k: v[k] for k in keys}

    async def health(self, sid: str) -> dict:
        s = await self._service(sid)
        v = await self.get_view(sid, force=True)
        probe = await asyncio.to_thread(hm.check, s) if v["docker_status"] in RUNNING else None
        return {
            "service_id": sid, "health": v["health"], "docker_status": v["docker_status"],
            "probe": probe, "last_health_check_at": v["last_health_check_at"],
        }

    async def details(self, sid: str) -> dict:
        s = await self._service(sid)
        view = await self.get_view(sid, force=True)
        container = None
        if view["docker_status"] not in (None, "not_found"):
            ctr = await asyncio.to_thread(cm.find, s)
            if ctr is not None:
                container = await asyncio.to_thread(cm.inspect_details, ctr)
        return {
            "service": view,
            "config": {**s, "env": cm.mask_env(s["env"])},
            "project": await repo.get_project(s["project_id"]),
            "paths": cm.describe_path(s),
            "container": container,
            "runtime": await repo.get_runtime(sid),
            "events": await repo.list_events(sid, 30),
            "pending_recreate": bool(container) and container.get("sig") not in (None, cm.signature(s)),
        }

    async def logs(self, sid: str, tail: int = 200) -> dict:
        s = await self._service(sid)
        await self._ensure_docker()
        ctr = await asyncio.to_thread(cm.find, s)
        if ctr is None:
            return {"lines": [], "container_status": "not_found", "message": "The container has not been created yet."}
        lines = await asyncio.to_thread(cm.logs, ctr, tail)
        return {"lines": lines, "container_status": ctr.status, "tail": len(lines)}

    # ─── reconcile + monitor ──────────────────────────────────────────────────

    async def reconcile(self) -> dict:
        """On startup: sync runtime state, then restart services that were running (desired_state=running)
        and have auto_start enabled. Services the user stopped are never started."""
        summary = {"docker": False, "job_id": None, "candidates": []}
        st = await asyncio.to_thread(docker_mgr.status)
        if not st["connected"]:
            log.warning("Reconcile skipped: %s", st["error"])
            return summary
        summary["docker"] = True
        data = await self.list_views(force=True)
        by_view = {v["service_id"]: v for v in data["services"]}
        runtimes = await repo.list_runtimes()
        projects = {p["project_id"]: p for p in await repo.list_projects()}
        candidates = [
            s for s in await repo.list_services()
            if s["enabled"] and s["auto_start"]
            and (projects.get(s["project_id"]) or {}).get("enabled", True)
            and (runtimes.get(s["service_id"]) or {}).get("desired_state") == "running"
            and (by_view.get(s["service_id"]) or {}).get("docker_status") not in RUNNING
        ]
        summary["candidates"] = [s["service_id"] for s in candidates]
        if candidates:
            job = self._new_job("reconcile", candidates)
            summary["job_id"] = job["job_id"]
            asyncio.create_task(self._run_start_all(job, candidates))
            log.info("Reconcile: restarting %d service(s): %s", len(candidates), ", ".join(summary["candidates"]))
        return summary

    async def monitor_loop(self) -> None:
        while True:
            try:
                await self.list_views(force=True)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                log.debug("Monitor cycle failed: %s", type(exc).__name__)
            await asyncio.sleep(max(2, settings.MONITOR_INTERVAL))


manager = ServiceManager()