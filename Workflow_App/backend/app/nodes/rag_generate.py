"""
app/nodes/rag_generate.py
RAG Generate node.
LLM is instantiated lazily inside the node function —
never at module import or application startup time.
"""

import os
from langchain_core.messages import SystemMessage, HumanMessage


def _get_llm():
    """Lazy LLM factory. Raises with a clear message when API key is missing."""
    from langchain_openai import ChatOpenAI
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Please add it to your .env file."
        )
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.3, api_key=api_key)


def rag_generate_node(state, config):
    docs     = state.get("docs", [])
    question = (
        state.get("current_value")
        or state.get("question")
        or state.get("input")
    )
    scores   = state.get("scores", [])
    avg_confidence = round(sum(scores) / len(scores), 2) if scores else 0

    print("\n" + "=" * 60)
    print("🤖 RAG GENERATION STARTED")
    print("=" * 60)
    print(f"❓ Question      : {question}")
    print(f"📄 Docs Used     : {len(docs)}")
    print(f"🎯 Avg Confidence: {avg_confidence}%")

    context = "\n\n".join([d.page_content for d in docs])

    messages = [
        SystemMessage(
            content=(
                "Answer ONLY from provided context. "
                "If casual greeting, respond human-like.\n\n"
                f"Context:\n{context}"
            )
        ),
        HumanMessage(content=f"Question: {question}"),
    ]

    llm      = _get_llm()
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