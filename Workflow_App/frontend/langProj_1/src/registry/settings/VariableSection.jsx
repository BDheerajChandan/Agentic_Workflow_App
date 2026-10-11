// src/registry/settings/VariableSection.jsx
// Generic Assign / Read variable configuration, rendered at the bottom of every
// variable-capable node's Settings Panel. Stored in node.data.variable.

import React, { useEffect, useState } from "react";
import { listVariables } from "../../services/api";
import { Field, SelectField } from "./fields";
import {
  fieldWrap, lbl, toggle, toggleBtn, variableBox, checkRow, sectionNote, infoBox,
} from "./styles";

const SOURCE_OPTIONS = [
  { value: "node_output", label: "Node Output" },
  { value: "static",      label: "Static Value" },
];

export default function VariableSection({ localData, patch, flowId, variablesVersion }) {
  const cfg     = localData.variable || {};
  const enabled = !!cfg.enabled;
  const mode    = cfg.mode || "assign";
  const source  = cfg.source || "node_output";

  const [variables, setVariables] = useState([]);
  const [loaded,    setLoaded]    = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setError("");
    listVariables(flowId)
      .then((d) => {
        if (!cancelled) { setVariables(d.variables || []); setLoaded(true); }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load variables.");
      });
    return () => { cancelled = true; };
  }, [enabled, flowId, variablesVersion]);

  const update = (updates) => patch({ variable: { ...cfg, ...updates } });

  const selectedId = cfg.variable_id != null ? String(cfg.variable_id) : "";
  const options = [
    { value: "", label: "Select Variable" },
    ...variables.map((v) => ({
      value: String(v.variable_id),
      label: `${v.name} (${v.visibility === "private" ? "Private" : "Public"})`,
    })),
  ];
  if (selectedId && loaded && !variables.some((v) => String(v.variable_id) === selectedId)) {
    options.push({ value: selectedId, label: `⚠ Unavailable (#${selectedId})` });
  }

  return (
    <div style={variableBox}>
      <label style={lbl}>Variable</label>
      <label style={checkRow}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            e.target.checked
              ? update({ enabled: true, mode, source })
              : update({ enabled: false })
          }
        />
        Enable
      </label>

      {enabled && (
        <div style={{ marginTop: 12 }}>
          <div style={fieldWrap}>
            <label style={lbl}>Mode</label>
            <div style={toggle}>
              {["assign", "read"].map((val) => (
                <button
                  key={val}
                  onClick={() => update({ mode: val })}
                  style={{
                    ...toggleBtn,
                    background:  mode === val ? "#0284c7" : "#0f172a",
                    color:       mode === val ? "#fff"    : "#64748b",
                    borderColor: mode === val ? "#0284c7" : "#1e293b",
                  }}
                >
                  {val === "assign" ? "Assign" : "Read"}
                </button>
              ))}
            </div>
          </div>

          <SelectField
            label="Variable"
            value={selectedId}
            onChange={(val) => update({ variable_id: val ? Number(val) : null })}
            options={options}
          />
          {error && <div style={infoBox(true)}>⚠ {error}</div>}

          {mode === "assign" && (
            <>
            <SelectField
                label="Assignment Source"
                value={source}
                onChange={(val) => update({ source: val })}
                options={SOURCE_OPTIONS}
              />
              {source === "node_output" && (
                <div style={sectionNote}>
                  The output produced by this node is stored in the selected variable.
                </div>
              )}
              {source === "static" && (
                <Field
                  label="Static Value"
                  value={cfg.static_value}
                  onChange={(val) => update({ static_value: val })}
                  placeholder="Enter static value…"
                />
              )}
            </>
          )}

          {mode === "read" && (
            <div style={sectionNote}>
              The runtime value of the selected variable is used as this node's input.
            </div>
          )}
        </div>
      )}
    </div>
  );
}