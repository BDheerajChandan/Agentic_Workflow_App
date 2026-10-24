// src/registry/settings/pythonFunctionsSettings.jsx

import React, { useRef, useState } from "react";
import { validatePythonFile } from "../../services/api";
import { Field, SelectField, TextAreaField } from "./fields";
import { fieldWrap, miniBtn, infoBox, sectionNote } from "./styles";

const SOURCE_MODES = [
  { value: "static",  label: "Static — Write Code" },
  { value: "dynamic", label: "Dynamic — Upload .py File" },
];

const INPUT_SOURCES = [
  { value: "current_value", label: "Current Value" },
  { value: "full",          label: "Full Response" },
  { value: "node_results",  label: "Node Results" },
  { value: "variables",     label: "Runtime Variables" },
  { value: "combined",      label: "Combined (value + data + variables)" },
];

export default function PythonFunctionsSettings({ localData, patch }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const mode = localData.source_mode || "static";

  const errors = [
    mode === "static" && !(localData.code || "").trim() ? "Code is required." : "",
    mode === "dynamic" && !(localData.file_code || "").trim() ? "Upload a .py file." : "",
    localData.timeout !== undefined && (Number(localData.timeout) < 1 || Number(localData.timeout) > 60)
      ? "Timeout must be between 1 and 60 seconds." : "",
    localData.memory_mb !== undefined && (Number(localData.memory_mb) < 64 || Number(localData.memory_mb) > 1024)
      ? "Memory limit must be between 64 and 1024 MB." : "",
  ].filter(Boolean);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    if (!file.name.toLowerCase().endsWith(".py")) {
      setUploadError("Only .py files are supported.");
      return;
    }
    setUploading(true);
    try {
      const content = await file.text();
      const info = await validatePythonFile(file.name, content);
      patch({ file_name: info.file_name, file_code: info.code });
    } catch (err) {
      setUploadError(err?.response?.data?.detail || "Failed to read the file.");
    } finally {
      setUploading(false);
    }
  };

  const lines = (localData.file_code || "").split("\n").length;

  return (
    <>
      <SelectField
        label="Source Mode"
        value={mode}
        onChange={(val) => patch({ source_mode: val })}
        options={SOURCE_MODES}
      />

      <div style={sectionNote}>
        Define main(inputs, context), main(**kwargs) or main(*args). The Input Value
        Mapping target "Inputs" overrides the Input Source below.
      </div>

      <SelectField
        label="Input Source"
        value={localData.input_source || "current_value"}
        onChange={(val) => patch({ input_source: val })}
        options={INPUT_SOURCES}
      />

      {mode === "static" ? (
        <TextAreaField
          label="Python Code *"
          value={localData.code}
          onChange={(val) => patch({ code: val })}
          placeholder={"def main(inputs, context):\n    result = inputs\n    return result"}
          rows={14}
        />
      ) : (
        <div style={fieldWrap}>
          <input
            ref={fileRef}
            type="file"
            accept=".py"
            style={{ display: "none" }}
            onChange={handleFile}
          />
          <button
            type="button"
            style={miniBtn}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : localData.file_name ? "⟳ Replace .py File" : "⬆ Upload .py File"}
          </button>

          {localData.file_name && (
            <div style={infoBox(false)}>
              📄 {localData.file_name} · {lines} lines · stored with this workflow
            </div>
          )}
          {uploadError && <div style={infoBox(true)}>⚠ {uploadError}</div>}
        </div>
      )}

      <Field
        label="Timeout (seconds)"
        type="number"
        value={localData.timeout ?? 10}
        onChange={(val) => patch({ timeout: val })}
      />
      <Field
        label="Memory Limit (MB)"
        type="number"
        value={localData.memory_mb ?? 256}
        onChange={(val) => patch({ memory_mb: val })}
      />

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}