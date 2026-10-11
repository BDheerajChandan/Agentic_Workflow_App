// src/components/CreateBotModal.jsx

import React, { useState } from "react";
import { createBot } from "../services/api";

export default function CreateBotModal({ flowId, flowName, onClose, onCreated }) {
  const [name, setName]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) return setError("Enter a Bot name.");
    setError("");
    setSaving(true);
    try {
      const bot = await createBot(name.trim(), Number(flowId));
      onCreated(bot);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create Bot.");
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <form style={s.panel} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={s.header}>
          <div style={s.title}>Create Bot</div>
          <button type="button" style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <label style={s.lbl}>Bot Name</label>
        <input
          style={s.inp}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Support Bot"
          autoFocus
        />

        <label style={s.lbl}>Tagged Workflow</label>
        <div style={{ ...s.inp, color: "#94a3b8" }}>⚙ {flowName}</div>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.actions}>
          <button type="button" style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }} disabled={saving}>
            {saving ? "Saving…" : "Create Bot"}
          </button>
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
    width: 400, background: "#0a0f1e", border: "1px solid #1e293b",
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
};