// src/registry/settings/outputSettings.jsx

import React, { useEffect, useState } from "react";
import { listVariables } from "../../services/api";
import { SelectField } from "./fields";
import { fieldWrap, lbl, checkRow, infoStyle, sectionNote } from "./styles";

const MODES = [
  { value: "entire",    label: "Entire Response" },
  { value: "variables", label: "Variables" },
  { value: "nodes",     label: "Node Values" },
];

const listBox = {
  display: "flex", flexDirection: "column", gap: 6,
  maxHeight: 180, overflowY: "auto", paddingRight: 4,
};

export default function OutputSettings({
  localData, patch, flowId, variablesVersion, workflowNodes = [],
}) {
  const display     = localData.display || {};
  const mode        = display.mode || "entire";
  const variableIds = display.variable_ids || [];
  const nodeIds     = display.node_ids || [];

  const [variables, setVariables] = useState([]);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (mode !== "variables") return undefined;
    let cancelled = false;
    setError("");
    listVariables(flowId)
      .then((d) => { if (!cancelled) setVariables(d.variables || []); })
      .catch(() => { if (!cancelled) setError("Failed to load variables."); });
    return () => { cancelled = true; };
  }, [mode, flowId, variablesVersion]);

  const update = (updates) =>
    patch({
      display: { mode, variable_ids: variableIds, node_ids: nodeIds, ...updates },
    });

  const toggle = (list, id) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <>
      <SelectField
        label="Playground Display"
        value={mode}
        onChange={(val) => update({ mode: val })}
        options={MODES}
      />

      {mode === "entire" && (
        <div style={infoStyle}>
          The Playground shows the complete workflow response.
        </div>
      )}

      {mode === "variables" && (
        <div style={fieldWrap}>
          <label style={lbl}>Variables to display</label>
          {error && <div style={infoStyle}>⚠ {error}</div>}
          {!error && variables.length === 0 && (
            <div style={infoStyle}>No variables available.</div>
          )}
          <div style={listBox}>
            {variables.map((v) => (
              <label key={v.variable_id} style={checkRow}>
                <input
                  type="checkbox"
                  checked={variableIds.includes(v.variable_id)}
                  onChange={() =>
                    update({ variable_ids: toggle(variableIds, v.variable_id) })
                  }
                />
                {v.name} ({v.visibility === "private" ? "Private" : "Public"})
              </label>
            ))}
          </div>
          <div style={{ ...sectionNote, marginTop: 8 }}>
            Only the selected variables and their runtime values are shown.
          </div>
        </div>
      )}

      {mode === "nodes" && (
        <div style={fieldWrap}>
          <label style={lbl}>Nodes to display</label>
          {workflowNodes.length === 0 && (
            <div style={infoStyle}>No nodes in this workflow.</div>
          )}
          <div style={listBox}>
            {workflowNodes.map((n) => (
              <label key={n.id} style={checkRow}>
                <input
                  type="checkbox"
                  checked={nodeIds.includes(n.id)}
                  onChange={() => update({ node_ids: toggle(nodeIds, n.id) })}
                />
                {n.type} · {n.id}
              </label>
            ))}
          </div>
          <div style={{ ...sectionNote, marginTop: 8 }}>
            Only the selected nodes' execution values are shown.
          </div>
        </div>
      )}
    </>
  );
}