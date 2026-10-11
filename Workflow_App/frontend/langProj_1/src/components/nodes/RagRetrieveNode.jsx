// components/nodes/RagRetrieveNode.jsx
// Retriever node with Local / Non-Local data source selection.

import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
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

export default function RagRetrieveNode({ id, data }) {
  const { setNodes } = useReactFlow();

  const [locality,     setLocality]     = useState(data.source_locality  ?? "nonlocal");
  const [localPath,    setLocalPath]    = useState(data.local_path        ?? "");
  const [source,       setSource]       = useState(data.source            ?? "");
  const [sourceType,   setSourceType]   = useState(data.source_type       ?? "");
  const [chunkSize,    setChunkSize]    = useState(data.chunk_size        ?? 500);
  const [chunkOverlap, setChunkOverlap] = useState(data.chunk_overlap     ?? 100);
  const [k,            setK]            = useState(data.k                 ?? 5);
  const [browseInfo,   setBrowseInfo]   = useState(null);
  const [browsing,     setBrowsing]     = useState(false);

  const patch = (updates) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...updates } } : n
      )
    );
  };

  const set = (setter, key, cast = (v) => v) => (e) => {
    const val = cast(e.target.value);
    setter(val);
    patch({ [key]: val });
  };

  const handleLocalityChange = (val) => {
    setLocality(val);
    patch({ source_locality: val });
  };

  const handleBrowse = async () => {
    if (!localPath.trim()) return;
    setBrowsing(true);
    setBrowseInfo(null);
    try {
      const info = await browseLocalPath(localPath.trim());
      setBrowseInfo(info);
      // Always send local_path as "source" to the backend
      patch({ local_path: localPath.trim(), source: localPath.trim() });
    } catch {
      setBrowseInfo({ type: "error", supported: [] });
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div style={box}>
      <Handle type="target" position={Position.Left} style={hdl} />

      <div style={header}>
        <span style={iconStyle}>📚</span>
        <span style={titleStyle}>RAG Retrieve</span>
      </div>

      {/* ── Locality toggle ──────────────────────────────────────────── */}
      <label style={lbl}>Data Source</label>
      <div style={toggle}>
        {["local", "nonlocal"].map((val) => (
          <button
            key={val}
            onClick={() => handleLocalityChange(val)}
            style={{
              ...toggleBtn,
              background: locality === val ? "#0284c7" : "#1e293b",
              color:      locality === val ? "#fff" : "#94a3b8",
              borderColor:locality === val ? "#0284c7" : "#334155",
            }}
          >
            {val === "local" ? "🖥 Local" : "🌐 Non-Local"}
          </button>
        ))}
      </div>

      {/* ── Local fields ─────────────────────────────────────────────── */}
      {locality === "local" && (
        <div>
          <label style={lbl}>Path (file / folder / comma-separated)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={localPath}
              onChange={(e) => {
                setLocalPath(e.target.value);
                patch({ local_path: e.target.value, source: e.target.value });
              }}
              placeholder="/path/to/file.pdf  or  /path/to/folder"
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={handleBrowse}
              disabled={browsing || !localPath.trim()}
              style={browseBtn}
            >
              {browsing ? "…" : "✓"}
            </button>
          </div>

          {browseInfo && (
            <div style={infoBox(browseInfo.type === "not_found" || browseInfo.type === "error")}>
              {browseInfo.type === "not_found" && "⚠ Path not found."}
              {browseInfo.type === "error"     && "⚠ Failed to browse path."}
              {browseInfo.type === "file"      && `📄 1 file — ${browseInfo.supported.length ? "✅ supported" : "⚠ unsupported type"}`}
              {browseInfo.type === "directory" && `📁 ${browseInfo.supported.length} supported file(s) found`}
              {browseInfo.type === "multi"     && `📂 ${browseInfo.supported.length} supported file(s) selected`}
            </div>
          )}
        </div>
      )}

      {/* ── Non-local fields ─────────────────────────────────────────── */}
      {locality === "nonlocal" && (
        <div>
          <label style={lbl}>Source (path or URL)</label>
          <input
            value={source}
            onChange={set(setSource, "source")}
            placeholder="https://...  or  /abs/path/to/file.pdf"
            style={inp}
          />

          <label style={lbl}>Source type</label>
          <select
            value={sourceType}
            onChange={set(setSourceType, "source_type")}
            style={{ ...inp, cursor: "pointer" }}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Shared chunking ──────────────────────────────────────────── */}
      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Chunk size</label>
          <input type="number" value={chunkSize}    onChange={set(setChunkSize,    "chunk_size",    Number)} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Overlap</label>
          <input type="number" value={chunkOverlap} onChange={set(setChunkOverlap, "chunk_overlap", Number)} style={inp} />
        </div>
        <div style={{ width: 52 }}>
          <label style={lbl}>k</label>
          <input type="number" value={k}            onChange={set(setK,            "k",             Number)} style={inp} />
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={hdl} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const hdl = { width: 10, height: 10, background: "#38bdf8" };

const box = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "#0f172a",
  color: "white",
  border: "1.5px solid #38bdf8",
  minWidth: 300,
  boxShadow: "0 4px 24px rgba(56,189,248,0.18)",
};

const header    = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const iconStyle = { fontSize: 16 };
const titleStyle = {
  fontWeight: 700, fontSize: 13, color: "#38bdf8",
  letterSpacing: "0.04em", textTransform: "uppercase",
};

const lbl = {
  display: "block", fontSize: 10, color: "#94a3b8",
  marginBottom: 3, marginTop: 8,
};

const inp = {
  width: "100%", padding: "6px 8px", borderRadius: 7,
  background: "#1e293b", color: "#e2e8f0",
  border: "1px solid #334155", fontSize: 12,
  outline: "none", boxSizing: "border-box",
};

const toggle = { display: "flex", gap: 6, marginTop: 4, marginBottom: 2 };

const toggleBtn = {
  flex: 1, padding: "5px 0", borderRadius: 7,
  border: "1px solid", fontSize: 11,
  fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
};

const browseBtn = {
  padding: "6px 10px", borderRadius: 7,
  border: "1px solid #0284c7", background: "#0284c7",
  color: "white", fontSize: 12, cursor: "pointer", flexShrink: 0,
};

const infoBox = (isErr) => ({
  marginTop: 6, padding: "5px 8px", borderRadius: 6, fontSize: 11,
  background: isErr ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
  border: `1px solid ${isErr ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
  color: isErr ? "#fca5a5" : "#6ee7b7",
});

const rowStyle = { display: "flex", gap: 8, marginTop: 4 };