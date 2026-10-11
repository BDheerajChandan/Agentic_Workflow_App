# rag\ingest.py

from pathlib import Path
from langchain_community.document_loaders import (
    TextLoader,
    PyPDFLoader,
    Docx2txtLoader,
    UnstructuredHTMLLoader
)

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

import os

# =========================
# PATHS
# =========================

BASE_DIR = Path(__file__).resolve().parent.parent.parent
print("BASE_DIR : ",BASE_DIR)
DOCS_DIR = BASE_DIR / "docs"
print("DOCS_DIR : ",DOCS_DIR)
CHROMA_DIR = BASE_DIR / "Chroma_db"
print("CHROMA_DIR : ",CHROMA_DIR)

# =========================
# EMBEDDINGS
# =========================

embeddings = OpenAIEmbeddings(
    api_key=os.getenv("OPENAI_API_KEY")
)

# =========================
# LOAD DOCUMENTS
# =========================

def load_documents():

    docs = []

    print("\n" + "=" * 60)
    print("📂 LOADING DOCUMENTS")
    print("=" * 60)

    if not DOCS_DIR.exists():
        print(f"❌ Docs folder not found: {DOCS_DIR}")
        return docs

    for fp in DOCS_DIR.glob("*"):

        if not fp.is_file():
            continue

        suffix = fp.suffix.lower()

        try:

            if suffix in [".txt", ".md"]:

                loaded = TextLoader(
                    str(fp),
                    encoding="utf-8"
                ).load()

            elif suffix == ".pdf":

                loaded = PyPDFLoader(
                    str(fp)
                ).load()

            elif suffix == ".docx":

                loaded = Docx2txtLoader(
                    str(fp)
                ).load()

            elif suffix == ".html":

                loaded = UnstructuredHTMLLoader(
                    str(fp)
                ).load()

            else:
                print(f"⚠️ Unsupported file skipped: {fp.name}")
                continue

            docs.extend(loaded)

            print(f"✅ Loaded: {fp.name}")

        except Exception as e:
            print(f"❌ Error loading {fp.name}: {e}")

    print(f"\n📄 Total documents loaded: {len(docs)}")

    return docs


# =========================
# CREATE VECTORSTORE
# =========================

def build_vectorstore():

    print("\n" + "=" * 60)
    print("🧠 VECTORSTORE BUILD STARTED")
    print("=" * 60)

    docs = load_documents()

    if not docs:
        print("❌ No documents found")
        return

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100
    )

    chunks = splitter.split_documents(docs)

    print(f"\n📦 Total chunks created: {len(chunks)}")

    vectorstore = Chroma(
        persist_directory=str(CHROMA_DIR),
        collection_name="rag_docs",
        embedding_function=embeddings
    )

    print("\n⚡ Creating embeddings and storing vectors...")

    vectorstore.add_documents(chunks)

    print("✅ Embeddings created successfully")
    print("✅ Vectorization completed successfully")
    print(f"✅ Chroma DB location: {CHROMA_DIR}")

    print("=" * 60 + "\n")