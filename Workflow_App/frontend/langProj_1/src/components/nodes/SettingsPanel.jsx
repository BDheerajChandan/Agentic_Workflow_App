// components/nodes/SettingsPanel.jsx

import React, { useEffect, useRef, useState } from "react";
import { useReactFlow } from "reactflow";
import { browseLocalPath } from "../../services/api";

const SOURCE_TYPES = [
  { value: "",      label: "Auto-detect" },
  { value: "pdf",   label: "PDF" },
  { value: "docx",  label: "DOCX" },
  { value: "pptx",  label: "PPTX" },
  { value: "txt",   label: "TXT" },
  { value: "html",  label: "HTML" },
  { value: "url",   label: "URL / Web page" },
];

const OPERATIONS = [
  { value: "upper", label: "Uppercase" },
  { value: "lower", label: "Lowercase" },
  { value: "str",   label: "To String" },
  { value: "len",   label: "Length" },
  { value: "split", label: "Split Words" },
  { value: "strip", label: "Strip Whitespace" },
];

// ─── Stable, module-level field components ─────────────────────────────────
// These must NOT be defined inside SettingsPanel(). Defining them inside a
// render function creates a brand-new component type every render, which
// makes React unmount/remount the underlying <input>/<select> DOM nodes on
// every keystroke — that's what was causing focus loss, the dropdown
// closing, and inputs going unresponsive after a moment.

function NativeSelect({ value, onChange, options }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={ddSelect}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span style={ddArrow}>▼</span>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{label}</label>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(type === "number" ? Number(e.target.value) : e.target.value)
        }
        style={inp}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{label}</label>
      <NativeSelect value={value ?? ""} onChange={onChange} options={options} />
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function SettingsPanel({
  selectedNodeId,
  onClose,
  globalInput,
  onGlobalInputChange,
}) {
  const { getNode, setNodes } = useReactFlow();

  const [localData,  setLocalData]  = useState({});
  const [browseInfo, setBrowseInfo] = useState(null);
  const [browsing,   setBrowsing]   = useState(false);

  const initialisedForRef = useRef(null);

  useEffect(() => {
    if (selectedNodeId === initialisedForRef.current) return;
    initialisedForRef.current = selectedNodeId;

    if (selectedNodeId) {
      const n = getNode(selectedNodeId);
      setLocalData(n ? { ...(n.data || {}) } : {});
    } else {
      setLocalData({});
    }
    setBrowseInfo(null);
  }, [selectedNodeId, getNode]);

  const node = selectedNodeId ? getNode(selectedNodeId) : null;
  if (!node) return null;

  const patch = (updates) => {
    setLocalData((prev) => {
      const next = { ...prev, ...updates };
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, ...updates } }
            : n
        )
      );
      return next;
    });
  };

  // ── Browse ─────────────────────────────────────────────────────────────────
  const handleBrowse = async () => {
    const path = (localData.local_path || "").trim();
    if (!path) return;
    setBrowsing(true);
    setBrowseInfo(null);
    try {
      const info = await browseLocalPath(path);
      setBrowseInfo(info);
      patch({ local_path: path, source: path });
    } catch {
      setBrowseInfo({ type: "error", supported: [] });
    } finally {
      setBrowsing(false);
    }
  };

  // ── Per-node settings ──────────────────────────────────────────────────────
  const renderSettings = () => {
    switch (node.type) {

      case "start":
        return (
          <>
            <div style={sectionNote}>
              Entry point of the workflow. The value below is the initial input
              passed to the graph when Run is clicked.
            </div>
            <div style={fieldWrap}>
              <label style={lbl}>Input value</label>
              <textarea
                value={globalInput ?? ""}
                placeholder="Enter starting input…"
                onChange={(e) => onGlobalInputChange(e.target.value)}
                rows={5}
                style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>
          </>
        );

      case "output":
        return (
          <div style={infoStyle}>No configurable settings for the Output node.</div>
        );

      case "type_converter":
        return (
          <>
            <SelectField
              label="Operation"
              value={localData.operation}
              onChange={(val) => patch({ operation: val })}
              options={OPERATIONS}
            />
            {localData.operation === "split" && (
              <Field
                label="Split parameter"
                value={localData.split_param}
                onChange={(val) => patch({ split_param: val })}
              />
            )}
          </>
        );

      case "rag_retrieve": {
        const locality = localData.source_locality || "nonlocal";
        return (
          <>
            <div style={fieldWrap}>
              <label style={lbl}>Data Source</label>
              <div style={toggle}>
                {["local", "nonlocal"].map((val) => (
                  <button
                    key={val}
                    onClick={() => patch({ source_locality: val })}
                    style={{
                      ...toggleBtn,
                      background:  locality === val ? "#0284c7" : "#0f172a",
                      color:       locality === val ? "#fff"    : "#64748b",
                      borderColor: locality === val ? "#0284c7" : "#1e293b",
                    }}
                  >
                    {val === "local" ? "🖥 Local" : "🌐 Non-Local"}
                  </button>
                ))}
              </div>
            </div>

            {locality === "local" && (
              <div style={fieldWrap}>
                <label style={lbl}>Path (file / folder / comma-separated)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={localData.local_path ?? ""}
                    placeholder="/path/to/file.pdf  or  /path/to/folder"
                    onChange={(e) =>
                      patch({ local_path: e.target.value, source: e.target.value })
                    }
                    style={{ ...inp, flex: 1 }}
                  />
                  <button
                    onClick={handleBrowse}
                    disabled={browsing || !(localData.local_path || "").trim()}
                    style={browseBtnStyle}
                  >
                    {browsing ? "…" : "✓"}
                  </button>
                </div>
                {browseInfo && (
                  <div
                    style={infoBox(
                      browseInfo.type === "not_found" || browseInfo.type === "error"
                    )}
                  >
                    {browseInfo.type === "not_found" && "⚠ Path not found."}
                    {browseInfo.type === "error"     && "⚠ Failed to browse."}
                    {browseInfo.type === "file"      &&
                      `📄 1 file — ${browseInfo.supported.length ? "✅ supported" : "⚠ unsupported"}`}
                    {browseInfo.type === "directory" &&
                      `📁 ${browseInfo.supported.length} supported file(s) found`}
                    {browseInfo.type === "multi" &&
                      `📂 ${browseInfo.supported.length} supported file(s)`}
                  </div>
                )}
              </div>
            )}

            {locality === "nonlocal" && (
              <>
                <Field
                  label="Source (path or URL)"
                  value={localData.source}
                  onChange={(val) => patch({ source: val })}
                  placeholder="https://...  or  /abs/path/file.pdf"
                />
                <SelectField
                  label="Source type"
                  value={localData.source_type}
                  onChange={(val) => patch({ source_type: val })}
                  options={SOURCE_TYPES}
                />
              </>
            )}

            <Field
              label="Chunk size"
              type="number"
              value={localData.chunk_size}
              onChange={(val) => patch({ chunk_size: val })}
            />
            <Field
              label="Chunk overlap"
              type="number"
              value={localData.chunk_overlap}
              onChange={(val) => patch({ chunk_overlap: val })}
            />
            <Field
              label="k (top docs)"
              type="number"
              value={localData.k}
              onChange={(val) => patch({ k: val })}
            />
          </>
        );
      }

      case "rag_generate":
        return (
          <div style={infoStyle}>
            RAG Generate uses the LLM configured in the backend.
          </div>
        );

      default:
        return (
          <div style={infoStyle}>
            No settings defined for node type:{" "}
            <strong>{node.type}</strong>
          </div>
        );
    }
  };

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <div>
          <div style={panelTitle}>Node Settings</div>
          <div style={panelSub}>
            {node.type} · {selectedNodeId}
          </div>
        </div>
        <button style={closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>
      <div style={panelBody}>{renderSettings()}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const panel = {
  position: "absolute",
  top: 0, right: 0,
  width: 300,
  height: "100%",
  background: "#0a0f1e",
  borderLeft: "1px solid #1e293b",
  display: "flex",
  flexDirection: "column",
  zIndex: 900,
  boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
};

const panelHeader = {
  padding: "16px 16px 12px",
  borderBottom: "1px solid #1e293b",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexShrink: 0,
};

const panelTitle = {
  fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.04em",
};
const panelSub = { fontSize: 10, color: "#475569", marginTop: 2 };
const closeBtn = {
  background: "transparent", border: "none",
  color: "#475569", fontSize: 14, cursor: "pointer", padding: 4,
};

const panelBody = {
  padding: "16px",
  overflowY: "auto",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const fieldWrap = { marginBottom: 12 };

const lbl = {
  display: "block", fontSize: 10, color: "#94a3b8",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em",
};

const inp = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  background: "#0f172a", color: "#e2e8f0",
  border: "1px solid #1e293b", fontSize: 12,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const ddSelect = {
  width: "100%",
  padding: "8px 32px 8px 10px",
  borderRadius: 8,
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #1e293b",
  fontSize: 12,
  cursor: "pointer",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const ddArrow = {
  position: "absolute",
  right: 10, top: "50%",
  transform: "translateY(-50%)",
  color: "#475569", fontSize: 10,
  pointerEvents: "none", userSelect: "none",
};

const toggle    = { display: "flex", gap: 6, marginTop: 4 };
const toggleBtn = {
  flex: 1, padding: "6px 0", borderRadius: 7,
  border: "1px solid", fontSize: 11, fontWeight: 600,
  cursor: "pointer", transition: "all 0.15s",
};

const browseBtnStyle = {
  padding: "8px 10px", borderRadius: 7,
  border: "1px solid #0284c7", background: "#0284c7",
  color: "white", fontSize: 12, cursor: "pointer", flexShrink: 0,
};

const infoBox = (isErr) => ({
  marginTop: 6, padding: "5px 8px", borderRadius: 6, fontSize: 11,
  background: isErr ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
  border: `1px solid ${isErr ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
  color: isErr ? "#fca5a5" : "#6ee7b7",
});

const infoStyle = { fontSize: 12, color: "#475569", lineHeight: 1.6 };

const sectionNote = {
  fontSize: 11, color: "#475569", lineHeight: 1.6,
  marginBottom: 12, padding: "8px 10px",
  background: "rgba(99,102,241,0.05)",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: 8,
};