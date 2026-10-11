# nodes/type_converter.py

def type_converter_node(state, config):
    """
    Converts the most recent data value in state["data"].
    Reads from "start" key (written by start_node), 
    or falls back to any last available value.
    """
    print("state of type_converter_node : ",state)
    data = state.get("data", {})

    # # Priority: start → converted (chained) → any last value
    # if "start" in data:
    #     value = data["start"]
    # elif "converted" in data:
    #     value = data["converted"]
    # else:
    #     # fallback: last value in data dict
    #     value = list(data.values())[-1] if data else ""
    value = state.get("current_value", "")

    op = config.get("operation", "str")
    
    split_param = config.get("split_param", " ")

    if op == "str":
        result = str(value)
    elif op == "len":
        result = len(str(value))
    elif op == "split":
        if split_param:
            result = str(value).split(split_param)
        else:
            result = str(value).split()
    elif op == "upper":
        result = str(value).upper()
    elif op == "lower":
        result = str(value).lower()
    elif op == "strip":
        result = str(value).strip()
    else:
        result = value

    # return {
    #     "data": {
    #         **data,
    #         "converted": result,
    #     }
    # }
    return {

    "current_value": result,

    "data": {
        **data,
        "converted": result,
    }
}