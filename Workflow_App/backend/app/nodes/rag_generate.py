"""
app/nodes/rag_generate.py
RAG Generate node.
LLM is instantiated lazily inside the node function —
never at module import or application startup time.

Static mode  -> .env OPENAI_API_KEY, model gpt-4o-mini, built-in prompts.
Dynamic mode -> api_key / model_name / user_prompt / system_prompt from node config.
"""

import os
from langchain_core.messages import SystemMessage, HumanMessage

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_SYSTEM_PROMPT = (
    "Answer ONLY from provided context. "
    "If casual greeting, respond human-like."
)


def _get_llm(api_key: str | None = None, model_name: str | None = None):
    """Lazy LLM factory. Raises with a clear message when API key is missing."""
    from langchain_openai import ChatOpenAI
    key = (api_key or "").strip() or os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Please add it to your .env file "
            "or provide an API key in the node's Dynamic settings."
        )
    return ChatOpenAI(
        model=(model_name or DEFAULT_MODEL),
        temperature=0.3,
        api_key=key,
    )


def rag_generate_node(state, config):
    docs     = state.get("docs", [])
    question = (
        state.get("current_value")
        or state.get("question")
        or state.get("input")
    )
    scores   = state.get("scores", [])
    avg_confidence = round(sum(scores) / len(scores), 2) if scores else 0

    # ── Static / Dynamic configuration mode ──────────────────────────────────
    config_mode = str((config or {}).get("config_mode", "static")).strip().lower()

    api_key       = None
    model_name    = DEFAULT_MODEL
    system_prompt = DEFAULT_SYSTEM_PROMPT
    user_prompt   = ""

    if config_mode == "dynamic":
        api_key = str(config.get("api_key", "")).strip()
        if not api_key:
            raise ValueError(
                "RAG Generate node is in Dynamic mode but no API key was provided. "
                "Enter an API key in the node's Settings panel or switch to Static."
            )
        model_name    = str(config.get("model_name", "")).strip() or DEFAULT_MODEL
        system_prompt = str(config.get("system_prompt", "")).strip() or DEFAULT_SYSTEM_PROMPT
        user_prompt   = str(config.get("user_prompt", "")).strip()

    print("\n" + "=" * 60)
    print("🤖 RAG GENERATION STARTED")
    print("=" * 60)
    print(f"❓ Question      : {question}")
    print(f"📄 Docs Used     : {len(docs)}")
    print(f"🎯 Avg Confidence: {avg_confidence}%")
    print(f"🔑 Config mode   : {config_mode}")
    print(f"🧩 Model         : {model_name}")

    context = "\n\n".join([d.page_content for d in docs])

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

    llm      = _get_llm(api_key=api_key, model_name=model_name)
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