# app/documentation.py
# Validation / normalisation for workflow documentation (pure, no database access).

import uuid

MAX_TEXT = 20000
MAX_CASES = 200
STATUSES = ("not_run", "passed", "failed")

CONTENT_FIELDS = {
    "flow_name": 200,
    "description": MAX_TEXT,
    "objective": MAX_TEXT,
    "application": MAX_TEXT,
    "use_cases": MAX_TEXT,
    "expected_output": MAX_TEXT,
    "input_requirements": MAX_TEXT,
    "dependencies": MAX_TEXT,
    "workflow_steps": MAX_TEXT,
    "error_handling": MAX_TEXT,
    "notes": MAX_TEXT,
}

CASE_FIELDS = {
    "name": 200,
    "description": 5000,
    "input_data": MAX_TEXT,
    "expected_output": MAX_TEXT,
    "actual_output": MAX_TEXT,
    "notes": 5000,
}


class DocumentationError(Exception):
    status_code = 422

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.message = message
        if status_code:
            self.status_code = status_code


class DocumentationConflict(DocumentationError):
    status_code = 409


def empty_content() -> dict:
    return {k: "" for k in CONTENT_FIELDS}


def _text(value, label, limit):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise DocumentationError(f"{label} must be text.")
    if len(value) > limit:
        raise DocumentationError(f"{label} exceeds {limit} characters.")
    return value.replace("\x00", "")


def clean_content(raw) -> dict:
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise DocumentationError("Documentation content must be an object.")
    return {
        key: _text(raw.get(key), key.replace("_", " ").title(), limit)
        for key, limit in CONTENT_FIELDS.items()
    }


def clean_test_cases(raw) -> list:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise DocumentationError("Test cases must be a list.")
    if len(raw) > MAX_CASES:
        raise DocumentationError(f"At most {MAX_CASES} test cases are supported.")
    out, seen = [], set()
    for i, c in enumerate(raw, 1):
        label = f"Test case {i}"
        if not isinstance(c, dict):
            raise DocumentationError(f"{label} is invalid.")
        cid = str(c.get("id") or uuid.uuid4().hex).strip()[:64]
        if cid in seen:
            raise DocumentationError(f"{label}: duplicate id '{cid}'.")
        seen.add(cid)
        status = str(c.get("status") or "not_run").strip().lower()
        if status not in STATUSES:
            raise DocumentationError(f"{label}: status must be one of {', '.join(STATUSES)}.")
        item = {"id": cid, "status": status}
        for key, limit in CASE_FIELDS.items():
            item[key] = _text(c.get(key), f"{label} {key.replace('_', ' ')}", limit)
        if not item["name"].strip():
            raise DocumentationError(f"{label}: name is required.")
        out.append(item)
    return out