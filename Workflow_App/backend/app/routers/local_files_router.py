"""
app/routers/local_files_router.py
Endpoints used by the Retriever "Local" source UI to browse and validate
server-side paths (files, multiple files, folders).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path

from app.rag.retriever import discover_local_files, SUPPORTED_EXTENSIONS

router = APIRouter(prefix="/local-files", tags=["local-files"])


class BrowseRequest(BaseModel):
    path: str


class BrowseResponse(BaseModel):
    path: str
    type: str          # "file" | "directory" | "not_found" | "multi"
    files: list[str]
    supported: list[str]
    extensions: list[str]


@router.post("/browse")
async def browse_path(req: BrowseRequest) -> BrowseResponse:
    """
    Given a path (file, directory, or comma-separated list), return what was found
    and which files are supported.
    """
    raw = req.path.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="path must not be empty")

    # Comma-separated list?
    parts = [s.strip() for s in raw.split(",") if s.strip()]

    if len(parts) > 1:
        all_files    = []
        supported    = []
        for part in parts:
            p = Path(part)
            if p.is_file():
                all_files.append(str(p))
                if p.suffix.lower() in SUPPORTED_EXTENSIONS:
                    supported.append(str(p))
            elif p.is_dir():
                found = discover_local_files(str(p))
                all_files.extend(found)
                supported.extend(found)
        return BrowseResponse(
            path=raw, type="multi",
            files=all_files, supported=supported,
            extensions=sorted(SUPPORTED_EXTENSIONS),
        )

    p = Path(raw)
    if not p.exists():
        return BrowseResponse(
            path=raw, type="not_found",
            files=[], supported=[],
            extensions=sorted(SUPPORTED_EXTENSIONS),
        )

    if p.is_file():
        sup = [str(p)] if p.suffix.lower() in SUPPORTED_EXTENSIONS else []
        return BrowseResponse(
            path=raw, type="file",
            files=[str(p)], supported=sup,
            extensions=sorted(SUPPORTED_EXTENSIONS),
        )

    if p.is_dir():
        found = discover_local_files(str(p))
        return BrowseResponse(
            path=raw, type="directory",
            files=found, supported=found,
            extensions=sorted(SUPPORTED_EXTENSIONS),
        )

    raise HTTPException(status_code=400, detail="Unable to determine path type.")