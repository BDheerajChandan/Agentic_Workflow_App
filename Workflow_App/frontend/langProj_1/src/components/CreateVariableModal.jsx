// src/components/CreateVariableModal.jsx

import React, { useEffect, useState } from "react";
import {
  createVariable, updateVariable, deleteVariable, listBotWorkflows, listVariables,
} from "../services/api";
import { NativeSelect } from "../registry/settings/fields";

export default function CreateVariableModal({ flowId, flowName, onClose, onChanged }) {
  const [name,       setName]       = useState("");
  const [visibility, setVisibility] = useState("public");
  const [workflowId, setWorkflowId] = useState(flowId != null ? String(flowId) : "");
  const [editingId,  setEditingId]  = useState(null);
  const [workflows,  setWorkflows]  = useState([]);
  const [variables,  setVariables]  = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  const loadVariables = async () => {
    try {
      const d = await listVariables(flowId);
      setVariables(d.variables || []);
    } catch {
      setError("Failed to load variables.");
    }
  };

  useEffect(() => {
    loadVariables();
    listBotWorkflows()
      .then((d) => setWorkflows(d.workflows || []))
      .catch(() => {});
  }, []); // eslint-disable-line

  const workflowOptions = (workflows.length
    ? workflows
    : [{ workflow_id: flowId, workflow_name: flowName }]
  ).map((w) => ({ value: String(w.workflow_id), label: w.workflow_name }));

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setVisibility("public");
    setWorkflowId(flowId != null ? String(flowId) : "");
    setError("");
  };

  const startEdit = (v) => {
    setEditingId(v.variable_id);
    setName(v.name);
    setVisibility(v.visibility);
    setWorkflowId(v.flow_id != null ? String(v.flow_id) : (flowId != null ? String(flowId) : ""));
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return setError("Enter a variable name.");
    if (visibility === "private" && !workflowId) return setError("Select a workflow.");
    setError("");
    setSaving(true);
    const body = {
      name: name.trim(),
      visibility,
      flow_id: visibility === "private" ? Number(workflowId) : null,
    };
    try {
      if (editingId != null) await updateVariable(editingId, body);
      else await createVariable(body);
      resetForm();
      await loadVariables();
      onChanged?.();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          (editingId != null ? "Failed to update variable." : "Failed to create variable.")
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete variable "${v.name}"? Nodes using it will fail until reassigned.`)) return;
    try {
      await deleteVariable(v.variable_id);
      if (editingId === v.variable_id) resetForm();
      await loadVariables();
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to delete variable.");
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <form style={s.panel} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={s.header}>
          <div style={s.title}>{editingId != null ? "Edit Variable" : "Create Variable"}</div>
          <button type="button" style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <label style={s.lbl}>Variable Name</label>
        <input
          style={s.inp}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. var1"
          autoFocus
        />

        <label style={s.lbl}>Visibility</label>
        <div style={s.toggle}>
          {["public", "private"].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setVisibility(val)}
              style={{
                ...s.toggleBtn,
                background:  visibility === val ? "#0284c7" : "#0f172a",
                color:       visibility === val ? "#fff"    : "#64748b",
                borderColor: visibility === val ? "#0284c7" : "#1e293b",
              }}
            >
              {val === "public" ? "Public" : "Private"}
            </button>
          ))}
        </div>

        {visibility === "private" && (
          <>
            <label style={s.lbl}>Workflow</label>
            <NativeSelect
              value={workflowId}
              onChange={setWorkflowId}
              options={workflowOptions}
            />
          </>
        )}

        {error && <div style={s.error}>{error}</div>}

        <div style={s.actions}>
          {editingId != null ? (
            <button type="button" style={s.cancelBtn} onClick={resetForm}>Cancel Edit</button>
          ) : (
            <button type="button" style={s.cancelBtn} onClick={onClose}>Close</button>
          )}
          <button type="submit" style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }} disabled={saving}>
            {saving ? "Saving…" : editingId != null ? "Save Changes" : "Create Variable"}
          </button>
        </div>

        <label style={{ ...s.lbl, marginTop: 18 }}>Available to this workflow</label>
        <div style={s.list}>
          {variables.length === 0 && <div style={s.empty}>No variables yet.</div>}
          {variables.map((v) => (
            <div
              key={v.variable_id}
              style={{
                ...s.row,
                borderColor: editingId === v.variable_id ? "#6366f1" : "#1e293b",
              }}
            >
              <div>
                <span style={s.rowName}>{v.name}</span>
                <span style={s.rowMeta}>
                  {v.visibility === "private" ? `Private · ${v.workflow_name || v.flow_id}` : "Public"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" style={s.editBtn} onClick={() => startEdit(v)} title="Edit variable">
                  Edit
                </button>
                <button type="button" style={s.delBtn} onClick={() => remove(v)} title="Delete variable">✕</button>
              </div>
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(2,6,23,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000,
  },
  panel: {
    width: 420, maxHeight: "90vh", overflowY: "auto",
    background: "#0a0f1e", border: "1px solid #1e293b",
    borderRadius: 14, padding: 22, color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: 700, color: "#818cf8" },
  closeBtn: { background: "transparent", border: "none", color: "#475569", fontSize: 14, cursor: "pointer" },
  lbl: {
    display: "block", fontSize: 10, color: "#94a3b8", margin: "12px 0 5px",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  inp: {
    width: "100%", padding: "9px 11px", borderRadius: 8, background: "#0f172a",
    color: "#e2e8f0", border: "1px solid #1e293b", fontSize: 13, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  },
  toggle: { display: "flex", gap: 6 },
  toggleBtn: {
    flex: 1, padding: "7px 0", borderRadius: 7,
    border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  error: {
    marginTop: 10, padding: "8px 10px", borderRadius: 8, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  cancelBtn: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  empty: { color: "#475569", fontSize: 12 },
  row: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "7px 10px", borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a",
  },
  rowName: { fontSize: 12, color: "#e2e8f0", fontWeight: 600, marginRight: 8 },
  rowMeta: { fontSize: 10, color: "#64748b" },
  editBtn: {
    padding: "2px 8px", borderRadius: 6, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer",
  },
  delBtn: { background: "transparent", border: "none", color: "#475569", fontSize: 12, cursor: "pointer" },
};