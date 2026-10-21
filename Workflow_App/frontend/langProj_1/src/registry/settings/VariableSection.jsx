// src/registry/settings/VariableSection.jsx
// Generic Input / Output Value Mapping (single or multiple), rendered at the bottom of every
// variable-capable node's Settings Panel. Stored in node.data.variable using binding dictionaries:
//   input_mapping:  { enabled, bindings: { "<target input key>": { variable_id } },            order: [keys] }
//   output_mapping: { enabled, bindings: { "<variable_id>": { source, output|static_value } }, order: [keys] }
// One key = single mapping, n keys = multiple. `order` (an array) preserves execution order.
// The legacy flat single-mapping shape is still read and treated as a one-key dictionary.

import React, { useEffect, useState } from "react";
import { getNodeIO, listVariables } from "../../services/api";
import { Field, SelectField } from "./fields";
import {
  lbl, variableBox, checkRow, sectionNote, infoBox, mappingBox,
  rowBox, rowHead, miniBtn, miniBtnDanger, miniBtnDisabled,
} from "./styles";

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

// ── binding dictionary <-> row array helpers ────────────────────────────────
function orderedKeys(bindings, order) {
  const seen = new Set();
  const keys = [];
  (Array.isArray(order) ? order : []).forEach((k) => {
    if (k in bindings && !seen.has(k)) { seen.add(k); keys.push(k); }
  });
  Object.keys(bindings).forEach((k) => {
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  });
  return keys;
}

function inputRows(m) {
  if (m && m.bindings && typeof m.bindings === "object") {
    return orderedKeys(m.bindings, m.order).map((k) => ({
      target: k,
      variable_id: m.bindings[k]?.variable_id ?? null,
    }));
  }
  return [{ target: m?.target || "", variable_id: m?.variable_id ?? null }];
}

const toInputMapping = (enabled, rows) => ({
  enabled,
  bindings: Object.fromEntries(rows.map((r) => [r.target, { variable_id: r.variable_id }])),
  order: rows.map((r) => r.target),
});

function outputRows(m) {
  if (m && m.bindings && typeof m.bindings === "object") {
    return orderedKeys(m.bindings, m.order).map((k) => {
      const b = m.bindings[k] || {};
      return {
        variable_id: k === "" ? null : Number(k),
        source: b.source || "node_output",
        output: b.output,
        static_value: b.static_value,
      };
    });
  }
  return [{
    variable_id: m?.variable_id ?? null,
    source: m?.source || "node_output",
    output: m?.output,
    static_value: m?.static_value,
  }];
}

const outKey = (r) => (r.variable_id == null ? "" : String(r.variable_id));

const toOutputMapping = (enabled, rows) => ({
  enabled,
  bindings: Object.fromEntries(
    rows.map((r) => [
      outKey(r),
      r.source === "static"
        ? { source: "static", static_value: r.static_value ?? "" }
        : { source: "node_output", output: r.output },
    ])
  ),
  order: rows.map(outKey),
});

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

  const update = (updates) => patch({ variable: { ...cfg, ...updates } });

  const varOptions = (selectedId, excludeIds = []) => {
    const opts = [
      { value: "", label: "Select Variable" },
      ...variables
        .filter((v) => {
          const id = String(v.variable_id);
          return id === selectedId || !excludeIds.includes(id);
        })
        .map((v) => ({
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

  const firstIn  = io?.inputs[0]?.key  || "";
  const firstOut = io?.outputs[0]?.key || "";

  // ── Input rows ───────────────────────────────────────────────────────────
  const inRows = inputRows(im).map((r) => ({ ...r, target: r.target || firstIn }));
  const setInRows = (rows) => update({ input_mapping: toInputMapping(true, rows) });
  const updIn = (idx, u) => setInRows(inRows.map((r, i) => (i === idx ? { ...r, ...u } : r)));
  const removeIn = (idx) => {
    const next = inRows.filter((_, i) => i !== idx);
    setInRows(next.length ? next : [{ target: firstIn, variable_id: null }]);
  };
  const unusedIn = io?.inputs.find((i) => !inRows.some((r) => r.target === i.key));
  const canAddIn = !!unusedIn;
  const addIn = () => canAddIn && setInRows([...inRows, { target: unusedIn.key, variable_id: null }]);

  // ── Output rows ──────────────────────────────────────────────────────────
  const outRows = outputRows(om).map((r) => ({ ...r, output: r.output || firstOut }));
  const setOutRows = (rows) => update({ output_mapping: toOutputMapping(true, rows) });
  const updOut = (idx, u) => setOutRows(outRows.map((r, i) => (i === idx ? { ...r, ...u } : r)));
  const removeOut = (idx) => {
    const next = outRows.filter((_, i) => i !== idx);
    setOutRows(next.length ? next : [{ variable_id: null, source: "node_output", output: firstOut }]);
  };
  const canAddOut =
    !!io && outRows.length < variables.length && outRows.every((r) => r.variable_id != null);
  const addOut = () =>
    canAddOut &&
    setOutRows([...outRows, { variable_id: null, source: "node_output", output: firstOut }]);

  const addTitle = (can, noun, blocked) =>
    can
      ? `Add ${noun} mapping`
      : blocked
      ? "Select a variable in the current row first"
      : noun === "output"
      ? "All available variables are already mapped"
      : `This node has no additional ${noun}s to map`;

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
                    ? setInRows(inRows)
                    : update({ input_mapping: { ...im, enabled: false } })
                }
              />
              Enable
            </label>

            {im.enabled && (
              <div>
                {inRows.map((r, idx) => {
                  const varId = r.variable_id != null ? String(r.variable_id) : "";
                  const targetOpts = inputOptions.filter(
                    (o) => o.value === r.target || !inRows.some((x, j) => j !== idx && x.target === o.value)
                  );
                  return (
                    <div key={`in-${r.target}`} style={rowBox}>
                      <div style={rowHead}>
                        <span style={{ ...lbl, marginBottom: 0 }}>Mapping {idx + 1}</span>
                        <button
                          type="button"
                          style={miniBtnDanger}
                          title="Remove mapping"
                          onClick={() => removeIn(idx)}
                        >
                          ✕ Delete
                        </button>
                      </div>
                      <SelectField
                        label="Variable"
                        value={varId}
                        onChange={(val) => updIn(idx, { variable_id: val ? Number(val) : null })}
                        options={varOptions(varId)}
                      />
                      <SelectField
                        label="Target Input"
                        value={r.target}
                        onChange={(val) => updIn(idx, { target: val })}
                        options={targetOpts}
                      />
                      <div style={sectionNote}>
                        Mapping: {varId ? varName(varId) : "Variable"} → {labelOf(inputOptions, r.target)}
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    style={{ ...miniBtn, ...(canAddIn ? {} : miniBtnDisabled) }}
                    disabled={!canAddIn}
                    title={addTitle(canAddIn, "input", false)}
                    onClick={addIn}
                  >
                    ＋ Add
                  </button>
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
                    ? setOutRows(outRows)
                    : update({ output_mapping: { ...om, enabled: false } })
                }
              />
              Enable
            </label>

            {om.enabled && (
              <div>
                {outRows.map((r, idx) => {
                  const varId = r.variable_id != null ? String(r.variable_id) : "";
                  const usedElsewhere = outRows
                    .filter((_, j) => j !== idx && outRows[j].variable_id != null)
                    .map((x) => String(x.variable_id));
                  return (
                    <div key={`out-${outKey(r) || `blank-${idx}`}`} style={rowBox}>
                      <div style={rowHead}>
                        <span style={{ ...lbl, marginBottom: 0 }}>Mapping {idx + 1}</span>
                        <button
                          type="button"
                          style={miniBtnDanger}
                          title="Remove mapping"
                          onClick={() => removeOut(idx)}
                        >
                          ✕ Delete
                        </button>
                      </div>
                      <SelectField
                        label="Variable"
                        value={varId}
                        onChange={(val) => updOut(idx, { variable_id: val ? Number(val) : null })}
                        options={varOptions(varId, usedElsewhere)}
                      />
                      <SelectField
                        label="Source"
                        value={r.source}
                        onChange={(val) => updOut(idx, { source: val })}
                        options={SOURCE_OPTIONS}
                      />
                      {r.source === "node_output" && (
                        <SelectField
                          label="Source Output"
                          value={r.output || ""}
                          onChange={(val) => updOut(idx, { output: val })}
                          options={outputOptions}
                        />
                      )}
                      {r.source === "static" && (
                        <Field
                          label="Value"
                          value={r.static_value}
                          onChange={(val) => updOut(idx, { static_value: val })}
                          placeholder="Enter static value…"
                        />
                      )}
                      <div style={sectionNote}>
                        Mapping:{" "}
                        {r.source === "static" ? "Static Value" : labelOf(outputOptions, r.output)} →{" "}
                        {varId ? varName(varId) : "Variable"}
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    style={{ ...miniBtn, ...(canAddOut ? {} : miniBtnDisabled) }}
                    disabled={!canAddOut}
                    title={addTitle(
                      canAddOut,
                      "output",
                      !!io && outRows.length < variables.length
                    )}
                    onClick={addOut}
                  >
                    ＋ Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}