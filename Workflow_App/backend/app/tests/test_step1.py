# tests/test_step1.py

import json

from app import app_info
from app.database.workflow_repository import original_name
from app.files.text import is_file_result, plain_text
from app.flow_copy import remap_variables
from app.routers.bot_router import _to_text

TELUGU = "కృత్రిమ మేధస్సు"
RESULT = {
    "content": TELUGU,
    "metadata": {"file_name": "Telugu.pdf"},
    "results": {},
    "language": {"language_code": "te"},
}

def test_chatbot_reply_is_full_readable_unicode_json():
    out = _to_text(RESULT)
    assert TELUGU in out
    assert "\\u" not in out
    assert json.loads(out) == RESULT
    assert out.startswith('{"content":')

def test_plain_text_and_detection():
    assert is_file_result(RESULT)
    assert plain_text(RESULT) == TELUGU
    assert json.loads(plain_text({"k": TELUGU}))["k"] == TELUGU
    assert plain_text("{not json") == "{not json"


def test_structured_non_file_dict_untouched():
    assert json.loads(_to_text({"x": 1})) == {"x": 1}
    assert _to_text({"answer": " hi "}) == "hi"


def test_copy_name_base():
    assert original_name("COPY_2_OF COPY_1_OF Support") == "Support"
    assert original_name("Support") == "Support"


def test_remap_variables():
    data = {"variable": {"output_mapping": {"bindings": {"5": {}}, "order": ["5"]},
                         "input_mapping": {"bindings": {"x": {"variable_id": 5}}}},
            "display": {"variable_ids": [5]}}
    out = remap_variables(data, {5: 9})
    assert "9" in out["variable"]["output_mapping"]["bindings"]
    assert out["variable"]["input_mapping"]["bindings"]["x"]["variable_id"] == 9
    assert out["display"]["variable_ids"] == [9]
    assert data["display"]["variable_ids"] == [5]


def test_app_info_only_public_keys(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "1.2.3")
    monkeypatch.setenv("APP_RELEASE_DATE", "2026-10-24")
    monkeypatch.delenv("APP_RELEASE_TIME", raising=False)
    info = app_info.read_app_info()
    assert info == {"version": "1.2.3", "release_date": "2026-10-24", "release_time": None}