// src/registry/settings/MultiSelect.jsx

import React, { useMemo, useState } from "react";
import { fieldWrap, lbl, inp, miniBtn, checkRow } from "./styles";

const chip = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px",
  borderRadius: 999, border: "1px solid #334155", background: "#0f172a",
  color: "#cbd5e1", fontSize: 11, maxWidth: "100%",
};

export default function MultiSelect({ label, options, value, onChange, placeholder = "Select…" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = Array.isArray(value) ? value : [];

  const labelOf = (v) => options.find((o) => o.value === v)?.label || v;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !s || `${o.label} ${o.description || ""}`.toLowerCase().includes(s));
  }, [options, q]);

  const toggle = (v) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div style={fieldWrap}>
      {label && <label style={lbl}>{label}</label>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {selected.length === 0 && <span style={{ fontSize: 11, color: "#475569" }}>{placeholder}</span>}
        {selected.map((v) => (
          <span key={v} style={chip}>
            <span style={{ wordBreak: "break-word" }}>{labelOf(v)}</span>
            <button
              type="button"
              title="Remove"
              onClick={() => toggle(v)}
              style={{ background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 11 }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={miniBtn} onClick={() => setOpen((o) => !o)}>
          {open ? "▲ Hide Features" : "▼ Choose Features"}
        </button>
        <button type="button" style={miniBtn} onClick={() => onChange(options.map((o) => o.value))}>
          Select All
        </button>
        <button type="button" style={miniBtn} onClick={() => onChange([])}>
          Clear All
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 6, border: "1px solid #1e293b", borderRadius: 8, background: "#0f172a", padding: 6 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            style={{ ...inp, marginBottom: 6 }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {shown.length === 0 && <div style={{ fontSize: 11, color: "#475569", padding: 6 }}>No matches.</div>}
            {shown.map((o) => (
              <label key={o.value} style={{ ...checkRow, padding: "5px 6px", borderRadius: 6, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  {o.label}
                  {o.description && (
                    <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{o.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}