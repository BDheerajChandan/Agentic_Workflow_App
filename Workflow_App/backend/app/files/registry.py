# app/files/registry.py
# Single extensible format registry + limits + signature checks.

import os
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = Path(os.getenv("FILE_STORAGE_DIR", str(BASE_DIR / "file_store")))
MAX_FILE_BYTES = int(float(os.getenv("FILE_MAX_MB", "25")) * 1024 * 1024)
MAX_FILES_PER_UPLOAD = int(os.getenv("FILE_MAX_PER_UPLOAD", "10"))
SOFFICE_TIMEOUT = int(os.getenv("FILE_CONVERT_TIMEOUT", "60"))

FILE_ID_RE = re.compile(r"^[0-9a-f]{32}$")


class FileError(ValueError):
    """User-facing file error (safe to return to clients)."""


# extension -> reader kind
FORMATS = {
    ".pdf": "pdf",
    ".doc": "doc", ".docx": "docx",
    ".xls": "xls", ".xlsx": "xlsx",
    ".ppt": "ppt", ".pptx": "pptx",
    ".csv": "csv", ".tsv": "tsv",
    ".rtf": "rtf",
    ".json": "json", ".jsonl": "jsonl",
    ".html": "html", ".htm": "html", ".xml": "xml",
}
for _ext in (
    ".txt", ".md", ".py", ".js", ".ts", ".java", ".c", ".cpp", ".sql",
    ".yaml", ".yml", ".ini", ".cfg", ".toml", ".log",
):
    FORMATS[_ext] = "text"

_ZIP = b"PK"
_OLE = b"\xd0\xcf\x11\xe0"


def accepted_extensions():
    return sorted(FORMATS)


def detect_kind(file_name: str, head: bytes) -> str:
    ext = Path(file_name).suffix.lower()
    kind = FORMATS.get(ext)
    if not kind:
        raise FileError(f"Unsupported file type '{ext or file_name}'.")

    ok = True
    if kind == "pdf":
        ok = b"%PDF" in head[:1024]
    elif kind in ("docx", "pptx", "xlsx"):
        ok = head.startswith(_ZIP)
    elif kind in ("doc", "ppt", "xls"):
        ok = head.startswith(_OLE)
    elif kind == "rtf":
        ok = head.lstrip().startswith(b"{\\rtf")
    else:
        ok = b"\x00" not in head and not head.startswith((_ZIP, _OLE, b"%PDF"))
        if head.startswith((b"\xff\xfe", b"\xfe\xff")):
            ok = True
    if not ok:
        raise FileError(f"File content does not match its '{ext}' extension.")
    return kind