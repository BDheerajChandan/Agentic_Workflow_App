"""
app/rag/vectorstore.py
Lazy vectorstore accessor.
OpenAI embeddings are NOT initialised at import time.
Call get_vectorstore() only when an actual retrieval is needed.
"""

from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CHROMA_DIR = BASE_DIR / "Chroma_db"

_vectorStore = None


def get_vectorstore():
    """Return (and cache) the default ChromaDB vectorstore. Lazy — safe to import."""
    global _vectorStore
    if _vectorStore is None:
        from langchain_chroma import Chroma
        from langchain_openai import OpenAIEmbeddings
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Please add it to your .env file."
            )
        _vectorStore = Chroma(
            persist_directory=str(CHROMA_DIR),
            collection_name="rag_docs",
            embedding_function=OpenAIEmbeddings(api_key=api_key),
        )
    return _vectorStore