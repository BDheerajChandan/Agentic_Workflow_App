# rag\vectorstore.py
from pathlib import Path
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
import os

BASE_DIR = Path(__file__).resolve().parent.parent.parent

CHROMA_DIR = BASE_DIR / "Chroma_db"

embeddings = OpenAIEmbeddings(
    api_key=os.getenv("OPENAI_API_KEY")
)

vectorStore = Chroma(
    persist_directory=str(CHROMA_DIR),
    collection_name="rag_docs",
    embedding_function=embeddings
)