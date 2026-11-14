# app/nlp/utils.py
# Shared helpers: lazy imports, pure-Python text utilities, TF-IDF, model loaders (no auto-download).

import importlib
import json
import math
import re
import threading
from collections import Counter

MAX_CHARS = 1_000_000


class NlpError(Exception):
    kind = "input"

    def __init__(self, message, kind=None):
        super().__init__(message)
        if kind:
            self.kind = kind


class NlpDependencyError(NlpError):
    kind = "dependency"


def require(module, package=None):
    try:
        return importlib.import_module(module)
    except ImportError as exc:
        pkg = package or module.split(".")[0]
        raise NlpDependencyError(
            f"'{pkg}' is not available ({exc}). Install it with: pip install {pkg}"
        ) from exc


# ─── Option helpers ───────────────────────────────────────────────────────────

def opt_s(o, key, default=""):
    v = o.get(key)
    return default if v is None or (isinstance(v, str) and not v.strip()) else str(v).strip()


def opt_b(o, key, default=False):
    v = o.get(key)
    return default if v is None else bool(v)


def opt_num(o, key, default, lo, hi, integer=False):
    v = o.get(key)
    if v is None or (isinstance(v, str) and not v.strip()):
        return default
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise NlpError(f"'{key}' must be a number.", "config")
    if isinstance(v, bool) or math.isnan(n) or not (lo <= n <= hi):
        raise NlpError(f"'{key}' must be between {lo} and {hi}.", "config")
    if integer:
        if not n.is_integer():
            raise NlpError(f"'{key}' must be a whole number.", "config")
        return int(n)
    return n


# ─── Text utilities ───────────────────────────────────────────────────────────

STOPWORDS = frozenset(
    """a about above after again against all am an and any are as at be because been before being
    below between both but by can did do does doing down during each few for from further had has
    have having he her here hers herself him himself his how i if in into is it its itself just me
    more most my myself no nor not now of off on once only or other our ours ourselves out over own
    same she should so some such than that the their theirs them themselves then there these they
    this those through to too under until up very was we were what when where which while who whom
    why will with you your yours yourself yourselves would could also may might must shall""".split()
)

_WORD = re.compile(r"\w+(?:'\w+)?|[^\w\s]", re.UNICODE)
_ALPHA = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)


def regex_words(text):
    return _WORD.findall(text)


def alpha_words(text):
    return _ALPHA.findall(text)


def tokenize_simple(text):
    return re.findall(r"\w+", text.lower())


def regex_sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?।])\s+|\n+", text) if s.strip()]


def paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def _nltk_find(nltk, names):
    for res in names:
        try:
            nltk.data.find(res)
            return True
        except LookupError:
            continue
    return False


def nltk_punkt():
    nltk = require("nltk")
    if not _nltk_find(nltk, ("tokenizers/punkt_tab", "tokenizers/punkt_tab.zip",
                             "tokenizers/punkt", "tokenizers/punkt.zip")):
        raise NlpDependencyError(
            "NLTK tokenizer data is missing. Run: python -m nltk.downloader punkt_tab"
        )
    return nltk


def nltk_wordnet():
    nltk = require("nltk")
    if not _nltk_find(nltk, ("corpora/wordnet", "corpora/wordnet.zip")):
        raise NlpDependencyError(
            "NLTK WordNet data is missing. Run: python -m nltk.downloader wordnet omw-1.4"
        )
    return nltk


def sentences(text, engine="auto"):
    if engine in ("auto", "nltk"):
        try:
            nltk = nltk_punkt()
            return [s.strip() for s in nltk.tokenize.sent_tokenize(text) if s.strip()], "nltk"
        except NlpDependencyError:
            if engine == "nltk":
                raise
    return regex_sentences(text), "regex"


def to_text_list(value):
    """Strings, lists, JSON, search-result dicts or blank-line separated text -> list[str]."""
    def item(i):
        if isinstance(i, str):
            return i.strip()
        if isinstance(i, dict):
            for k in ("page_content", "text", "content", "snippet", "title"):
                if isinstance(i.get(k), str) and i[k].strip():
                    return i[k].strip()
            return json.dumps(i, ensure_ascii=False)
        return "" if i is None else str(i)

    if value is None:
        return []
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        if s[0] in "[{":
            try:
                return to_text_list(json.loads(s))
            except ValueError:
                pass
        return [p.strip() for p in re.split(r"\n\s*\n", s) if p.strip()]
    if isinstance(value, dict):
        for k in ("results", "documents", "items", "texts", "data"):
            if isinstance(value.get(k), list):
                return to_text_list(value[k])
        return [item(value)]
    if isinstance(value, (list, tuple)):
        return [t for t in (item(i) for i in value) if t]
    return [str(value)]


def native(obj):
    if isinstance(obj, dict):
        return {str(k): native(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [native(i) for i in obj]
    if hasattr(obj, "tolist"):
        return native(obj.tolist())
    return obj


# ─── TF-IDF / cosine (pure Python; same formula as scikit-learn defaults) ─────

def tfidf_vectors(docs_tokens, max_features=None):
    n = len(docs_tokens)
    df, total = Counter(), Counter()
    for toks in docs_tokens:
        df.update(set(toks))
        total.update(toks)
    terms = list(df)
    if max_features and len(terms) > max_features:
        terms = [t for t, _ in total.most_common(max_features)]
    terms = sorted(terms)
    idf = {t: math.log((1 + n) / (1 + df[t])) + 1 for t in terms}
    vecs = []
    for toks in docs_tokens:
        tf = Counter(t for t in toks if t in idf)
        v = {t: c * idf[t] for t, c in tf.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({t: x / norm for t, x in v.items()})
    return terms, vecs


def cosine(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(t, 0.0) for t, x in a.items())


# ─── Model loaders (never download unless explicitly allowed) ────────────────

_MODELS = {}
_LOCK = threading.Lock()
_AUTO = {
    "seq-cls": "AutoModelForSequenceClassification",
    "seq2seq": "AutoModelForSeq2SeqLM",
    "qa": "AutoModelForQuestionAnswering",
}


def _offline_error(name, exc):
    return NlpDependencyError(
        f"Model '{name}' is not available locally and downloading is disabled. Enable "
        f"'Allow model download' on the node or pre-download it. Details: {str(exc)[:200]}"
    )


def hf_load(kind, name, allow):
    key = (kind, name)
    with _LOCK:
        if key in _MODELS:
            return _MODELS[key]
    tf = require("transformers")
    require("torch")
    try:
        tok = tf.AutoTokenizer.from_pretrained(name, local_files_only=not allow)
        mdl = getattr(tf, _AUTO[kind]).from_pretrained(name, local_files_only=not allow)
    except OSError as exc:
        raise _offline_error(name, exc) from exc
    mdl.eval()
    with _LOCK:
        _MODELS[key] = (tok, mdl)
    return tok, mdl


def hf_pipeline(task, kind, name, allow):
    key = ("pipe", task, name)
    with _LOCK:
        if key in _MODELS:
            return _MODELS[key]
    tok, mdl = hf_load(kind, name, allow)
    pipe = require("transformers").pipeline(task, model=mdl, tokenizer=tok)
    with _LOCK:
        _MODELS[key] = pipe
    return pipe


def st_model(name, allow):
    key = ("st", name)
    with _LOCK:
        if key in _MODELS:
            return _MODELS[key]
    st = require("sentence_transformers", "sentence-transformers")
    try:
        model = st.SentenceTransformer(name, local_files_only=not allow)
    except OSError as exc:
        raise _offline_error(name, exc) from exc
    except TypeError as exc:
        raise NlpDependencyError("Upgrade sentence-transformers (local_files_only is unsupported).") from exc
    with _LOCK:
        _MODELS[key] = model
    return model