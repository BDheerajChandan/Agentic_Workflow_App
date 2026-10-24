# app/routers/files_router.py

import asyncio
import logging
import mimetypes
import os
import re

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.database import file_repository
from app.files import storage
from app.files.registry import (
    FILE_ID_RE, MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, FileError,
    accepted_extensions, detect_kind,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/files", tags=["files"])
CHUNK = 1024 * 1024


def _safe_name(name: str) -> str:
    base = os.path.basename((name or "").replace("\\", "/")).strip()
    base = re.sub(r"[^\w.\- ]+", "_", base).strip(". ")
    return base[:150] or "file"


@router.get("/formats")
async def formats():
    return {"extensions": accepted_extensions(), "max_bytes": MAX_FILE_BYTES, "max_files": MAX_FILES_PER_UPLOAD}


@router.post("/upload")
async def upload(
    files: list[UploadFile] = File(...),
    flow_id: int | None = Form(None),
    bot_id: str | None = Form(None),
    session_id: str | None = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES_PER_UPLOAD} files per upload.")

    saved, errors = [], []
    for up in files:
        name = _safe_name(up.filename)
        key = storage.new_key()
        try:
            first = await up.read(CHUNK)
            if not first:
                raise FileError("File is empty.")
            kind = detect_kind(name, first[:8192])
            size = 0
            with open(storage.path_for(key), "wb") as fh:
                chunk = first
                while chunk:
                    size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise FileError(f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
                    await asyncio.to_thread(fh.write, chunk)
                    chunk = await up.read(CHUNK)
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            saved.append(await file_repository.create_file(
                name, key, kind, mime, size, flow_id, bot_id, session_id
            ))
        except FileError as exc:
            storage.delete_blob(key)
            errors.append({"file_name": name, "detail": str(exc)})
        except Exception:  # noqa: BLE001
            log.exception("Upload failed")
            storage.delete_blob(key)
            errors.append({"file_name": name, "detail": "Upload failed."})
        finally:
            await up.close()

    if not saved:
        raise HTTPException(status_code=400, detail="; ".join(f"{e['file_name']}: {e['detail']}" for e in errors))
    return {"files": saved, "errors": errors}


@router.get("/{file_id}")
async def get_file(file_id: str):
    record = await file_repository.get_file(file_id) if FILE_ID_RE.match(file_id) else None
    if not record:
        raise HTTPException(status_code=404, detail="File not found.")
    return record


@router.delete("/{file_id}")
async def delete_file(file_id: str):
    key = await file_repository.delete_file(file_id) if FILE_ID_RE.match(file_id) else None
    if not key:
        raise HTTPException(status_code=404, detail="File not found.")
    storage.delete_blob(key)
    return {"message": "File deleted."}