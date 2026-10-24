# app/routers/python_files_router.py

import ast
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/python-files", tags=["python-files"])

MAX_BYTES = 200 * 1024


class ValidateRequest(BaseModel):
    file_name: str
    content: str


@router.post("/validate")
async def validate_python_file(payload: ValidateRequest):
    name = os.path.basename((payload.file_name or "").replace("\\", "/")).strip()
    if len(name) <= 3 or not name.lower().endswith(".py"):
        raise HTTPException(status_code=400, detail="Only .py files are supported.")

    content = payload.content or ""
    if "\x00" in content:
        raise HTTPException(status_code=400, detail="File is not a valid text file.")
    if len(content.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_BYTES // 1024} KB.")
    if not content.strip():
        raise HTTPException(status_code=400, detail="File is empty.")

    try:
        tree = ast.parse(content, filename=name)
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"Syntax error at line {exc.lineno}: {exc.msg}")

    if not any(isinstance(n, ast.FunctionDef) and n.name == "main" for n in tree.body):
        raise HTTPException(status_code=400, detail="No main() function defined in the file.")

    return {
        "file_name": name,
        "code": content,
        "size": len(content.encode("utf-8")),
        "lines": content.count("\n") + 1,
    }