# app/files/language.py
# Language / script detection. Fully optional: extraction never depends on it.

import unicodedata
from collections import Counter

MIN_LETTERS = 20
SAMPLE_CHARS = 20000

_SCRIPTS = {
    "LATIN": ("Latin", "Latn"), "CYRILLIC": ("Cyrillic", "Cyrl"), "GREEK": ("Greek", "Grek"),
    "ARABIC": ("Arabic", "Arab"), "HEBREW": ("Hebrew", "Hebr"), "DEVANAGARI": ("Devanagari", "Deva"),
    "BENGALI": ("Bengali", "Beng"), "TAMIL": ("Tamil", "Taml"), "TELUGU": ("Telugu", "Telu"),
    "KANNADA": ("Kannada", "Knda"), "MALAYALAM": ("Malayalam", "Mlym"), "GUJARATI": ("Gujarati", "Gujr"),
    "GURMUKHI": ("Gurmukhi", "Guru"), "ORIYA": ("Odia", "Orya"), "THAI": ("Thai", "Thai"),
    "HANGUL": ("Hangul", "Hang"), "HIRAGANA": ("Hiragana", "Hira"), "KATAKANA": ("Katakana", "Kana"),
    "CJK": ("Han", "Hani"), "ARMENIAN": ("Armenian", "Armn"), "GEORGIAN": ("Georgian", "Geor"),
}


def detect_script(text: str) -> dict:
    counts = Counter()
    for ch in text[:SAMPLE_CHARS]:
        if not ch.isalpha():
            continue
        try:
            counts[unicodedata.name(ch).split()[0]] += 1
        except ValueError:
            continue
    if not counts:
        return {"script_name": "Unknown", "script_code": "Zyyy"}
    top = counts.most_common(1)[0][0]
    name, code = _SCRIPTS.get(top, (top.title(), "Zzzz"))
    return {"script_name": name, "script_code": code}


def _language_name(code: str) -> str:
    try:
        import pycountry
        base = code.split("-")[0]
        rec = pycountry.languages.get(alpha_2=base) or pycountry.languages.get(alpha_3=base)
        if rec:
            return rec.name
    except Exception:  # noqa: BLE001
        pass
    return code


def detect_language(text: str) -> dict:
    out = {
        "language_name": "Unknown",
        "language_code": "und",
        **detect_script(text or ""),
        "confidence": None,
        "alternatives": [],
        "detection_status": "Insufficient text",
        "sample_characters": min(len(text or ""), SAMPLE_CHARS),
    }
    letters = sum(1 for c in (text or "")[:SAMPLE_CHARS] if c.isalpha())
    if letters < MIN_LETTERS:
        return out
    try:
        from langdetect import DetectorFactory, detect_langs
        DetectorFactory.seed = 0
    except ImportError:
        out["detection_status"] = "Unavailable"
        return out
    try:
        langs = detect_langs(text[:SAMPLE_CHARS])
    except Exception:  # noqa: BLE001
        out["detection_status"] = "Failed"
        return out
    if not langs:
        out["detection_status"] = "Ambiguous"
        return out
    top = langs[0]
    out["language_code"] = top.lang
    out["language_name"] = _language_name(top.lang)
    out["confidence"] = round(float(top.prob), 4)
    out["alternatives"] = [
        {"language_code": l.lang, "language_name": _language_name(l.lang), "confidence": round(float(l.prob), 4)}
        for l in langs[1:3]
    ]
    out["detection_status"] = "Detected" if top.prob >= 0.7 else "Ambiguous"
    return out