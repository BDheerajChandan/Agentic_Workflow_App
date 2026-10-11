# app/nodes/rag_retrieve.py

from app.rag.retriever import retrieve as dynamic_retrieve


def rag_retrieve_node(state, config):
    question = (
        state.get("current_value")
        or state.get("input")
        or state.get("question")
    )

    source_locality: str = str(config.get("source_locality", "nonlocal")).strip().lower()
    source: str          = str(config.get("source", "")).strip()
    source_type: str     = str(config.get("source_type", "")).strip() or None
    chunk_size: int      = int(config.get("chunk_size", 500))
    chunk_overlap: int   = int(config.get("chunk_overlap", 100))
    k: int               = int(config.get("k", 5))

    if not source:
        raise ValueError(
            "RAG Retrieve node has no source configured. "
            "Set a source (local path or URL) in the node's Settings panel."
        )

    print("\n" + "=" * 60)
    print("🔍 RAG RETRIEVAL STARTED")
    print("=" * 60)
    print(f"❓ Question      : {question}")
    print(f"🗂  Locality      : {source_locality}")
    print(f"📂 Source        : {source}")
    print(f"🔖 Source type   : {source_type or 'auto'}")
    print(f"📐 Chunk size    : {chunk_size}  |  Overlap: {chunk_overlap}  |  k: {k}")

    docs, scores = dynamic_retrieve(
        query=question,
        source=source,
        source_locality=source_locality,
        source_type=source_type,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        k=k,
    )

    avg_confidence = round(sum(scores) / len(scores), 2) if scores else 0

    print("\n📄 Retrieved Chunks:\n")
    for idx, (doc, conf) in enumerate(zip(docs, scores), 1):
        preview = doc.page_content[:250].replace("\n", " ")
        print(f"Chunk #{idx}")
        print(f"Confidence : {conf}%")
        print(f"Preview    : {preview}")
        print("-" * 60)

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
            "average_confidence": avg_confidence,
        },
    }