"""
app/nodes/rag_generate.py
RAG Generate node.
LLM is instantiated lazily inside the node function —
never at module import or application startup time.

Static mode  -> provider key from .env (OPENAI_API_KEY / GEMINI_API_KEY), selected provider/model.
Dynamic mode -> api_key / provider / model_name / user_prompt / system_prompt from node config.
"""

from langchain_core.messages import SystemMessage, HumanMessage

from app.providers import DEFAULT_CHAT_MODELS, build_chat_model, normalize_provider

DEFAULT_MODEL = DEFAULT_CHAT_MODELS["openai"]
DEFAULT_SYSTEM_PROMPT = (
    "Answer ONLY from provided context. "
    "If casual greeting, respond human-like."
)


def _get_llm(provider: str = "openai", api_key: str | None = None, model_name: str | None = None):
    """Lazy LLM factory. Raises with a clear message when API key is missing."""
    return build_chat_model(provider, api_key, model_name, temperature=0.3)


def rag_generate_node(state, config):
    cfg      = config or {}
    docs     = state.get("docs", [])
    question = (
        state.get("current_value")
        or state.get("question")
        or state.get("input")
    )
    scores   = state.get("scores", [])
    avg_confidence = round(sum(scores) / len(scores), 2) if scores else 0

    # ── Static / Dynamic configuration mode ──────────────────────────────────
    config_mode = str(cfg.get("config_mode", "static")).strip().lower()
    provider    = normalize_provider(cfg.get("provider"))
    model_name  = str(cfg.get("model_name", "")).strip() or DEFAULT_CHAT_MODELS[provider]

    api_key       = None
    system_prompt = DEFAULT_SYSTEM_PROMPT
    user_prompt   = ""

    if config_mode == "dynamic":
        api_key = str(cfg.get("api_key", "")).strip()
        if not api_key:
            raise ValueError(
                "RAG Generate node is in Dynamic mode but no API key was provided. "
                "Enter an API key in the node's Settings panel or switch to Static."
            )
        system_prompt = str(cfg.get("system_prompt", "")).strip() or DEFAULT_SYSTEM_PROMPT
        user_prompt   = str(cfg.get("user_prompt", "")).strip()

    print("\n" + "=" * 60)
    print("🤖 RAG GENERATION STARTED")
    print("=" * 60)
    print(f"❓ Question      : {question}")
    print(f"📄 Docs Used     : {len(docs)}")
    print(f"🎯 Avg Confidence: {avg_confidence}%")
    print(f"🔑 Config mode   : {config_mode}")
    print(f"🏷  Provider      : {provider}")
    print(f"🧩 Model         : {model_name}")

    override = state.get("variable_context")
    context = (
        str(override)
        if override is not None
        else "\n\n".join([d.page_content for d in docs])
    )

    if user_prompt:
        if "{question}" in user_prompt:
            human_content = user_prompt.replace("{question}", str(question))
        else:
            human_content = f"{user_prompt}\n\nQuestion: {question}"
    else:
        human_content = f"Question: {question}"

    messages = [
        SystemMessage(
            content=(
                f"{system_prompt}\n\n"
                f"Context:\n{context}"
            )
        ),
        HumanMessage(content=human_content),
    ]

    llm      = _get_llm(provider=provider, api_key=api_key, model_name=model_name)
    response = llm.invoke(messages)

    print("\n💡 GENERATED ANSWER:\n")
    print(response.content)
    print("\n" + "=" * 60 + "\n")

    return {
        **state,
        "current_value": response.content,
        "answer": response.content,
        "final_output": {
            "answer": response.content,
            "confidence": avg_confidence,
            "documents_used": len(docs),
        },
        "data": {
            **state.get("data", {}),
            "answer": response.content,
            "confidence": avg_confidence,
            "documents_used": len(docs),
        },
    }