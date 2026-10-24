# app/nodes/file_reader.py

from app.files import service
from app.files.refs import normalize_refs
from app.files.registry import FileError


def file_reader_node(state, config):
    cfg = config or {}
    include_results = cfg.get("include_results", True) is not False

    ids = []
    for candidate in (state.get("file_input"), state.get("current_value"), state.get("files")):
        ids = normalize_refs(candidate)
        if ids:
            break
    if not ids:
        raise ValueError(
            "File Reader: no file received (upload a file, connect a node that outputs files, "
            "or map the Start node's Uploaded Files)."
        )

    try:
        items = [service.read_stored_file(fid, include_results) for fid in ids]
    except FileError as exc:
        raise ValueError(f"File Reader: {exc}")

    result = service.combine(items, include_results)
    return {
        "current_value": result,
        "data": {**state.get("data", {}), "file_reader": result},
    }