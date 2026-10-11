# nodes/output.py

def output_node(state, config):
    """
    Terminal node — surfaces state data as final_output.
    Prioritizes 'converted' value if present, else full data dict.
    """
    print("state of output_node : ",state)
    data = state.get("data", {})

    # return {
    #     "data": data,
    #     "final_output": data.get("converted", data.get("start", data)),
    # }
    return {

    "data": data,

    "final_output": state.get(
        "current_value",
        data
    ),
}