# app/nlp/features.py
# One handler per NLP feature: handler(ctx, options) -> JSON-serializable result.

import json
import os
import re
import subprocess
import sys
import uuid
import hashlib
from collections import Counter
from datetime import datetime
from pathlib import Path

from app.nlp import utils as U
from app.nlp.utils import NlpError, NlpDependencyError, opt_b as _b, opt_num as _n, opt_s as _s


class Ctx:
    def __init__(self, text="", texts=None, documents=None, context="", question="",
                 audio_files=None, audio_error="", allow_download=False):
        self.text = text
        self.texts = texts or []
        self.documents = documents or []
        self.context = context
        self.question = question
        self.audio_files = audio_files or []
        self.audio_error = audio_error
        self.allow_download = allow_download

    def need_text(self):
        if not self.text or not self.text.strip():
            raise NlpError("input text is empty.")
        if len(self.text) > U.MAX_CHARS:
            raise NlpError(f"input exceeds {U.MAX_CHARS} characters.")
        return self.text


def _labels(raw):
    if isinstance(raw, str):
        raw = [p for line in raw.splitlines() for p in line.split(",")]
    out = []
    for x in raw or []:
        s = str(x).strip()
        if s and s not in out:
            out.append(s)
    return out


# ─── 1. Vectorization ─────────────────────────────────────────────────────────
_FILTERS = str.maketrans({c: " " for c in '!"#$%&()*+,-./:;<=>?@[\\]^_`{|}~\t\n'})


def vectorization(ctx, o):
    texts = [t for t in (ctx.texts or [ctx.need_text()]) if t and t.strip()]
    if not texts:
        raise NlpError("input text is empty.")
    method = _s(o, "method", "word_index")

    if method in ("word_index", "one_hot"):
        toks = [t.lower().translate(_FILTERS).split() for t in texts]
        if method == "one_hot":
            distinct = {w for tk in toks for w in tk}
            size = _n(o, "vocab_size", max(50, 2 * len(distinct)), 2, 10_000_000, True)
            enc = [[int(hashlib.md5(w.encode("utf-8")).hexdigest(), 16) % (size - 1) + 1 for w in tk] for tk in toks]
            return {"method": method, "vocab_size": size, "encoded": enc}
        counts = Counter()
        for tk in toks:
            counts.update(tk)
        ordered = sorted(counts.items(), key=lambda kv: -kv[1])
        index = {w: i for i, (w, _) in enumerate(ordered, 1)}
        seqs = [[index[w] for w in tk] for tk in toks]
        out = {"method": method, "word_index": index, "vocabulary_size": len(index), "sequences": seqs}
        if _b(o, "padding"):
            maxlen = _n(o, "max_length", max((len(s) for s in seqs), default=1) or 1, 1, 100000, True)
            out["padded_sequences"] = [
                ([0] * (maxlen - len(s)) + s) if len(s) <= maxlen else s[-maxlen:] for s in seqs
            ]
        return out

    if method in ("count", "tfidf"):
        tokens = [U.tokenize_simple(t) for t in texts]
        limit = _n(o, "max_features", 500, 1, 20000, True)
        terms, vecs = U.tfidf_vectors(tokens, limit)
        if method == "tfidf":
            rows = [[round(v.get(t, 0.0), 6) for t in terms] for v in vecs]
        else:
            rows = [[Counter(tk).get(t, 0) for t in terms] for tk in tokens]
        return {"method": method, "vocabulary": terms, "dimensions": len(terms), "vectors": rows}

    if method == "sentence_embedding":
        name = _s(o, "model", "all-MiniLM-L6-v2")
        vecs = U.st_model(name, ctx.allow_download).encode(texts)
        return {"method": method, "model": name, "dimensions": len(vecs[0]), "vectors": U.native(vecs)}

    raise NlpError(f"unsupported vectorization method '{method}'.", "config")


# ─── 2. Tokenization ──────────────────────────────────────────────────────────
def tokenization(ctx, o):
    text = ctx.need_text()
    engine, words, used = _s(o, "engine", "auto"), None, None
    if engine in ("auto", "nltk"):
        try:
            nltk = U.nltk_punkt()
            words, used = nltk.tokenize.word_tokenize(text), "nltk"
        except NlpDependencyError:
            if engine == "nltk":
                raise
    if words is None:
        words, used = U.regex_words(text), "regex"
    if _b(o, "lowercase"):
        words = [w.lower() for w in words]
    sents, _ = U.sentences(text, "nltk" if used == "nltk" else "regex")
    return {"engine": used, "tokens": words, "token_count": len(words),
            "sentences": sents, "sentence_count": len(sents)}


# ─── 3. Sentiment ─────────────────────────────────────────────────────────────
def sentiment_analysis(ctx, o):
    text, engine = ctx.need_text(), _s(o, "engine", "textblob")
    if engine == "textblob":
        s = U.require("textblob").TextBlob(text).sentiment
        pol, th = float(s.polarity), _n(o, "neutral_threshold", 0.0, 0.0, 1.0)
        label = "positive" if pol > th else "negative" if pol < -th else "neutral"
        return {"engine": engine, "label": label, "score": round(pol, 4),
                "subjectivity": round(float(s.subjectivity), 4)}
    if engine == "transformers":
        model = _s(o, "model", "distilbert-base-uncased-finetuned-sst-2-english")
        pipe = U.hf_pipeline("sentiment-analysis", "seq-cls", model, ctx.allow_download)
        r = pipe(text[:5000], truncation=True)[0]
        return {"engine": engine, "model": model, "label": str(r["label"]).lower(),
                "score": round(float(r["score"]), 4)}
    raise NlpError(f"unsupported sentiment engine '{engine}'.", "config")


# ─── 4. Text classification ───────────────────────────────────────────────────
def _examples(raw):
    items = [l for l in raw.splitlines() if l.strip()] if isinstance(raw, str) else (raw or [])
    out = []
    for it in items:
        if isinstance(it, dict):
            t, l = str(it.get("text", "")).strip(), str(it.get("label", "")).strip()
        else:
            s = str(it)
            if "|" not in s:
                raise NlpError(f"training example '{s[:40]}' must look like: text | label", "config")
            t, l = (p.strip() for p in s.rsplit("|", 1))
        if t and l:
            out.append((t, l))
    return out


def text_classification(ctx, o):
    text, method = ctx.need_text(), _s(o, "method", "naive_bayes")
    labels = _labels(o.get("labels"))
    if method == "zero_shot":
        if len(labels) < 2:
            raise NlpError("configure at least two categories (labels).", "config")
        model = _s(o, "model", "facebook/bart-large-mnli")
        pipe = U.hf_pipeline("zero-shot-classification", "seq-cls", model, ctx.allow_download)
        r = pipe(text[:5000], candidate_labels=labels, multi_label=_b(o, "multi_label"))
        return {"method": method, "model": model, "label": r["labels"][0],
                "confidence": round(float(r["scores"][0]), 4),
                "scores": {l: round(float(s), 4) for l, s in zip(r["labels"], r["scores"])}}
    if method == "naive_bayes":
        fe = U.require("sklearn.feature_extraction.text", "scikit-learn")
        nb = U.require("sklearn.naive_bayes", "scikit-learn")
        ex = _examples(o.get("training_examples"))
        if len(ex) < 2 or len({l for _, l in ex}) < 2:
            raise NlpError("naive_bayes needs training examples with at least two different labels.", "config")
        bad = sorted({l for _, l in ex if labels and l not in labels})
        if bad:
            raise NlpError(f"training labels not in the configured categories: {', '.join(bad)}.", "config")
        vec = fe.CountVectorizer()
        model = nb.MultinomialNB().fit(vec.fit_transform([t for t, _ in ex]), [l for _, l in ex])
        probs = model.predict_proba(vec.transform([text]))[0]
        scores = {str(c): round(float(p), 4) for c, p in zip(model.classes_, probs)}
        best = max(scores, key=scores.get)
        return {"method": method, "label": best, "confidence": scores[best], "scores": scores,
                "training_examples": len(ex)}
    raise NlpError(f"unsupported classification method '{method}'.", "config")


# ─── 5. Machine translation ───────────────────────────────────────────────────
def machine_translation(ctx, o):
    text = ctx.need_text()
    tgt = _s(o, "target_lang").lower()
    if not tgt:
        raise NlpError("target language is required.", "config")
    src = _s(o, "source_lang", "auto").lower()
    if src == "auto":
        from app.files.language import detect_language
        d = detect_language(text)
        if d["language_code"] == "und":
            raise NlpError("source language could not be detected; set it explicitly.")
        src = d["language_code"].split("-")[0]
    if src == tgt:
        raise NlpError("source and target languages are identical.", "config")
    name = _s(o, "model") or f"Helsinki-NLP/opus-mt-{src}-{tgt}"
    tok, mdl = U.hf_load("seq2seq", name, ctx.allow_download)
    torch = U.require("torch")
    sents, out = U.regex_sentences(text) or [text], []
    for i in range(0, len(sents), 8):
        enc = tok(sents[i:i + 8], return_tensors="pt", padding=True, truncation=True, max_length=512)
        with torch.no_grad():
            gen = mdl.generate(**enc, max_length=512)
        out.extend(tok.batch_decode(gen, skip_special_tokens=True))
    return {"source_language": src, "target_language": tgt, "model": name, "translation": " ".join(out)}


# ─── 6. NER ───────────────────────────────────────────────────────────────────
_SPACY = {}


def ner(ctx, o):
    text, name = ctx.need_text(), _s(o, "spacy_model", "en_core_web_sm")
    spacy = U.require("spacy")
    if name not in _SPACY:
        try:
            _SPACY[name] = spacy.load(name)
        except OSError as exc:
            raise NlpDependencyError(
                f"spaCy model '{name}' is not installed. Run: python -m spacy download {name}"
            ) from exc
    doc = _SPACY[name](text)
    ents = [{"text": e.text, "label": e.label_, "start": e.start_char, "end": e.end_char} for e in doc.ents]
    by = {}
    for e in ents:
        by.setdefault(e["label"], []).append(e["text"])
    return {"model": name, "entities": ents, "entity_count": len(ents), "by_label": by}


# ─── 7. Summarization ─────────────────────────────────────────────────────────
def _frequency_summary(text, n):
    sents, _ = U.sentences(text, "auto")
    if len(sents) <= n:
        return sents
    freq = Counter(w for w in U.tokenize_simple(text) if w not in U.STOPWORDS and len(w) > 2)
    scored = []
    for i, s in enumerate(sents):
        toks = U.tokenize_simple(s)
        scored.append((sum(freq[w] for w in toks if w in freq) / max(len(toks), 1), i))
    keep = sorted(i for _, i in sorted(scored, reverse=True)[:n])
    return [sents[i] for i in keep]


def summarization(ctx, o):
    text, method = ctx.need_text(), _s(o, "method", "frequency")
    n = _n(o, "sentences", 3, 1, 50, True)
    if method == "frequency":
        sents = _frequency_summary(text, n)
    elif method == "lsa":
        U.nltk_punkt()
        parser = U.require("sumy.parsers.plaintext", "sumy").PlaintextParser
        tokenizer = U.require("sumy.nlp.tokenizers", "sumy").Tokenizer
        lsa = U.require("sumy.summarizers.lsa", "sumy").LsaSummarizer
        doc = parser.from_string(text, tokenizer(_s(o, "language", "english")))
        sents = [str(s) for s in lsa()(doc.document, n)]
    elif method == "transformers":
        model = _s(o, "model", "sshleifer/distilbart-cnn-12-6")
        mx, mn = _n(o, "max_length", 60, 10, 1024, True), _n(o, "min_length", 20, 1, 1024, True)
        if mn >= mx:
            raise NlpError("min_length must be smaller than max_length.", "config")
        tok, mdl = U.hf_load("seq2seq", model, ctx.allow_download)
        torch = U.require("torch")
        enc = tok(text, return_tensors="pt", truncation=True, max_length=1024)
        with torch.no_grad():
            ids = mdl.generate(**enc, max_length=mx, min_length=mn, do_sample=False)
        sents = [tok.decode(ids[0], skip_special_tokens=True).strip()]
    else:
        raise NlpError(f"unsupported summarization method '{method}'.", "config")
    fmt = _s(o, "format", "text")
    summary = "\n".join(f"- {s}" for s in sents) if fmt == "bullets" else " ".join(sents)
    return {"method": method, "format": fmt, "summary": summary, "sentences": sents}


# ─── 8. Speech recognition ────────────────────────────────────────────────────
def speech_recognition(ctx, o):
    if ctx.audio_error:
        raise NlpError(ctx.audio_error)
    if not ctx.audio_files:
        raise NlpError("no audio input. Upload a WAV, AIFF or FLAC file and map it to the Audio input.")
    sr = U.require("speech_recognition", "SpeechRecognition")
    engine = _s(o, "engine", "google")
    lang = _s(o, "language", "en-US" if engine == "google" else "")
    model = _s(o, "whisper_model", "base")
    if engine == "whisper":
        U.require("whisper", "openai-whisper")
        cache = Path(os.getenv("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "whisper" / f"{model}.pt"
        if not cache.exists() and not ctx.allow_download:
            raise NlpDependencyError(
                f"Whisper model '{model}' is not downloaded. Enable 'Allow model download' or download it first."
            )
    elif engine != "google":
        raise NlpError(f"unsupported speech engine '{engine}'.", "config")

    rec, segments = sr.Recognizer(), []
    for name, path in ctx.audio_files:
        try:
            with sr.AudioFile(str(path)) as src:
                audio = rec.record(src)
        except Exception as exc:  # noqa: BLE001
            raise NlpError(f"could not read audio '{name}': {exc}")
        try:
            if engine == "google":
                text = rec.recognize_google(audio, language=lang)
            else:
                text = rec.recognize_whisper(audio, model=model, language=lang or None)
        except sr.UnknownValueError:
            raise NlpError(f"could not understand the audio in '{name}'.")
        except sr.RequestError as exc:
            raise NlpError(f"speech service request failed: {exc}", "runtime")
        segments.append({"file": name, "text": text})
    return {"engine": engine, "language": lang or "auto", "segments": segments,
            "transcript": "\n".join(s["text"] for s in segments)}


# ─── 9. Spell check ───────────────────────────────────────────────────────────
def spell_check(ctx, o):
    text, engine = ctx.need_text(), _s(o, "engine", "textblob")
    if engine == "autocorrect":
        corrected = U.require("autocorrect").Speller(lang=_s(o, "language", "en"))(text)
    elif engine == "textblob":
        if len(text) > 20000:
            raise NlpError("textblob spell check supports at most 20000 characters.", "config")
        corrected = str(U.require("textblob").TextBlob(text).correct())
    else:
        raise NlpError(f"unsupported spell check engine '{engine}'.", "config")
    a, b = text.split(), corrected.split()
    changes = [{"original": x, "corrected": y} for x, y in zip(a, b) if x != y] if len(a) == len(b) else []
    return {"engine": engine, "original_text": text, "corrected_text": corrected,
            "corrections": changes, "correction_count": len(changes) if changes else int(text != corrected)}


# ─── 10. Information retrieval ────────────────────────────────────────────────
def information_retrieval(ctx, o):
    docs = ctx.documents or U.to_text_list(o.get("documents"))
    if not docs:
        raise NlpError("no documents to search (configure documents or map the Documents input).")
    query = _s(o, "query") or ctx.need_text()
    top_k = _n(o, "top_k", 5, 1, 100, True)
    _, vecs = U.tfidf_vectors([U.tokenize_simple(d) for d in docs] + [U.tokenize_simple(query)])
    scores = [U.cosine(vecs[-1], v) for v in vecs[:-1]]
    ranked = sorted(range(len(docs)), key=lambda i: -scores[i])[:top_k]
    return {"query": query, "method": "tfidf_cosine", "searched": len(docs), "top_k": top_k,
            "results": [{"rank": r + 1, "index": i, "score": round(scores[i], 4), "document": docs[i]}
                        for r, i in enumerate(ranked)]}


# ─── 11. Language detection ───────────────────────────────────────────────────
def language_detection(ctx, o):
    from app.files.language import detect_language
    d = detect_language(ctx.need_text())
    if d["detection_status"] == "Unavailable":
        raise NlpDependencyError("'langdetect' is not available. Install it with: pip install langdetect")
    if d["detection_status"] in ("Insufficient text", "Failed"):
        raise NlpError("text is too short or unreadable for reliable language detection (20+ letters needed).")
    return {"language": d["language_name"], "language_code": d["language_code"],
            "script": d["script_name"], "confidence": d["confidence"],
            "alternatives": d["alternatives"], "detection_status": d["detection_status"]}


# ─── 12. Keyword extraction ───────────────────────────────────────────────────
def _rake(text, max_words):
    phrases = []
    for chunk in re.split(r"[.!?,;:\n\t\"()\[\]{}]+", text.lower()):
        cur = []
        for w in re.findall(r"[\w'-]+", chunk):
            if w in U.STOPWORDS or w.isdigit():
                if cur:
                    phrases.append(cur)
                cur = []
            else:
                cur.append(w)
        if cur:
            phrases.append(cur)
    freq, deg = Counter(), Counter()
    for p in phrases:
        for w in p:
            freq[w] += 1
            deg[w] += len(p)
    scores = {}
    for p in phrases:
        if len(p) <= max_words:
            scores[" ".join(p)] = sum(deg[w] / freq[w] for w in p)
    return sorted(scores.items(), key=lambda kv: -kv[1])


def keyword_extraction(ctx, o):
    text, engine = ctx.need_text(), _s(o, "engine", "builtin")
    top_n, mw = _n(o, "top_n", 10, 1, 200, True), _n(o, "max_phrase_words", 4, 1, 20, True)
    if engine == "builtin":
        ranked = _rake(text, mw)
    elif engine == "rake_nltk":
        rake = U.require("rake_nltk").Rake(max_length=mw)
        try:
            rake.extract_keywords_from_text(text)
            ranked = [(p, s) for s, p in rake.get_ranked_phrases_with_scores()]
        except LookupError as exc:
            raise NlpDependencyError(
                "NLTK data missing for rake_nltk. Run: python -m nltk.downloader stopwords punkt_tab"
            ) from exc
    else:
        raise NlpError(f"unsupported keyword engine '{engine}'.", "config")
    ranked = ranked[:top_n]
    return {"engine": engine, "keywords": [k for k, _ in ranked],
            "ranked": [{"keyword": k, "score": round(float(s), 4)} for k, s in ranked]}


# ─── 13. Topic modeling ───────────────────────────────────────────────────────
def topic_modeling(ctx, o):
    fe = U.require("sklearn.feature_extraction.text", "scikit-learn")
    dec = U.require("sklearn.decomposition", "scikit-learn")
    docs = ctx.documents or ctx.texts
    if len(docs) < 2:
        text = ctx.need_text() if not docs else docs[0]
        docs = U.paragraphs(text)
        if len(docs) < 2:
            docs = U.regex_sentences(text)
    docs = [d for d in docs if d.strip()]
    if not docs:
        raise NlpError("no documents for topic modeling.")
    k, top = _n(o, "num_topics", 3, 1, 50, True), _n(o, "top_words", 8, 1, 50, True)
    vec = fe.CountVectorizer(stop_words="english", max_features=2000)
    try:
        X = vec.fit_transform(docs)
    except ValueError:
        raise NlpError("no usable vocabulary found in the documents.")
    lda = dec.LatentDirichletAllocation(n_components=k, max_iter=_n(o, "max_iter", 20, 1, 500, True), random_state=0)
    dist = lda.fit_transform(X)
    names = vec.get_feature_names_out()
    topics = []
    for i, comp in enumerate(lda.components_):
        idx = comp.argsort()[::-1][:top]
        topics.append({"topic": i, "words": [str(names[j]) for j in idx],
                       "weights": [round(float(comp[j]), 4) for j in idx]})
    return {"num_topics": k, "document_count": len(docs), "topics": topics,
            "document_topics": [[round(float(p), 4) for p in row] for row in dist]}


# ─── 14. Text-to-speech ───────────────────────────────────────────────────────
_TTS = r"""
import sys, json, pyttsx3
a = json.loads(sys.stdin.read())
e = pyttsx3.init()
chosen = a.get("voice") or ""
if not chosen and a.get("language"):
    lang = a["language"].lower()
    for v in e.getProperty("voices"):
        if lang in (str(v.id) + str(v.name) + str(getattr(v, "languages", ""))).lower():
            chosen = v.id
            break
if chosen:
    e.setProperty("voice", chosen)
e.setProperty("rate", a["rate"]); e.setProperty("volume", a["volume"])
e.save_to_file(a["text"], a["path"]); e.runAndWait()
print(json.dumps({"voice": chosen}))
"""
_VOICES = r"""
import json, pyttsx3
e = pyttsx3.init()
print(json.dumps([{"id": str(v.id), "name": str(v.name), "languages": [str(l) for l in (getattr(v, "languages", []) or [])]} for v in e.getProperty("voices")]))
"""


def _run_py(script, payload=None, timeout=120):
    try:
        p = subprocess.run([sys.executable, "-c", script], input=json.dumps(payload or {}),
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise NlpError("text-to-speech timed out.", "runtime")
    if p.returncode != 0:
        err = (p.stderr or "").strip()
        if "No module named" in err:
            raise NlpDependencyError("'pyttsx3' is not available. Install it with: pip install pyttsx3")
        raise NlpError(f"text-to-speech engine failed: {err[-300:] or 'unknown error'}", "runtime")
    return json.loads(p.stdout.strip().splitlines()[-1])


def list_voices():
    return _run_py(_VOICES, timeout=30)


def text_to_speech(ctx, o):
    from app.aqi import exporter
    text = ctx.need_text()
    if len(text) > 20000:
        raise NlpError("text-to-speech supports at most 20000 characters.", "config")
    folder = exporter.resolve_dir(_s(o, "output_folder", "nlp_audio"))
    path = folder / f"tts_{datetime.now():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}.wav"
    res = _run_py(_TTS, {
        "text": text, "path": str(path), "voice": _s(o, "voice"), "language": _s(o, "language"),
        "rate": _n(o, "rate", 150, 50, 400, True), "volume": _n(o, "volume", 1.0, 0.0, 1.0),
    })
    if not path.exists() or path.stat().st_size == 0:
        raise NlpError("the speech engine did not produce an audio file.", "runtime")
    return {"file": {"filename": path.name, "path": str(path), "size_bytes": path.stat().st_size},
            "voice": res.get("voice") or "default", "characters": len(text)}


# ─── 15. Question answering ───────────────────────────────────────────────────
def question_answering(ctx, o):
    question = _s(o, "question") or ctx.question
    context = _s(o, "context") or ctx.context or ctx.text
    if not question:
        raise NlpError("a question is required (configure it or map the Question input).")
    if not context.strip():
        raise NlpError("context text is required (configure it or map the Context input).")
    model = _s(o, "model", "distilbert-base-cased-distilled-squad")
    pipe = U.hf_pipeline("question-answering", "qa", model, ctx.allow_download)
    r = pipe(question=question, context=context)
    return {"model": model, "question": question, "answer": r["answer"],
            "score": round(float(r["score"]), 4), "start": int(r["start"]), "end": int(r["end"])}


# ─── 16. Text similarity / duplicates ─────────────────────────────────────────
def _scorer(method, texts, o, ctx):
    if method == "jaccard":
        sets = [set(t.lower().split()) for t in texts]
        return lambda i, j: len(sets[i] & sets[j]) / len(sets[i] | sets[j]) if (sets[i] | sets[j]) else 0.0
    if method == "tfidf_cosine":
        toks = [U.tokenize_simple(t) for t in texts]

        def fn(i, j):
            _, v = U.tfidf_vectors([toks[i], toks[j]])
            return U.cosine(v[0], v[1])
        return fn
    if method == "embedding":
        name = _s(o, "model", "all-MiniLM-L6-v2")
        vecs = U.st_model(name, ctx.allow_download).encode(texts)
        util = U.require("sentence_transformers").util
        return lambda i, j: float(util.cos_sim(vecs[i], vecs[j])[0][0])
    raise NlpError(f"unsupported similarity method '{method}'.", "config")


def text_similarity(ctx, o):
    method, th = _s(o, "method", "tfidf_cosine"), _n(o, "threshold", 0.8, 0.0, 1.0)
    others = U.to_text_list(o.get("compare_texts"))
    if others:
        texts = [ctx.need_text()] + others
        score = _scorer(method, texts, o, ctx)
        comps = [{"index": j - 1, "text": texts[j], "score": round(score(0, j), 4)} for j in range(1, len(texts))]
        for c in comps:
            c["is_duplicate"] = c["score"] >= th
        return {"method": method, "threshold": th, "mode": "compare", "comparisons": comps,
                "max_score": max(c["score"] for c in comps), "has_duplicates": any(c["is_duplicate"] for c in comps)}
    texts = [t for t in ctx.texts if t.strip()]
    if len(texts) < 2:
        raise NlpError("provide texts to compare (configure 'Compare texts' or pass a list of texts as input).")
    score = _scorer(method, texts, o, ctx)
    pairs = []
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            s = round(score(i, j), 4)
            pairs.append({"a": i, "b": j, "text_a": texts[i], "text_b": texts[j], "score": s, "is_duplicate": s >= th})
    return {"method": method, "threshold": th, "mode": "pairwise", "pairs": pairs,
            "max_score": max(p["score"] for p in pairs), "has_duplicates": any(p["is_duplicate"] for p in pairs)}


# ─── 17. Stemming ─────────────────────────────────────────────────────────────
def stemming(ctx, o):
    words = U.alpha_words(ctx.need_text())
    algo = _s(o, "algorithm", "porter")
    stem = U.require("nltk").stem
    if algo == "porter":
        st = stem.PorterStemmer()
    elif algo == "snowball":
        try:
            st = stem.SnowballStemmer(_s(o, "language", "english"))
        except ValueError as exc:
            raise NlpError(str(exc), "config")
    else:
        raise NlpError(f"unsupported stemming algorithm '{algo}'.", "config")
    stems = [st.stem(w) for w in words]
    return {"algorithm": algo, "stems": stems, "pairs": [{"word": w, "stem": s} for w, s in zip(words, stems)]}


# ─── 18. Lemmatization ────────────────────────────────────────────────────────
def lemmatization(ctx, o):
    words = U.alpha_words(ctx.need_text())
    pos = _s(o, "pos", "n")
    if pos not in ("n", "v", "a", "r", "s"):
        raise NlpError("pos must be one of n, v, a, r, s.", "config")
    lem = U.nltk_wordnet().stem.WordNetLemmatizer()
    try:
        lemmas = [lem.lemmatize(w.lower(), pos=pos) for w in words]
    except LookupError as exc:
        raise NlpDependencyError("NLTK WordNet data is missing. Run: python -m nltk.downloader wordnet omw-1.4") from exc
    return {"pos": pos, "lemmas": lemmas, "pairs": [{"word": w, "lemma": l} for w, l in zip(words, lemmas)]}


# ─── 19. Text segmentation ────────────────────────────────────────────────────
def text_segmentation(ctx, o):
    text, unit = ctx.need_text(), _s(o, "unit", "sentences")
    out = {"unit": unit}
    if unit in ("sentences", "both"):
        sents, used = U.sentences(text, _s(o, "engine", "auto"))
        out.update(engine=used, sentences=sents, sentence_count=len(sents))
    if unit in ("paragraphs", "both"):
        paras = U.paragraphs(text)
        out.update(paragraphs=paras, paragraph_count=len(paras))
    if unit not in ("sentences", "paragraphs", "both"):
        raise NlpError(f"unsupported segmentation unit '{unit}'.", "config")
    out["segments"] = out.get("paragraphs") if unit == "paragraphs" else out.get("sentences")
    return out