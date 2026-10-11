// src/registry/settings/ragRetrieveSettings.jsx

import React, { useState } from "react";
import { browseLocalPath } from "../../services/api";
import { Field, SelectField, ModeToggle, ApiKeyField } from "./fields";
import {
  fieldWrap, lbl, inp, toggle, toggleBtn, browseBtnStyle, infoBox, sectionNote,
} from "./styles";

const SOURCE_TYPES = [
  { value: "",      label: "Auto-detect" },
  { value: "pdf",   label: "PDF" },
  { value: "docx",  label: "DOCX" },
  { value: "pptx",  label: "PPTX" },
  { value: "txt",   label: "TXT" },
  { value: "html",  label: "HTML" },
  { value: "url",   label: "URL / Web page" },
];

export default function RagRetrieveSettings({ localData, patch, selectedNodeId }) {
  const [browseInfo, setBrowseInfo] = useState(null);
  const [browsing,   setBrowsing]   = useState(false);

  const configMode = localData.config_mode || "static";
  const locality   = localData.source_locality || "nonlocal";

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

  return (
    <>
      <ModeToggle
        mode={configMode}
        onChange={(val) => patch({ config_mode: val })}
      />

      {configMode === "static" && (
        <div style={sectionNote}>
          Static: the API key from the backend .env file is used.
        </div>
      )}

      {configMode === "dynamic" && (
        <ApiKeyField
          key={`${selectedNodeId}-api`}
          value={localData.api_key}
          onChange={(val) => patch({ api_key: val })}
        />
      )}

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