# rag_generate.py

from langchain_openai import ChatOpenAI
from langchain_core.messages import (
    SystemMessage,
    HumanMessage
)

llm = ChatOpenAI(
    model="gpt-3.5-turbo",
    temperature=0.3
)

def rag_generate_node(state, config):

    docs = state.get("docs", [])

    # question = (
    #     state.get("question")
    #     or state.get("input")
    # )
    question = (
    state.get("current_value")
    or state.get("question")
    or state.get("input")
)

    scores = state.get("scores", [])

    avg_confidence = (
        round(sum(scores) / len(scores), 2)
        if scores else 0
    )

    print("\n" + "=" * 60)
    print("🤖 RAG GENERATION STARTED")
    print("=" * 60)

    print(f"❓ Question: {question}")
    print(f"📄 Docs Used: {len(docs)}")
    print(f"🎯 Avg Confidence: {avg_confidence}%")

    context = "\n\n".join([
        d.page_content for d in docs
    ])

    messages = [
        SystemMessage(
            content=(
                "Answer ONLY from provided context. If casual greeting type the respond human like\n\n"
                f"Context:\n{context}"
            )
        ),
        HumanMessage(
            content=f"Question: {question}"
        )
    ]

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
            "documents_used": len(docs)
        },
        "data": {
            **state.get("data", {}),
            "answer": response.content,
            "confidence": avg_confidence,
            "documents_used": len(docs)
        }
    }