# app/files/refs.py
# Pure helpers: turn any runtime value into a list of file ids.

import json

from app.files.registry import FILE_ID_RE


def normalize_refs(value) -> list[str]:
    ids: list[str] = []

    def add(fid):
        fid = str(fid or "").strip()
        if FILE_ID_RE.match(fid) and fid not in ids:
            ids.append(fid)

    def walk(v, depth=0):
        if v is None or depth > 6:
            return
        if isinstance(v, str):
            s = v.strip()
            if s[:1] in ("[", "{"):
                try:
                    walk(json.loads(s), depth + 1)
                    return
                except ValueError:
                    return
            add(s)
        elif isinstance(v, dict):
            if "file_id" in v:
                add(v["file_id"])
            elif isinstance(v.get("files"), list):
                walk(v["files"], depth + 1)
            elif isinstance(v.get("metadata"), dict):
                meta = v["metadata"]
                if "file_id" in meta:
                    add(meta["file_id"])
                elif isinstance(meta.get("files"), list):
                    walk(meta["files"], depth + 1)
        elif isinstance(v, (list, tuple)):
            for item in v:
                walk(item, depth + 1)

    walk(value)
    return ids