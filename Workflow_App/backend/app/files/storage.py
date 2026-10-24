# app/files/storage.py

import uuid

from app.files.registry import FILE_ID_RE, STORAGE_DIR, FileError


def new_key() -> str:
    return uuid.uuid4().hex


def path_for(key: str):
    if not FILE_ID_RE.match(str(key or "")):
        raise FileError("Invalid file reference.")
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return STORAGE_DIR / key


def delete_blob(key: str) -> None:
    try:
        path_for(key).unlink(missing_ok=True)
    except (OSError, FileError):
        pass