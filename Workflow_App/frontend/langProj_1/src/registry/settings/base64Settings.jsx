// src/registry/settings/base64Settings.jsx

import React from "react";
import { SelectField, TextAreaField } from "./fields";
import { sectionNote } from "./styles";

const OPERATIONS = [
  { value: "encode", label: "Encode" },
  { value: "decode", label: "Decode" },
];

export default function Base64Settings({ localData, patch }) {
  return (
    <>
      <SelectField
        label="Operation *"
        value={localData.operation || "encode"}
        onChange={(val) => patch({ operation: val })}
        options={OPERATIONS}
      />

      <TextAreaField
        label="Input value *"
        value={localData.input_value}
        onChange={(val) => patch({ input_value: val })}
        placeholder="Text to encode / Base64 to decode…"
        rows={4}
      />

      <div style={sectionNote}>
        Required: input comes from a connected node or Input Value Mapping.
        The value above is used only when no connected/mapped value is supplied.
      </div>
    </>
  );
}