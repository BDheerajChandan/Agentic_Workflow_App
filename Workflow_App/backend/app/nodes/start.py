# app/nodes/start.py

def start_node(state, config):
    value = state.get("input")
    files = state.get("files") or []

    return {
        "current_value": value,
        "files": files,
        "data": {
            **state.get("data", {}),
            "start": value,
            "start_files": files,
        },
    }