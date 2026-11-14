# app/nlp/registry.py

from app.nlp import features as F

FEATURES = [
    {"key": "vectorization",       "label": "Vectorization",                  "description": "Convert text into numerical vectors"},
    {"key": "tokenization",        "label": "Tokenization",                   "description": "Split text into tokens"},
    {"key": "sentiment_analysis",  "label": "Sentiment Analysis",             "description": "Positive, negative or neutral"},
    {"key": "text_classification", "label": "Text Classification",            "description": "Classify into configured categories"},
    {"key": "machine_translation", "label": "Machine Translation",            "description": "Translate between languages"},
    {"key": "ner",                 "label": "Named Entity Recognition",       "description": "People, organizations, locations, dates"},
    {"key": "summarization",       "label": "Text Summarization",             "description": "Concise summary"},
    {"key": "speech_recognition",  "label": "Speech Recognition",             "description": "Audio to text"},
    {"key": "spell_check",         "label": "Autocorrect and Spell Check",    "description": "Detect and fix spelling errors"},
    {"key": "information_retrieval", "label": "Information Retrieval / Search", "description": "Rank documents for a query"},
    {"key": "language_detection",  "label": "Language Detection",             "description": "Identify the input language"},
    {"key": "keyword_extraction",  "label": "Keyword Extraction",             "description": "Important keywords and phrases"},
    {"key": "topic_modeling",      "label": "Topic Modeling",                 "description": "Topics within documents"},
    {"key": "text_to_speech",      "label": "Text-to-Speech",                 "description": "Text to audio file"},
    {"key": "question_answering",  "label": "Question Answering",             "description": "Answer from supplied context"},
    {"key": "text_similarity",     "label": "Text Similarity / Duplicate Detection", "description": "Compare texts, flag duplicates"},
    {"key": "stemming",            "label": "Stemming",                       "description": "Reduce words to stems"},
    {"key": "lemmatization",       "label": "Lemmatization",                  "description": "Dictionary base forms"},
    {"key": "text_segmentation",   "label": "Text Segmentation",              "description": "Sentences or paragraphs"},
]

KEYS = [f["key"] for f in FEATURES]
LABELS = {f["key"]: f["label"] for f in FEATURES}

HANDLERS = {k: getattr(F, k) for k in KEYS}


def selected_features(config) -> list:
    raw = (config or {}).get("features")
    out = []
    for f in raw if isinstance(raw, list) else []:
        k = str(f).strip()
        if k in HANDLERS and k not in out:
            out.append(k)
    return out