// src/utils/outputDisplay.js
// Output Node display configuration -> what the Playground shows.
// Config lives in the Output node: node.data.display = { mode, variable_ids, node_ids }

import { listVariables } from "../services/api";

export async function buildOutputDisplay({ nodes, flowId, result, traces }) {
  const outputNode = nodes.find((n) => n.type === "output");
  const display = outputNode?.data?.display;
  const mode = display?.mode || "entire";

  if (mode === "variables") {
    const ids = display.variable_ids || [];
    if (!ids.length) return "No variables selected in the Output node settings.";

    const { variables: defs } = await listVariables(flowId);
    const runtime = result?.variables || {};
    const out = {};
    ids.forEach((id) => {
      const def = defs.find((d) => d.variable_id === id);
      if (!def) {
        out[`#${id}`] = "(variable no longer exists)";
        return;
      }
      const key = def.name in runtime ? def.name : `${def.name} (${def.visibility})`;
      out[def.name] = key in runtime ? runtime[key] : "(not assigned in this run)";
    });
    return out;
  }

  if (mode === "nodes") {
    const ids = display.node_ids || [];
    if (!ids.length) return "No nodes selected in the Output node settings.";

    const out = {};
    ids.forEach((id) => {
      const node = nodes.find((n) => n.id === id);
      const label = `${id} (${node?.type || "unknown"})`;
      const trace = [...traces].reverse().find((t) => t.node_id === id);
      if (!trace) out[label] = "(not executed)";
      else if (trace.status === "failed") out[label] = { error: trace.error };
      else out[label] = trace.value !== undefined && trace.value !== null ? trace.value : trace.output;
    });
    return out;
  }

  return result;
}