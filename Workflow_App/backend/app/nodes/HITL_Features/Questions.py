# app/nodes/HITL_Features/Questions.py

import json

from app.nodes.HITL_Features import HitlError

FEATURE = "questions"
TYPES = {"radio": "Radio", "checkbox": "Checkbox", "text": "Text"}
SOURCES = ("static", "dynamic")
MAX_QUESTIONS = 200
_TRUE = {"true", "yes", "required", "1"}


# ─── Definition validation ────────────────────────────────────────────────────

def _clean_list(value, label, field):
    if value is None:
        return []
    if isinstance(value, (str, int, float)) and not isinstance(value, bool):
        value = [value]
    if not isinstance(value, (list, tuple)):
        raise HitlError(f"{label}: '{field}' must be a list.")
    out = []
    for item in value:
        s = str(item).strip()
        if s and s not in out:
            out.append(s)
    return out


def normalize_question(raw, index=1):
    label = f"Question {index}"
    if not isinstance(raw, dict):
        raise HitlError(f"{label}: must be an object.")

    text = str(raw.get("question") or "").strip()
    if not text:
        raise HitlError(f"{label}: question text is required.")

    qtype = TYPES.get(str(raw.get("type") or "").strip().lower())
    if not qtype:
        raise HitlError(f"{label}: type must be Radio, Checkbox or Text.")

    req = raw.get("required", False)
    required = req if isinstance(req, bool) else str(req).strip().lower() in _TRUE

    options, solution = [], []
    if qtype != "Text":
        options = _clean_list(raw.get("options"), label, "options")
        solution = _clean_list(raw.get("solution", raw.get("solutions")), label, "solution")
        if len(options) < 2:
            raise HitlError(f"{label}: {qtype} questions need at least two distinct options.")
        bad = [s for s in solution if s not in options]
        if bad:
            raise HitlError(f"{label}: expected solution(s) not among the options: {', '.join(bad)}.")
        if qtype == "Radio" and len(solution) != 1:
            raise HitlError(f"{label}: Radio questions need exactly one expected solution.")
        if qtype == "Checkbox" and not solution:
            raise HitlError(f"{label}: Checkbox questions need one or more expected solutions.")

    return {
        "question": text,
        "type": qtype,
        "required": required,
        "options": options,
        "solution": solution,
    }


def validate_questions(raw_list):
    if not isinstance(raw_list, list) or not raw_list:
        raise HitlError("At least one question is required.")
    if len(raw_list) > MAX_QUESTIONS:
        raise HitlError(f"A maximum of {MAX_QUESTIONS} questions is supported.")
    out, errors = [], []
    for i, raw in enumerate(raw_list, 1):
        try:
            out.append(normalize_question(raw, i))
        except HitlError as exc:
            errors.append(str(exc))
    if errors:
        more = f" (+{len(errors) - 10} more)" if len(errors) > 10 else ""
        raise HitlError(" | ".join(errors[:10]) + more)
    return out


def parse_json(text):
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise HitlError(f"Malformed JSON: {exc}")
    if isinstance(data, dict):
        data = data.get("questions")
    if not isinstance(data, list):
        raise HitlError("JSON must be a list of questions or an object with a 'questions' list.")
    return validate_questions(data)


# ─── Node configuration ───────────────────────────────────────────────────────

def normalize_config(cfg):
    cfg = cfg if isinstance(cfg, dict) else {}
    source = str(cfg.get("source") or "static").strip().lower()
    return {
        "source": source if source in SOURCES else "static",
        "questions": cfg.get("questions") or [],
        "file_name": str(cfg.get("file_name") or ""),
        "file_questions": cfg.get("file_questions") or [],
    }


def active_questions(cfg):
    dynamic = cfg["source"] == "dynamic"
    raw = cfg["file_questions"] if dynamic else cfg["questions"]
    if not raw:
        raise HitlError(
            "Questions: upload a valid JSON file (Dynamic mode)."
            if dynamic else
            "Questions: add at least one question (Static mode)."
        )
    return validate_questions(raw)


# ─── Runtime ──────────────────────────────────────────────────────────────────

def build_request(input_value, cfg):
    questions = active_questions(cfg)
    return {
        "input": input_value,
        "questions": [
            {
                "id": i,
                "question": q["question"],
                "type": q["type"],
                "required": q["required"],
                "options": q["options"],
            }
            for i, q in enumerate(questions)
        ],
    }


def _clean_answer(q, answer, index):
    if q["type"] == "Checkbox":
        if answer is None:
            answer = []
        if not isinstance(answer, list):
            raise HitlError(f"Question {index}: answer must be a list.")
        vals = [str(x) for x in answer]
        bad = [v for v in vals if v not in q["options"]]
        if bad:
            raise HitlError(f"Question {index}: invalid option(s): {', '.join(bad)}.")
        return [o for o in q["options"] if o in vals]
    if q["type"] == "Radio":
        if answer is None or answer == "":
            return None
        answer = str(answer)
        if answer not in q["options"]:
            raise HitlError(f"Question {index}: invalid option '{answer}'.")
        return answer
    return str(answer).strip() if answer is not None else ""


def _answered(answer):
    return answer not in (None, "", [])


def validate_response(cfg, response):
    questions = active_questions(cfg)
    answers = response.get("answers") if isinstance(response, dict) else None
    if not isinstance(answers, list) or len(answers) != len(questions):
        raise HitlError("Questions: answers must match the configured questions.")

    out, missing = [], []
    for i, (q, a) in enumerate(zip(questions, answers), 1):
        cleaned = _clean_answer(q, a, i)
        if q["required"] and not _answered(cleaned):
            missing.append(str(i))
        out.append(cleaned)
    if missing:
        raise HitlError(f"Please answer the required question(s): {', '.join(missing)}.")
    return {"answers": out}


def _evaluate(q, answer):
    base = {"question": q["question"], "type": q["type"]}
    if q["type"] == "Text":
        return {**base, "is_correct": None, "manual_review": True}
    if not _answered(answer):
        return {**base, "is_correct": None, "manual_review": False}
    if q["type"] == "Radio":
        ok = answer == q["solution"][0]
    else:
        ok = set(answer) == set(q["solution"])
    return {**base, "is_correct": ok, "manual_review": False}


def build_result(input_value, cfg, response):
    questions = active_questions(cfg)
    answers = response["answers"]
    responses, results = [], []
    for q, a in zip(questions, answers):
        responses.append({"question": q["question"], "type": q["type"], "answer": a})
        results.append(_evaluate(q, a))
    graded = [r for r in results if r["is_correct"] is not None]
    return {
        "status": "Completed",
        "responses": responses,
        "evaluation": {
            "auto_graded": len(graded),
            "correct": sum(1 for r in graded if r["is_correct"]),
            "manual_review": sum(1 for r in results if r["manual_review"]),
            "results": results,
        },
    }