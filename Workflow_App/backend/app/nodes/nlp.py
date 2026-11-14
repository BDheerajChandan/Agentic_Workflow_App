# app/nodes/nlp.py

import time

from app import runtime
from app.database import file_repository
from app.expressions import ExpressionError, build_context, render
from app.files import storage
from app.files.refs import normalize_refs
from app.files.text import plain_text
from app.nlp.features import Ctx
from app.nlp.registry import HANDLERS, KEYS, selected_features
from app.nlp.utils import NlpError, native, to_text_list


def _audio_files(state):
    ids = []
    for cand in (state.get("nlp_audio"), state.get("current_value"), state.get("files")):
        ids = normalize_refs(cand)
        if ids:
            break
    if not ids:
        return [], "no audio input. Upload a WAV, AIFF or FLAC file and map it to the Audio input."
    files = []
    for fid in ids:
        rec = runtime.run_async(file_repository.get_file_internal(fid))
        if not rec:
            return [], f"file not found: {fid}"
        if rec["file_type"] != "audio":
            continue
        path = storage.path_for(rec["storage_key"])
        if not path.exists():
            return [], f"stored audio file is no longer available: {rec['original_name']}"
        files.append((rec["original_name"], path))
    if not files:
        return [], "none of the referenced files is an audio file (WAV, AIFF, FLAC)."
    return files, ""


def nlp_node(state, config):
    cfg = config or {}
    raw_features = cfg.get("features")
    if not isinstance(raw_features, list) or not raw_features:
        raise ValueError("NLP: select at least one feature.")
    unknown = [str(f) for f in raw_features if str(f) not in KEYS]
    if unknown:
        raise ValueError(f"NLP: unsupported feature(s): {', '.join(unknown)}.")
    features = selected_features(cfg)
    if "speech_recognition" in features:
        features.remove("speech_recognition")
        features.insert(0, "speech_recognition")

    raw = state.get("current_value") if state.get("current_value") is not None else state.get("input")
    if isinstance(raw, (list, tuple)) and all(isinstance(i, (str, int, float)) for i in raw):
        texts = [str(i) for i in raw if str(i).strip()]
        text = "\n".join(texts)
    else:
        text = plain_text(raw)
        texts = [text] if text.strip() else []

    ctx = Ctx(
        text=text, texts=texts,
        documents=to_text_list(state.get("nlp_documents")),
        context=plain_text(state.get("nlp_context")),
        question=plain_text(state.get("nlp_question")),
        allow_download=bool(cfg.get("allow_model_download")),
    )
    if "speech_recognition" in features:
        ctx.audio_files, ctx.audio_error = _audio_files(state)

    expr = build_context(state, cfg)
    all_opts = cfg.get("options") if isinstance(cfg.get("options"), dict) else {}

    results, errors, durations = {}, {}, {}
    started = time.time()
    for key in features:
        t0 = time.time()
        try:
            opts = all_opts.get(key) if isinstance(all_opts.get(key), dict) else {}
            try:
                opts = render(opts, expr)
            except ExpressionError as exc:
                raise NlpError(str(exc), "config")
            results[key] = native(HANDLERS[key](ctx, opts))
            if key == "speech_recognition" and not ctx.text.strip():
                ctx.text = results[key]["transcript"]
                ctx.texts = [ctx.text]
        except NlpError as exc:
            errors[key] = {"type": exc.kind, "message": str(exc)}
        except Exception as exc:  # noqa: BLE001
            errors[key] = {"type": "runtime", "message": f"{type(exc).__name__}: {str(exc)[:400]}"}
        durations[key] = int((time.time() - t0) * 1000)

    if not results:
        detail = "; ".join(f"{k}: {v['message']}" for k, v in errors.items())
        raise ValueError(f"NLP: all selected features failed. {detail}")

    ordered = selected_features(cfg)
    ok = [k for k in ordered if k in results]
    failed = [k for k in ordered if k in errors]
    out = {
        "input_text": ctx.text,
        "results": {k: results[k] for k in ok},
        "errors": {k: errors[k] for k in failed},
        "execution_metadata": {
            "status": "partial" if failed else "success",
            "selected_features": ordered,
            "succeeded": ok,
            "failed": failed,
            "duration_ms": int((time.time() - started) * 1000),
            "feature_durations_ms": durations,
        },
    }
    return {
        "current_value": out,
        "data": {**(state.get("data") or {}), "nlp": out},
    }