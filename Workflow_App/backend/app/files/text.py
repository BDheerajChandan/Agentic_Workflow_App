# app/files/text.py
# Distinguishes File Reader results from plain text so display/LLM paths get readable Unicode.

import json


def is_file_result(value) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("content"), str)
        and isinstance(value.get("metadata"), dict)
        and "language" in value
    )


def plain_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if is_file_result(value) and value["content"].strip():
        return value["content"]
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return str(value)