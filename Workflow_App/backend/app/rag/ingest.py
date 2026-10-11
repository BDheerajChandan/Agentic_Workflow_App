"""
app/rag/ingest.py
Builds the default ChromaDB vectorstore from docs/.
OpenAI is only touched inside build_vectorstore(), never at module import time.
build_vectorstore() is safe to call at startup — it skips gracefully when:
  - docs/ is empty
  - OPENAI_API_KEY is missing / invalid
  - OpenAI API is unavailable
"""

from pathlib import Path
import os

BASE_DIR  = Path(__file__).resolve().parent.parent.parent
DOCS_DIR  = BASE_DIR / "docs"
CHROMA_DIR = BASE_DIR / "Chroma_db"


def load_documents():
    """Load all supported documents from docs/. No OpenAI dependency."""
    from langchain_community.document_loaders import (
        TextLoader, PyPDFLoader, Docx2txtLoader, UnstructuredHTMLLoader
    )

    docs = []
    print("\n" + "=" * 60)
    print("📂 LOADING DOCUMENTS")
    print("=" * 60)

    if not DOCS_DIR.exists():
        print(f"⚠️  Docs folder not found: {DOCS_DIR}")
        return docs

    for fp in DOCS_DIR.glob("*"):
        if not fp.is_file():
            continue
        suffix = fp.suffix.lower()
        try:
            if suffix in (".txt", ".md"):
                loaded = TextLoader(str(fp), encoding="utf-8").load()
            elif suffix == ".pdf":
                loaded = PyPDFLoader(str(fp)).load()
            elif suffix == ".docx":
                loaded = Docx2txtLoader(str(fp)).load()
            elif suffix == ".html":
                loaded = UnstructuredHTMLLoader(str(fp)).load()
            else:
                print(f"⚠️  Unsupported file skipped: {fp.name}")
                continue
            docs.extend(loaded)
            print(f"✅ Loaded: {fp.name}")
        except Exception as e:
            print(f"❌ Error loading {fp.name}: {e}")

    print(f"\n📄 Total documents loaded: {len(docs)}")
    return docs


def build_vectorstore():
    """
    Embed docs/ into ChromaDB.
    Skips silently when there are no docs or OpenAI is unavailable —
    the application will still start normally.
    """
    print("\n" + "=" * 60)
    print("🧠 VECTORSTORE BUILD STARTED")
    print("=" * 60)

    docs = load_documents()
    if not docs:
        print("ℹ️  No documents to embed. Skipping vectorstore build.")
        print("=" * 60 + "\n")
        return

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("⚠️  OPENAI_API_KEY not set — skipping vectorstore build.")
        print("    The app will start normally. Add your key and restart to enable RAG.")
        print("=" * 60 + "\n")
        return

    try:
        from langchain_openai import OpenAIEmbeddings
        from langchain_chroma import Chroma
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
        chunks = splitter.split_documents(docs)
        print(f"\n📦 Total chunks created: {len(chunks)}")

        embeddings = OpenAIEmbeddings(api_key=api_key)

        vectorstore = Chroma(
            persist_directory=str(CHROMA_DIR),
            collection_name="rag_docs",
            embedding_function=embeddings,
        )
        vectorstore.add_documents(chunks)

        print("✅ Embeddings created and stored successfully.")
        print(f"✅ Chroma DB location: {CHROMA_DIR}")

    except Exception as e:
        print(f"⚠️  Vectorstore build failed: {e}")
        print("    The app will start normally. RAG nodes will show this error when used.")

    print("=" * 60 + "\n")