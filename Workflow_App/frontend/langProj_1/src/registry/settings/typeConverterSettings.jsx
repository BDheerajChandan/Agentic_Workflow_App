// src/registry/settings/typeConverterSettings.jsx

import React from "react";
import { Field, SelectField } from "./fields";

const OPERATIONS = [
  { value: "upper", label: "Uppercase" },
  { value: "lower", label: "Lowercase" },
  { value: "str",   label: "To String" },
  { value: "len",   label: "Length" },
  { value: "split", label: "Split Words" },
  { value: "strip", label: "Strip Whitespace" },
];

export default function TypeConverterSettings({ localData, patch }) {
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
}