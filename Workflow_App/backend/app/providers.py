# app/providers.py

from __future__ import annotations

import os

import requests

PROVIDERS = ("openai", "gemini")
DEFAULT_PROVIDER = "openai"

ENV_KEYS = {"openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY"}
DEFAULT_CHAT_MODELS = {"openai": "gpt-4o-mini", "gemini": "gemini-2.5-flash"}
DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"

GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"

_OPENAI_CHAT_PREFIXES = ("gpt-", "chatgpt-", "o1", "o3", "o4")
_OPENAI_CHAT_EXCLUDE = (
    "embedding", "audio", "realtime", "image", "tts", "whisper",
    "transcribe", "moderation", "search", "instruct", "codex",
)


def normalize_provider(value) -> str:
    provider = str(value or "").strip().lower() or DEFAULT_PROVIDER
    if provider not in PROVIDERS:
        raise ValueError(
            f"Unsupported provider: {provider!r}. Supported: {', '.join(PROVIDERS)}."
        )
    return provider


def get_env_key(provider: str) -> str:
    return os.getenv(ENV_KEYS[provider], "").strip()


def resolve_api_key(provider: str, api_key: str | None = None) -> str:
    key = (api_key or "").strip() or get_env_key(provider)
    if not key:
        raise RuntimeError(
            f"{ENV_KEYS[provider]} is not set. Please add it to your .env file "
            "or provide an API key in the node's Dynamic settings."
        )
    return key


# ─── Model discovery ──────────────────────────────────────────────────────────

def get_openai_models(api_key: str, purpose: str = "chat") -> list[str]:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    ids = sorted({m.id for m in client.models.list().data})
    if purpose == "embedding":
        return [i for i in ids if "embedding" in i]
    return [
        i for i in ids
        if i.startswith(_OPENAI_CHAT_PREFIXES)
        and not any(x in i for x in _OPENAI_CHAT_EXCLUDE)
    ]


def get_gemini_models(api_key: str, purpose: str = "chat") -> list[str]:
    method = "embedContent" if purpose == "embedding" else "generateContent"
    names: set[str] = set()
    token: str | None = None
    while True:
        params: dict = {"pageSize": 1000}
        if token:
            params["pageToken"] = token
        resp = requests.get(
            GEMINI_MODELS_URL,
            headers={"x-goog-api-key": api_key},
            params=params,
            timeout=20,
        )
        if resp.status_code >= 400:
            try:
                msg = resp.json().get("error", {}).get("message") or resp.text
            except Exception:
                msg = resp.text
            raise RuntimeError(msg)
        body = resp.json()
        for m in body.get("models", []):
            if method in m.get("supportedGenerationMethods", []):
                names.add(m["name"].removeprefix("models/"))
        token = body.get("nextPageToken")
        if not token:
            break
    return sorted(names)


def list_models(provider: str, api_key: str, purpose: str = "chat") -> list[str]:
    if provider == "gemini":
        return get_gemini_models(api_key, purpose)
    return get_openai_models(api_key, purpose)


# ─── Runtime factories ────────────────────────────────────────────────────────

def build_embeddings(provider: str, api_key: str | None = None, model: str | None = None):
    provider = normalize_provider(provider)
    key = resolve_api_key(provider, api_key)
    model = (model or "").strip()

    if provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        name = model or DEFAULT_GEMINI_EMBEDDING_MODEL
        if not name.startswith("models/"):
            name = f"models/{name}"
        return GoogleGenerativeAIEmbeddings(model=name, google_api_key=key, transport="rest")

    from langchain_openai import OpenAIEmbeddings

    if model:
        return OpenAIEmbeddings(model=model, api_key=key)
    return OpenAIEmbeddings(api_key=key)


def build_chat_model(
    provider: str,
    api_key: str | None = None,
    model: str | None = None,
    temperature: float = 0.3,
):
    provider = normalize_provider(provider)
    key = resolve_api_key(provider, api_key)
    name = (model or "").strip() or DEFAULT_CHAT_MODELS[provider]

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=name, temperature=temperature, google_api_key=key, transport="rest"
        )

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=name, temperature=temperature, api_key=key)