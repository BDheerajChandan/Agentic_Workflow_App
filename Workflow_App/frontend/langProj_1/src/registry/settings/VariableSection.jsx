// src/registry/settings/VariableSection.jsx
// Generic Input / Output Value Mapping, rendered at the bottom of every
// variable-capable node's Settings Panel. Stored in node.data.variable:
// { enabled, input_mapping: {enabled, variable_id, target},
//            output_mapping: {enabled, variable_id, source, output, static_value} }

import React, { useEffect, useState } from "react";
import { getNodeIO, listVariables } from "../../services/api";
import { Field, SelectField } from "./fields";
import { lbl, variableBox, checkRow, sectionNote, infoBox, mappingBox } from "./styles";

const SOURCE_OPTIONS = [
  { value: "node_output", label: "Node Output" },
  { value: "static",      label: "Static Value" },
];

let ioPromise = null;
const loadNodeIO = () => {
  if (!ioPromise) {
    ioPromise = getNodeIO().catch((e) => {
      ioPromise = null;
      throw e;
    });
  }
  return ioPromise;
};

// Accepts both the new shape and the legacy {mode, variable_id, source, static_value} shape.
function normalize(cfg, io) {
  if (cfg.input_mapping || cfg.output_mapping || !cfg.mode || !io) {
    return {
      enabled: !!cfg.enabled,
      input_mapping:  cfg.input_mapping  || { enabled: false },
      output_mapping: cfg.output_mapping || { enabled: false },
    };
  }
  if (cfg.mode === "read") {
    return {
      enabled: !!cfg.enabled,
      input_mapping: { enabled: true, variable_id: cfg.variable_id, target: io.inputs[0]?.key },
      output_mapping: { enabled: false },
    };
  }
  return {
    enabled: !!cfg.enabled,
    input_mapping: { enabled: false },
    output_mapping: {
      enabled: true,
      variable_id: cfg.variable_id,
      source: cfg.source || "node_output",
      output: io.outputs[0]?.key,
      static_value: cfg.static_value,
    },
  };
}

export default function VariableSection({ localData, nodeType, patch, flowId, variablesVersion }) {
  const [nodeIO,    setNodeIO]    = useState(null);
  const [variables, setVariables] = useState([]);
  const [loaded,    setLoaded]    = useState(false);
  const [error,     setError]     = useState("");

  const io  = nodeIO ? (nodeIO.nodes[nodeType] || nodeIO.default) : null;
  const cfg = normalize(localData.variable || {}, io);
  const enabled = cfg.enabled;
  const im = cfg.input_mapping;
  const om = cfg.output_mapping;
  const source = om.source || "node_output";

  useEffect(() => {
    let cancelled = false;
    loadNodeIO()
      .then((d) => { if (!cancelled) setNodeIO(d); })
      .catch(() => { if (!cancelled) setError("Failed to load node inputs/outputs."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    listVariables(flowId)
      .then((d) => {
        if (!cancelled) { setVariables(d.variables || []); setLoaded(true); }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load variables.");
      });
    return () => { cancelled = true; };
  }, [enabled, flowId, variablesVersion]);

  const update    = (updates) => patch({ variable: { ...cfg, ...updates } });
  const updateIn  = (u) => update({ input_mapping:  { ...im, ...u } });
  const updateOut = (u) => update({ output_mapping: { ...om, ...u } });

  const varOptions = (selectedId) => {
    const opts = [
      { value: "", label: "Select Variable" },
      ...variables.map((v) => ({
        value: String(v.variable_id),
        label: `${v.name} (${v.visibility === "private" ? "Private" : "Public"})`,
      })),
    ];
    if (selectedId && loaded && !variables.some((v) => String(v.variable_id) === selectedId)) {
      opts.push({ value: selectedId, label: `⚠ Unavailable (#${selectedId})` });
    }
    return opts;
  };

  const varName = (id) => {
    const v = variables.find((x) => String(x.variable_id) === String(id));
    return v ? v.name : "variable";
  };

  const inputOptions  = (io?.inputs  || []).map((i) => ({ value: i.key, label: i.label }));
  const outputOptions = (io?.outputs || []).map((o) => ({ value: o.key, label: o.label }));
  const labelOf = (opts, key) => opts.find((o) => o.value === key)?.label || "—";

  const inVarId  = im.variable_id != null ? String(im.variable_id) : "";
  const outVarId = om.variable_id != null ? String(om.variable_id) : "";

  return (
    <div style={variableBox}>
      <label style={lbl}>Variables</label>
      <label style={checkRow}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        Enable
      </label>

      {error && <div style={infoBox(true)}>⚠ {error}</div>}

      {enabled && (
        <>
          {/* ── Input Value Mapping ───────────────────────────────────── */}
          <div style={mappingBox}>
            <label style={lbl}>Input Value Mapping</label>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={!!im.enabled}
                disabled={!io}
                onChange={(e) =>
                  e.target.checked
                    ? updateIn({ enabled: true, target: im.target || io.inputs[0]?.key })
                    : updateIn({ enabled: false })
                }
              />
              Enable
            </label>

            {im.enabled && (
              <div style={{ marginTop: 12 }}>
                <SelectField
                  label="Variable"
                  value={inVarId}
                  onChange={(val) => updateIn({ variable_id: val ? Number(val) : null })}
                  options={varOptions(inVarId)}
                />
                <SelectField
                  label="Target Input"
                  value={im.target || ""}
                  onChange={(val) => updateIn({ target: val })}
                  options={inputOptions}
                />
                <div style={sectionNote}>
                  Mapping: {inVarId ? varName(inVarId) : "Variable"} → {labelOf(inputOptions, im.target)}
                </div>
              </div>
            )}
          </div>

          {/* ── Output Value Mapping ──────────────────────────────────── */}
          <div style={mappingBox}>
            <label style={lbl}>Output Value Mapping</label>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={!!om.enabled}
                disabled={!io}
                onChange={(e) =>
                  e.target.checked
                    ? updateOut({
                        enabled: true,
                        source,
                        output: om.output || io.outputs[0]?.key,
                      })
                    : updateOut({ enabled: false })
                }
              />
              Enable
            </label>

            {om.enabled && (
              <div style={{ marginTop: 12 }}>
                <SelectField
                  label="Variable"
                  value={outVarId}
                  onChange={(val) => updateOut({ variable_id: val ? Number(val) : null })}
                  options={varOptions(outVarId)}
                />
                <SelectField
                  label="Source"
                  value={source}
                  onChange={(val) => updateOut({ source: val })}
                  options={SOURCE_OPTIONS}
                />
                {source === "node_output" && (
                  <SelectField
                    label="Source Output"
                    value={om.output || ""}
                    onChange={(val) => updateOut({ output: val })}
                    options={outputOptions}
                  />
                )}
                {source === "static" && (
                  <Field
                    label="Value"
                    value={om.static_value}
                    onChange={(val) => updateOut({ static_value: val })}
                    placeholder="Enter static value…"
                  />
                )}
                <div style={sectionNote}>
                  Mapping:{" "}
                  {source === "static" ? "Static Value" : labelOf(outputOptions, om.output)} →{" "}
                  {outVarId ? varName(outVarId) : "Variable"}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}