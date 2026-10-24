# app/files/service.py
# Resolve a stored file and extract it. Used by the File Reader node (worker thread).

import logging

from app import runtime
from app.database import file_repository
from app.files import readers, storage
from app.files.language import detect_language
from app.files.registry import MAX_FILE_BYTES, FileError

log = logging.getLogger(__name__)


def _status(file_id, status, error=None):
    try:
        runtime.run_async(file_repository.set_status(file_id, status, error))
    except Exception:  # noqa: BLE001
        log.warning("Could not update file status", exc_info=False)


def read_stored_file(file_id: str, include_results: bool = True) -> dict:
    record = runtime.run_async(file_repository.get_file_internal(file_id))
    if not record:
        raise FileError("File not found.")
    path = storage.path_for(record["storage_key"])
    if not path.exists():
        raise FileError("The stored file is no longer available.")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise FileError("File exceeds the configured processing size limit.")

    _status(file_id, "processing")
    try:
        data = readers.extract(path, record["file_type"])
    except FileError as exc:
        _status(file_id, "failed", str(exc))
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("Extraction failed")
        _status(file_id, "failed", "Extraction failed.")
        raise FileError(f"Could not read '{record['original_name']}': the file may be corrupted.") from exc
    _status(file_id, "processed")

    content = data["content"]
    try:
        language = detect_language(content)
    except Exception:  # noqa: BLE001
        language = {"language_name": "Unknown", "language_code": "und", "detection_status": "Failed"}

    metadata = {
        "file_id": record["file_id"],
        "file_name": record["original_name"],
        "file_type": record["file_type"],
        "mime_type": record["mime_type"],
        "file_size_bytes": record["size_bytes"],
        "character_count": len(content),
        "extraction_status": "success",
        **data["meta"],
    }
    return {
        "content": content,
        "metadata": metadata,
        "results": data["results"] if include_results else None,
        "language": language,
    }


def combine(items: list[dict], include_results: bool = True) -> dict:
    if len(items) == 1:
        return items[0]
    content = "\n\n".join(f"=== {i['metadata']['file_name']} ===\n{i['content']}" for i in items)
    return {
        "content": content,
        "metadata": {
            "file_count": len(items),
            "character_count": len(content),
            "extraction_status": "success",
            "files": [i["metadata"] for i in items],
        },
        "results": (
            {"files": [{"file_id": i["metadata"]["file_id"], "file_name": i["metadata"]["file_name"], **(i["results"] or {})} for i in items]}
            if include_results else None
        ),
        "language": detect_language(content),
    }