# app/utils/paths.py
# Path resolution for managed projects. Every path must stay inside PROJECTS_ROOT.

from pathlib import Path

from app.config.settings import settings


def _norm(value) -> str:
    return str(value).replace("\\", "/").rstrip("/")


def resolve_local_path(value: str) -> Path:
    """Resolve a config/API path to a real path this process can read. Raises ValueError."""
    raw = str(value or "").strip()
    if not raw or "\x00" in raw:
        raise ValueError("path is empty or invalid.")

    host_root, norm = _norm(settings.HOST_PROJECTS_ROOT), _norm(raw)
    if host_root and (norm.lower() == host_root.lower() or norm.lower().startswith(host_root.lower() + "/")):
        # An absolute host (Windows) path given while the backend runs in a container.
        path = settings.PROJECTS_ROOT / norm[len(host_root):].lstrip("/")
    else:
        path = Path(raw)
        if not path.is_absolute():
            path = settings.BASE_DIR / path

    path = path.resolve()
    root = settings.PROJECTS_ROOT.resolve()
    if path != root and root not in path.parents:
        raise ValueError("path must stay inside the allowed projects root.")
    return path


def to_host_path(path: Path) -> str:
    """The same folder as the Docker daemon sees it (forward slashes, e.g. C:/Users/.../app)."""
    rel = path.resolve().relative_to(settings.PROJECTS_ROOT.resolve()).as_posix()
    base = _norm(settings.HOST_PROJECTS_ROOT)
    return base if rel in ("", ".") else f"{base}/{rel}"


def is_within(child: Path, parent: Path) -> bool:
    child, parent = child.resolve(), parent.resolve()
    return child == parent or parent in child.parents