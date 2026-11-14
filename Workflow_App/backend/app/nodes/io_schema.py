# app/nodes/io_schema.py
# Single source of truth for each node's mappable inputs and outputs.
# Add an entry here to make a new node type mappable; unlisted nodes use the default.

from __future__ import annotations


def _docs_text(result: dict):
    docs = result.get("docs") or []
    return "\n\n".join(d.page_content for d in docs)

def _cv_path(*path):
    """Resolve a nested key/index path inside result['current_value'] (used by JSON-returning nodes)."""
    def resolve(r):
        cur = r.get("current_value")
        for key in path:
            if isinstance(key, int):
                if not isinstance(cur, (list, tuple)) or key >= len(cur):
                    return None
                cur = cur[key]
            else:
                if not isinstance(cur, dict):
                    return None
                cur = cur.get(key)
        return cur
    return resolve

def _data_path(*path):
    """Resolve a nested key path inside result['data']."""
    def resolve(r):
        cur = r.get("data")
        for key in path:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
        return cur
    return resolve

_NLP_INPUTS = [
    {"key": "text",      "label": "Input Text",            "state_key": "current_value"},
    {"key": "documents", "label": "Documents / Text List", "state_key": "nlp_documents", "transient": True},
    {"key": "context",   "label": "Context",               "state_key": "nlp_context",   "transient": True},
    {"key": "question",  "label": "Question",              "state_key": "nlp_question",  "transient": True},
    {"key": "audio",     "label": "Audio File(s)",         "state_key": "nlp_audio",    "transient": True},
]


def _nlp_fixed():
    return [
        {"key": "result",     "label": "Full Response (JSON)", "resolve": lambda r: r.get("current_value")},
        {"key": "input_text", "label": "Input Text",           "resolve": _cv_path("input_text")},
        {"key": "metadata",   "label": "Execution Metadata",   "resolve": _cv_path("execution_metadata")},
        {"key": "errors",     "label": "Feature Errors",       "resolve": _cv_path("errors")},
    ]


def _nlp_io(config):
    from app.nlp.registry import LABELS, selected_features
    outs = _nlp_fixed()
    for f in selected_features(config):
        outs.append({"key": f, "label": LABELS[f], "resolve": _cv_path("results", f)})
    return {"inputs": _NLP_INPUTS, "outputs": outs}

NODE_IO: dict[str, dict] = {
    "start": {
        "inputs": [
            {"key": "input", "label": "Start Input", "state_key": "input"},
        ],
        "outputs": [
            {"key": "output", "label": "Start Output", "resolve": lambda r: r.get("current_value")},
            {"key": "files", "label": "Uploaded Files", "resolve": lambda r: r.get("files")},
        ],
    },
    "type_converter": {
        "inputs": [
            {"key": "value", "label": "Value to Convert", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "converted", "label": "Converted Value", "resolve": lambda r: r.get("current_value")},
            {
                "key": "converted_type",
                "label": "Converted Type",
                "resolve": lambda r: (r.get("data") or {}).get("converted_type"),
            },
        ],
    },
    "output": {
        "inputs": [
            {"key": "value", "label": "Output Value", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "final_output", "label": "Final Output", "resolve": lambda r: r.get("final_output")},
        ],
    },
    "rag_retrieve": {
        "inputs": [
            {"key": "question", "label": "Question / Query", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "documents", "label": "Retriever Output", "resolve": _docs_text},
            {
                "key": "average_confidence",
                "label": "Average Confidence",
                "resolve": lambda r: (r.get("data") or {}).get("average_confidence"),
            },
        ],
    },
    "rag_generate": {
        "inputs": [
            {"key": "question", "label": "Question", "state_key": "current_value"},
            {"key": "context", "label": "Context", "state_key": "variable_context", "transient": True},
        ],
        "outputs": [
            {"key": "answer", "label": "Generate Answer", "resolve": lambda r: r.get("current_value")},
            {
                "key": "confidence",
                "label": "Confidence",
                "resolve": lambda r: (r.get("data") or {}).get("confidence"),
            },
        ],
    },

        "base64": {
        "inputs": [
            {"key": "value", "label": "Input Text", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "result", "label": "Encoded / Decoded Text", "resolve": lambda r: r.get("current_value")},
        ],
    },
    "geo_temperature": {
        "inputs": [
            {"key": "latitude",  "label": "Latitude",  "state_key": "geo_latitude",  "transient": True},
            {"key": "longitude", "label": "Longitude", "state_key": "geo_longitude", "transient": True},
        ],
        "outputs": [
            {"key": "weather",     "label": "Full Response (JSON)",  "resolve": lambda r: r.get("current_value")},
            {"key": "temperature", "label": "Current Temperature °C", "resolve": _cv_path("data", "current", "temperature_c")},
            {"key": "wind_speed",  "label": "Current Wind Speed",    "resolve": _cv_path("data", "current", "wind_speed")},
            {"key": "location",    "label": "Location",              "resolve": _cv_path("data", "location", "display")},
        ],
    },
    "geo_location": {
        "inputs": [
            {"key": "location_name", "label": "Location Name / Address", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "location",     "label": "Full Response (JSON)", "resolve": lambda r: r.get("current_value")},
            {"key": "latitude",     "label": "Latitude",             "resolve": _cv_path("data", "latitude")},
            {"key": "longitude",    "label": "Longitude",            "resolve": _cv_path("data", "longitude")},
            {"key": "display_name", "label": "Display Name",         "resolve": _cv_path("data", "display_name")},
        ],
    },
    "python_functions": {
        "inputs": [
            {"key": "inputs", "label": "Inputs", "state_key": "python_inputs", "transient": True},
        ],
        "outputs": [
            {"key": "result", "label": "Function Result", "resolve": lambda r: r.get("current_value")},
            {"key": "stdout", "label": "Captured Stdout", "resolve": _data_path("python_stdout")},
        ],
    },
    "time_operation": {
        "inputs": [
            {"key": "value", "label": "Pass-through Value", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "value", "label": "Pass-through Value", "resolve": lambda r: r.get("current_value")},
            {"key": "status", "label": "Wait Status", "resolve": _data_path("time_operation", "status")},
            {"key": "elapsed_seconds", "label": "Elapsed Seconds", "resolve": _data_path("time_operation", "elapsed_seconds")},
            {"key": "completed_at", "label": "Completed At", "resolve": _data_path("time_operation", "completed_at")},
        ],
    },
    "file_reader": {
        "inputs": [
            {"key": "files", "label": "File Reference(s)", "state_key": "file_input", "transient": True},
        ],
        "outputs": [
            {"key": "content",  "label": "Content",           "resolve": _cv_path("content")},
            {"key": "metadata", "label": "Metadata",          "resolve": _cv_path("metadata")},
            {"key": "results",  "label": "Structured Results", "resolve": _cv_path("results")},
            {"key": "language", "label": "Language",          "resolve": _cv_path("language")},
            {"key": "result",   "label": "Full Result (JSON)", "resolve": lambda r: r.get("current_value")},
        ],
    },
    "hitl": {
        "inputs": [
            {"key": "value", "label": "Input Value", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "result",      "label": "Full Result (JSON)", "resolve": lambda r: r.get("current_value")},
            {"key": "status",      "label": "Status",             "resolve": _cv_path("status")},
            {"key": "values",      "label": "Original Values",    "resolve": _cv_path("values")},
            {"key": "suggestions", "label": "Suggestions",        "resolve": _cv_path("suggestions")},
            {"key": "responses",   "label": "Responses",          "resolve": _cv_path("responses")},
        ],
    },
        "if_else": {
        "inputs": [
            {"key": "value", "label": "Input Value", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "result",  "label": "Pass-through Value",   "resolve": lambda r: r.get("current_value")},
            {"key": "matched", "label": "Matched (True/False)", "resolve": _data_path("if_else", "matched")},
            {"key": "branch",  "label": "Branch",               "resolve": _data_path("if_else", "branch")},
        ],
    },
    "switch": {
        "inputs": [
            {"key": "value", "label": "Switch Input", "state_key": "current_value"},
        ],
        "outputs": [
            {"key": "result",       "label": "Input Value",  "resolve": lambda r: r.get("current_value")},
            {"key": "matched",      "label": "Matched",      "resolve": _data_path("switch", "matched")},
            {"key": "matched_case", "label": "Matched Case", "resolve": _data_path("switch", "matched_case")},
            {"key": "branch",       "label": "Branch",       "resolve": _data_path("switch", "branch")},
            {"key": "label",        "label": "Branch Label", "resolve": _data_path("switch", "label")},
        ],
    },
        "aqi": {
        "inputs": [
            {"key": "country", "label": "Country",         "state_key": "aqi_country", "transient": True},
            {"key": "state",   "label": "State",           "state_key": "aqi_state",   "transient": True},
            {"key": "city",    "label": "City / District", "state_key": "aqi_city",    "transient": True},
        ],
        "outputs": [
            {"key": "result",      "label": "Full Response (JSON)",  "resolve": lambda r: r.get("current_value")},
            {"key": "aqi",         "label": "AQI",                   "resolve": _cv_path("aqi")},
            {"key": "category",    "label": "Air Quality Category",  "resolve": _cv_path("category")},
            {"key": "pm25",        "label": "PM2.5",                 "resolve": _cv_path("pollutants", "pm25", "value")},
            {"key": "pm10",        "label": "PM10",                  "resolve": _cv_path("pollutants", "pm10", "value")},
            {"key": "co",          "label": "Carbon Monoxide",       "resolve": _cv_path("pollutants", "co", "value")},
            {"key": "no2",         "label": "Nitrogen Dioxide",      "resolve": _cv_path("pollutants", "no2", "value")},
            {"key": "so2",         "label": "Sulfur Dioxide",        "resolve": _cv_path("pollutants", "so2", "value")},
            {"key": "o3",          "label": "Ozone",                 "resolve": _cv_path("pollutants", "o3", "value")},
            {"key": "temperature", "label": "Temperature °C",        "resolve": _cv_path("weather", "temperature_c")},
            {"key": "humidity",    "label": "Humidity %",            "resolve": _cv_path("weather", "humidity_pct")},
            {"key": "wind_speed",  "label": "Wind Speed",            "resolve": _cv_path("weather", "wind_speed")},
            {"key": "url",         "label": "Source URL",            "resolve": _cv_path("url")},
            {"key": "files",       "label": "Downloaded Files",      "resolve": _cv_path("download", "files")},
        ],
    },
    "nlp": {
        "dynamic": _nlp_io,
        "inputs": _NLP_INPUTS,
        "outputs": _nlp_fixed(),
    },
        "search_urls": {
        "inputs": [
            {"key": "query", "label": "Search Query",     "state_key": "search_query", "transient": True},
            {"key": "regex", "label": "URL Regex Filter", "state_key": "search_regex", "transient": True},
        ],
        "outputs": [
            {"key": "result",         "label": "Full Response (JSON)", "resolve": lambda r: r.get("current_value")},
            {"key": "results",        "label": "Results (array)",      "resolve": _cv_path("results")},
            {"key": "urls",           "label": "URLs (array)",         "resolve": _cv_path("urls")},
            {"key": "first_url",      "label": "First URL",            "resolve": _cv_path("urls", 0)},
            {"key": "query",          "label": "Query",                "resolve": _cv_path("query")},
            {"key": "provider",       "label": "Provider",             "resolve": _cv_path("provider")},
            {"key": "requested_count", "label": "Requested Count",     "resolve": _cv_path("requested_count")},
            {"key": "returned_count", "label": "Returned Count",       "resolve": _cv_path("returned_count")},
            {"key": "status",         "label": "Status",               "resolve": _cv_path("status")},
            {"key": "message",        "label": "Message",              "resolve": _cv_path("message")},
        ],
    },
}

_DEFAULT_IO: dict = {
    "inputs": [
        {"key": "value", "label": "Input Value", "state_key": "current_value"},
    ],
    "outputs": [
        {"key": "output", "label": "Node Output", "resolve": lambda r: r.get("current_value")},
    ],
}


def get_node_io(node_type: str | None, config: dict | None = None) -> dict:
    io = NODE_IO.get(node_type or "", _DEFAULT_IO)
    dynamic = io.get("dynamic")
    if dynamic is not None:
        try:
            return dynamic(config or {})
        except Exception:
            return io
    return io


def find_input(node_type: str | None, key: str, config: dict | None = None) -> dict | None:
    return next((i for i in get_node_io(node_type, config)["inputs"] if i["key"] == key), None)


def find_output(node_type: str | None, key: str, config: dict | None = None) -> dict | None:
    return next((o for o in get_node_io(node_type, config)["outputs"] if o["key"] == key), None)


def _public(io: dict) -> dict:
    return {
        "inputs":  [{"key": i["key"], "label": i["label"]} for i in io["inputs"]],
        "outputs": [{"key": o["key"], "label": o["label"]} for o in io["outputs"]],
    }


def public_node_io() -> dict:
    return {
        "nodes":   {t: _public(io) for t, io in NODE_IO.items()},
        "default": _public(_DEFAULT_IO),
        "dynamic": [t for t, io in NODE_IO.items() if io.get("dynamic")],
    }


def public_io_for(node_type: str | None, config: dict | None = None) -> dict:
    return _public(get_node_io(node_type, config))



def primary_value(node_type: str | None, result) -> object:
    """The node's primary output value (first declared output), used for display/history."""
    if not isinstance(result, dict):
        return None
    try:
        return get_node_io(node_type)["outputs"][0]["resolve"](result)
    except Exception:
        return None