// src/registry/settings/base64Settings.jsx

import React from "react";
import { SelectField, TextAreaField, ModeToggle } from "./fields";
import { infoBox, sectionNote } from "./styles";

const OPERATIONS = [
  { value: "encode", label: "Encode" },
  { value: "decode", label: "Decode" },
];

export default function Base64Settings({ localData, patch }) {
  const mode = localData.config_mode || "static";

  const errors = [
    mode === "static" && !(localData.input_value ?? "").toString().length
      ? "Input value is required." : "",
  ].filter(Boolean);

  return (
    <>
      <ModeToggle mode={mode} onChange={(val) => patch({ config_mode: val })} />

      <SelectField
        label="Operation *"
        value={localData.operation || "encode"}
        onChange={(val) => patch({ operation: val })}
        options={OPERATIONS}
      />

      {mode === "static" ? (
        <>
          <div style={sectionNote}>
            Static: the value below is used. Mappings and connected values are ignored.
          </div>
          <TextAreaField
            label="Input value *"
            value={localData.input_value}
            onChange={(val) => patch({ input_value: val })}
            placeholder="Text to encode / Base64 to decode…"
            rows={4}
          />
        </>
      ) : (
        <div style={sectionNote}>
          Dynamic: the input is resolved at run time from Input Value Mapping
          (target "Input Text", dot-notation paths supported) or a connected node.
          The saved static value is kept but not used.
        </div>
      )}

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}