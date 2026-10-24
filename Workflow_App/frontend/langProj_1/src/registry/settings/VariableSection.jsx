// src/registry/settings/VariableSection.jsx
// Generic Input / Output Value Mapping (single or multiple), rendered at the bottom of every
// variable-capable node's Settings Panel. Stored in node.data.variable using binding dictionaries:
//   input_mapping:  { enabled, bindings: { "<target input key>": { variable_id, path? } },             order: [keys] }
//   output_mapping: { enabled, bindings: { "<variable_id>": { source, output|static_value, path? } }, order: [keys] }
// UI rows carry a stable `rid` (UI-only, never persisted) so deleting one row never disturbs another.

import React, { useEffect, useRef, useState } from "react";
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

let ridSeq = 0;
const newRid = () => `row_${Date.now().toString(36)}_${(ridSeq++).toString(36)}`;

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
      rid: newRid(),
      target: k,
      variable_id: m.bindings[k]?.variable_id ?? null,
      path: m.bindings[k]?.path ?? "",
    }));
  }
  if (m && (m.target || m.variable_id != null)) {
    return [{ rid: newRid(), target: m.target || "", variable_id: m.variable_id ?? null, path: "" }];
  }
  return [];
}

const toInputMapping = (enabled, rows) => ({
  enabled,
  bindings: Object.fromEntries(
    rows.map((r) => [
      r.target,
      { variable_id: r.variable_id, ...(r.path && r.path.trim() ? { path: r.path.trim() } : {}) },
    ])
  ),
  order: rows.map((r) => r.target),
});

function outputRows(m) {
  if (m && m.bindings && typeof m.bindings === "object") {
    return orderedKeys(m.bindings, m.order).map((k) => {
      const b = m.bindings[k] || {};
      return {
        rid: newRid(),
        variable_id: k === "" ? null : Number(k),
        source: b.source || "node_output",
        output: b.output,
        path: b.path ?? "",
        static_value: b.static_value,
      };
    });
  }
  if (m && (m.variable_id != null || m.output || m.static_value != null)) {
    return [{
      rid: newRid(),
      variable_id: m.variable_id ?? null,
      source: m.source || "node_output",
      output: m.output,
      path: "",
      static_value: m.static_value,
    }];
  }
  return [];
}

const outKey = (r) => (r.variable_id == null ? "" : String(r.variable_id));

const toOutputMapping = (enabled, rows) => ({
  enabled,
  bindings: Object.fromEntries(
    rows.map((r) => [
      outKey(r),
      r.source === "static"
        ? { source: "static", static_value: r.static_value ?? "" }
        : {
            source: "node_output",
            output: r.output,
            ...(r.path && r.path.trim() ? { path: r.path.trim() } : {}),
          },
    ])
  ),
  order: rows.map(outKey),
});

export default function VariableSection({ localData, nodeType, patch, flowId, variablesVersion }) {
  const [nodeIO,    setNodeIO]    = useState(null);
  const [variables, setVariables] = useState([]);
  const [loaded,    setLoaded]    = useState(false);
  const [error,     setError]     = useState("");
  const [inRows,    setInRows]    = useState([]);
  const [outRows,   setOutRows]   = useState([]);
  const hydrated = useRef(false);

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

  // One-time hydration of UI rows from the saved configuration (rows then live in local state).
  useEffect(() => {
    if (hydrated.current || !io || !localData.variable) return;
    hydrated.current = true;
    setInRows(inputRows(im));
    setOutRows(outputRows(om));
  }, [io, localData.variable]); // eslint-disable-line

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
  const commitIn = (rows, on = true) => {
    hydrated.current = true;
    setInRows(rows);
    update({ input_mapping: toInputMapping(on, rows) });
  };
  const updIn    = (rid, u) => commitIn(inRows.map((r) => (r.rid === rid ? { ...r, ...u } : r)));
  const removeIn = (rid)    => commitIn(inRows.filter((r) => r.rid !== rid));
  const unusedIn = io?.inputs.find((i) => !inRows.some((r) => r.target === i.key));
  const canAddIn = !!unusedIn;
  const addIn = () =>
    canAddIn &&
    commitIn([...inRows, { rid: newRid(), target: unusedIn.key, variable_id: null, path: "" }]);

  // ── Output rows ──────────────────────────────────────────────────────────
  const blankOut = () => ({
    rid: newRid(), variable_id: null, source: "node_output", output: firstOut, path: "", static_value: "",
  });
  const commitOut = (rows, on = true) => {
    hydrated.current = true;
    setOutRows(rows);
    update({ output_mapping: toOutputMapping(on, rows) });
  };
  const updOut    = (rid, u) => commitOut(outRows.map((r) => (r.rid === rid ? { ...r, ...u } : r)));
  const removeOut = (rid)    => commitOut(outRows.filter((r) => r.rid !== rid));
  const canAddOut =
    !!io && outRows.length < variables.length && outRows.every((r) => r.variable_id != null);
  const addOut = () => canAddOut && commitOut([...outRows, blankOut()]);

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
                    ? commitIn(
                        inRows.length
                          ? inRows
                          : [{ rid: newRid(), target: firstIn, variable_id: null, path: "" }],
                        true
                      )
                    : update({ input_mapping: toInputMapping(false, inRows) })
                }
              />
              Enable
            </label>

            {im.enabled && (
              <div>
                {inRows.length === 0 && (
                  <div style={{ ...sectionNote, marginTop: 10 }}>
                    No input mappings. Click Add to create one.
                  </div>
                )}

                {inRows.map((r, idx) => {
                  const varId = r.variable_id != null ? String(r.variable_id) : "";
                  const targetOpts = inputOptions.filter(
                    (o) => o.value === r.target || !inRows.some((x) => x.rid !== r.rid && x.target === o.value)
                  );
                  return (
                    <div key={r.rid} style={rowBox}>
                      <div style={rowHead}>
                        <span style={{ ...lbl, marginBottom: 0 }}>Mapping {idx + 1}</span>
                        <button
                          type="button"
                          style={miniBtnDanger}
                          title="Remove mapping"
                          onClick={() => removeIn(r.rid)}
                        >
                          ✕ Delete
                        </button>
                      </div>
                      <SelectField
                        label="Variable"
                        value={varId}
                        onChange={(val) => updIn(r.rid, { variable_id: val ? Number(val) : null })}
                        options={varOptions(varId)}
                      />
                      <Field
                        label="Path (optional, dot notation)"
                        value={r.path}
                        onChange={(val) => updIn(r.rid, { path: val })}
                        placeholder="e.g. data.current.temperature_c"
                      />
                      <SelectField
                        label="Target Input"
                        value={r.target}
                        onChange={(val) => updIn(r.rid, { target: val })}
                        options={targetOpts}
                      />
                      <div style={sectionNote}>
                        Mapping: {varId ? varName(varId) : "Variable"}
                        {r.path && r.path.trim() ? `.${r.path.trim()}` : ""} → {labelOf(inputOptions, r.target)}
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
                    ? commitOut(outRows.length ? outRows : [blankOut()], true)
                    : update({ output_mapping: toOutputMapping(false, outRows) })
                }
              />
              Enable
            </label>

            {om.enabled && (
              <div>
                {outRows.length === 0 && (
                  <div style={{ ...sectionNote, marginTop: 10 }}>
                    No output mappings. Click Add to create one.
                  </div>
                )}

                {outRows.map((r, idx) => {
                  const varId = r.variable_id != null ? String(r.variable_id) : "";
                  const usedElsewhere = outRows
                    .filter((x) => x.rid !== r.rid && x.variable_id != null)
                    .map((x) => String(x.variable_id));
                  return (
                    <div key={r.rid} style={rowBox}>
                      <div style={rowHead}>
                        <span style={{ ...lbl, marginBottom: 0 }}>Mapping {idx + 1}</span>
                        <button
                          type="button"
                          style={miniBtnDanger}
                          title="Remove mapping"
                          onClick={() => removeOut(r.rid)}
                        >
                          ✕ Delete
                        </button>
                      </div>
                      <SelectField
                        label="Variable"
                        value={varId}
                        onChange={(val) => updOut(r.rid, { variable_id: val ? Number(val) : null })}
                        options={varOptions(varId, usedElsewhere)}
                      />
                      <SelectField
                        label="Source"
                        value={r.source}
                        onChange={(val) => updOut(r.rid, { source: val })}
                        options={SOURCE_OPTIONS}
                      />
                      {r.source === "node_output" && (
                        <SelectField
                          label="Source Output"
                          value={r.output || ""}
                          onChange={(val) => updOut(r.rid, { output: val })}
                          options={outputOptions}
                        />
                      )}
                      {r.source === "node_output" && (
                        <Field
                          label="Path (optional, dot notation)"
                          value={r.path}
                          onChange={(val) => updOut(r.rid, { path: val })}
                          placeholder="e.g. data.current.temperature_c"
                        />
                      )}
                      {r.source === "static" && (
                        <Field
                          label="Value"
                          value={r.static_value}
                          onChange={(val) => updOut(r.rid, { static_value: val })}
                          placeholder="Enter static value…"
                        />
                      )}
                      <div style={sectionNote}>
                        Mapping:{" "}
                        {r.source === "static"
                          ? "Static Value"
                          : `${labelOf(outputOptions, r.output)}${r.path && r.path.trim() ? `.${r.path.trim()}` : ""}`}{" "}
                        →{" "}
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