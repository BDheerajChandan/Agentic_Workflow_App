# # nodes\start.py

# def start_node(state, config):
#     print("state of start_node : ",state)
#     return {
#         "data": {
#             **state.get("data", {}),
#             "start": state["input"]
#         }
#     }

def start_node(state, config):

    print("state of start_node : ", state)

    value = state.get("input")

    return {

        "current_value": value,

        "data": {
            **state.get("data", {}),
            "start": value,
        }
    }