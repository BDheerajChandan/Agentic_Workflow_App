# rag_retrieve.py

from app.rag.vectorstore import vectorStore

def rag_retrieve_node(state, config):

    # question = state.get("input") or state.get("question")
    question = (
    state.get("current_value")
    or state.get("input")
    or state.get("question")
)

    print("\n" + "=" * 60)
    print("🔍 RAG RETRIEVAL STARTED")
    print("=" * 60)

    print(f"❓ Question: {question}")

    results = vectorStore.similarity_search_with_score(
        question,
        k=5
    )

    docs = []
    scores = []

    print("\n📄 Retrieved Chunks:\n")

    for idx, (doc, score) in enumerate(results, start=1):

        confidence = round((1 / (1 + score)) * 100, 2)

        docs.append(doc)
        scores.append(confidence)

        preview = (
            doc.page_content[:250]
            .replace("\n", " ")
        )

        print(f"Chunk #{idx}")
        print(f"Similarity Score : {score:.4f}")
        print(f"Confidence       : {confidence}%")
        print(f"Preview          : {preview}")
        print("-" * 60)

    avg_confidence = (
        round(sum(scores) / len(scores), 2)
        if scores else 0
    )

    print(f"\n🎯 Average Confidence: {avg_confidence}%")

    print("=" * 60 + "\n")

    return {
        **state,
        "current_value": question,
        "question": question,
        "docs": docs,
        "scores": scores,
        "data": {
            **state.get("data", {}),
            "retrieved_docs": len(docs),
            "confidence_scores": scores,
            "average_confidence": avg_confidence
        }
    }