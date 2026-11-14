# app/aqi/exporter.py
# TXT / JSON / CSV / HTML export. Files are created exclusively (never overwritten).

import csv
import json
import os
import re
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DOWNLOAD_ROOT = Path(os.getenv("AQI_DOWNLOAD_ROOT", str(BASE_DIR / "download")))
FORMATS = ("txt", "json", "csv", "html")


def _part(value) -> str:
    s = re.sub(r"[^a-z0-9-]+", "-", str(value or "").strip().lower())
    return re.sub(r"-{2,}", "-", s).strip("-") or "unknown"


def resolve_dir(folder) -> Path:
    sub = str(folder or "").strip().replace("\\", "/").strip("/")
    if sub.lower() == "download":
        sub = ""
    elif sub.lower().startswith("download/"):
        sub = sub[len("download/"):]
    if "\x00" in sub or sub.startswith("/") or re.match(r"^[A-Za-z]:", sub) or ".." in sub.split("/"):
        raise ValueError("Output folder must be a relative folder inside download/.")
    root = DOWNLOAD_ROOT.resolve()
    target = (root / sub).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Output folder must stay inside download/.")
    target.mkdir(parents=True, exist_ok=True)
    return target


def _open_unique(folder: Path, base: str, ext: str, newline=None, encoding="utf-8"):
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    names = [f"{base}.{ext}", f"{base}_{stamp}.{ext}"] + [
        f"{base}_{stamp}_{n}.{ext}" for n in range(1, 100)
    ]
    for name in names:
        path = folder / name
        try:
            return open(path, "x", encoding=encoding, newline=newline), path
        except FileExistsError:
            continue
    raise OSError("Could not find a free filename.")


def _summary_lines(r: dict) -> list:
    rows = [
        ("URL", r.get("url")), ("HTTP Status", r.get("http_status")),
        ("Scraped At", r.get("scraped_at")), ("Title", r.get("title")),
        ("Last Updated", r.get("last_updated")), ("AQI", r.get("aqi")),
        ("AQI Standard", r.get("aqi_standard")), ("Category", r.get("category")),
    ]
    for key, val in (r.get("pollutants") or {}).items():
        if val:
            rows.append((key.upper(), f"{val['value']} {val.get('unit') or ''}".strip()))
    for key, val in (r.get("weather") or {}).items():
        if val is not None:
            rows.append((key, val))
    return [(k, v) for k, v in rows if v is not None]


def _txt(r: dict) -> str:
    head = "\n".join(f"{k}: {v}" for k, v in _summary_lines(r))
    return f"{head}\n\n{r.get('full_text') or ''}"


def _csv_rows(r: dict) -> list:
    rows = [("Summary", k, v) for k, v in _summary_lines(r)]
    for key, values in (r.get("aqi_matches") or {}).items():
        rows.extend(("AQI Match", key, v) for v in values)
    for table in r.get("tables") or []:
        for row in table["rows"]:
            rows.append(("Table", f"Table {table['table_number']}", " | ".join(row)))
    return rows


def _write(fmt: str, folder: Path, base: str, result: dict, html: str) -> Path:
    if fmt == "csv":
        fh, path = _open_unique(folder, base, "csv", newline="", encoding="utf-8-sig")
    else:
        fh, path = _open_unique(folder, base, fmt)
    try:
        with fh:
            if fmt == "txt":
                fh.write(_txt(result))
            elif fmt == "json":
                fh.write(json.dumps(
                    {k: v for k, v in result.items() if k not in ("html", "download")},
                    indent=4, ensure_ascii=False, default=str,
                ))
            elif fmt == "csv":
                w = csv.writer(fh)
                w.writerow(["Type", "Section", "Value"])
                w.writerows(_csv_rows(result))
            else:
                if not html:
                    raise ValueError("No HTML was captured.")
                fh.write(html)
    except Exception:
        try:
            os.remove(path)
        except OSError:
            pass
        raise
    return path


def export(result: dict, html: str, formats: list, folder, country: str, state: str, city: str) -> dict:
    fmts = list(dict.fromkeys(f.lower() for f in formats))
    bad = [f for f in fmts if f not in FORMATS]
    if bad or not fmts:
        raise ValueError("Select at least one valid format: " + ", ".join(FORMATS) + ".")

    target = resolve_dir(folder)
    base = f"{_part(country)}_{_part(state)}_{_part(city)}_AQI"
    files, errors = [], []
    for fmt in fmts:
        try:
            path = _write(fmt, target, base, result, html)
            files.append({"format": fmt, "filename": path.name, "path": str(path)})
        except Exception as exc:  # noqa: BLE001
            errors.append({"format": fmt, "error": str(exc)})

    status = "failed" if not files else ("partial" if errors else "success")
    return {"enabled": True, "status": status, "directory": str(target), "files": files, "errors": errors}