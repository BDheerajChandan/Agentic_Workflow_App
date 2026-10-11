# graph\state.py

from typing import TypedDict, Any, Dict, Optional, List
from langchain_core.documents import Document


class GraphState(TypedDict, total=False):

    input: Any

    # universal flowing value
    current_value: Any

    data: Dict[str, Any]

    final_output: Any

    # RAG
    question: str
    docs: List[Document]
    scores: List[float]
    answer: str