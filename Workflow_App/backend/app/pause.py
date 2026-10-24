# app/pause.py

from langchain_core.documents import Document


class PauseRequested(Exception):
    """Raised by a node to suspend the run; the router persists a checkpoint and the scheduler resumes it."""

    def __init__(self, node_id, operation, resume_at=None, hold_expires_at=None,
                 on_timeout="fail", info=None):
        self.node_id = node_id
        self.operation = operation
        self.resume_at = resume_at
        self.hold_expires_at = hold_expires_at
        self.on_timeout = on_timeout
        self.info = info or {}
        self.state = None
        self.variables = None
        super().__init__(f"Workflow paused at Time Operation node '{node_id}' ({operation}).")


def to_jsonable(obj):
    import json
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(i) for i in obj]
    if hasattr(obj, "page_content"):
        return {"page_content": obj.page_content, "metadata": to_jsonable(obj.metadata)}
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def revive(obj):
    if isinstance(obj, dict):
        if set(obj.keys()) == {"page_content", "metadata"}:
            return Document(page_content=obj["page_content"], metadata=obj["metadata"] or {})
        return {k: revive(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [revive(i) for i in obj]
    return obj