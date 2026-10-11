// src/registry/settings/fields.jsx
// Shared, module-level field components (must NOT be defined inside a render function).

import React, { useState } from "react";
import {
  fieldWrap, lbl, inp, ddSelect, ddArrow, toggle, toggleBtn, eyeBtnStyle,
} from "./styles";

export function NativeSelect({ value, onChange, options }) {
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

export function Field({ label, value, onChange, type = "text", placeholder = "" }) {
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

export function TextAreaField({ label, value, onChange, placeholder = "", rows = 4 }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{label}</label>
      <textarea
        value={value ?? ""}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{label}</label>
      <NativeSelect value={value ?? ""} onChange={onChange} options={options} />
    </div>
  );
}

// Static / Dynamic switch (shared by Retriever and Generate)
export function ModeToggle({ mode, onChange }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>Configuration Mode</label>
      <div style={toggle}>
        {["static", "dynamic"].map((val) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            style={{
              ...toggleBtn,
              background:  mode === val ? "#0284c7" : "#0f172a",
              color:       mode === val ? "#fff"    : "#64748b",
              borderColor: mode === val ? "#0284c7" : "#1e293b",
            }}
          >
            {val === "static" ? "Static" : "Dynamic"}
          </button>
        ))}
      </div>
    </div>
  );
}

// API key input with Hide / Unhide (visibility toggle never modifies the value)
export function ApiKeyField({ value, onChange }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={fieldWrap}>
      <label style={lbl}>API Key</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type={visible ? "text" : "password"}
          value={value ?? ""}
          placeholder="Enter API key…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inp, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          style={eyeBtnStyle}
          title={visible ? "Hide API key" : "Unhide API key"}
        >
          {visible ? "🙈 Hide" : "👁 Unhide"}
        </button>
      </div>
    </div>
  );
}