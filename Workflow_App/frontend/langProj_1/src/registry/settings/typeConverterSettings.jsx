// src/registry/settings/typeConverterSettings.jsx

import React, { useEffect, useState } from "react";
import { getConverterMeta, detectConverterType } from "../../services/api";
import { Field, SelectField, TextAreaField } from "./fields";
import { fieldWrap, miniBtn, miniBtnDisabled, infoBox, sectionNote } from "./styles";

const OPERATIONS = [
  { value: "upper", label: "Uppercase" },
  { value: "lower", label: "Lowercase" },
  { value: "str",   label: "To String" },
  { value: "len",   label: "Length" },
  { value: "split", label: "Split Words" },
  { value: "strip", label: "Strip Whitespace" },
  { value: "advanced", label: "Advanced (Type Explorer)" },
];

let metaPromise = null;
const loadMeta = () => {
  if (!metaPromise) {
    metaPromise = getConverterMeta().catch((e) => {
      metaPromise = null;
      throw e;
    });
  }
  return metaPromise;
};

export default function TypeConverterSettings({ localData, patch }) {
  const [meta,      setMeta]      = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [error,     setError]     = useState("");

  const advanced  = localData.operation === "advanced";
  const inputType = localData.input_type || "auto";
  const method    = localData.method || "";

  useEffect(() => {
    if (!advanced) return undefined;
    let cancelled = false;
    loadMeta()
      .then((d) => { if (!cancelled) setMeta(d); })
      .catch(() => { if (!cancelled) setError("Failed to load converter metadata."); });
    return () => { cancelled = true; };
  }, [advanced]);

  const typeOptions = [
    { value: "auto", label: "Auto-detect (runtime)" },
    ...(meta?.types || []).map((t) => ({ value: t, label: t })),
  ];

  const methodList = !meta
    ? []
    : inputType === "auto"
    ? meta.conversions
    : meta.methods[inputType] || [];

  const methodOptions = [
    { value: "", label: "Select operation" },
    ...methodList.map((m) => ({ value: m, label: m })),
  ];
  if (method && !methodList.includes(method) && meta) {
    methodOptions.push({ value: method, label: `⚠ ${method} (not valid for ${inputType})` });
  }

  const isConversion = method.endsWith("()");

  const handleDetect = async () => {
    const value = (localData.input_value ?? "").toString();
    if (!value.trim()) return;
    setDetecting(true);
    setError("");
    try {
      const { type } = await detectConverterType(value);
      if (!meta?.types.includes(type)) {
        setError(`Detected type '${type}' is not supported.`);
      } else {
        patch({ input_type: type, method: "" });
      }
    } catch {
      setError("Failed to detect type.");
    } finally {
      setDetecting(false);
    }
  };

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

      {advanced && (
        <>
          <TextAreaField
            label="Input value *"
            value={localData.input_value}
            onChange={(val) => patch({ input_value: val })}
            placeholder="e.g. [1, 2, 3]  or  hello"
            rows={3}
          />
          <div style={sectionNote}>
            Required: input comes from a connected node or Input Value Mapping.
            The value above is used only when none is supplied.
          </div>

          <SelectField
            label="Input Type"
            value={inputType}
            onChange={(val) => patch({ input_type: val, method: "" })}
            options={typeOptions}
          />

          <div style={fieldWrap}>
            <button
              type="button"
              style={{
                ...miniBtn,
                ...(detecting || !(localData.input_value || "").toString().trim() ? miniBtnDisabled : {}),
              }}
              disabled={detecting || !(localData.input_value || "").toString().trim()}
              onClick={handleDetect}
            >
              {detecting ? "Detecting…" : "Detect Type"}
            </button>
          </div>

          <SelectField
            label="Operation / Method *"
            value={method}
            onChange={(val) => patch({ method: val })}
            options={methodOptions}
          />

          {method && !isConversion && (
            <Field
              label="Arguments (comma separated, optional)"
              value={localData.method_args}
              onChange={(val) => patch({ method_args: val })}
              placeholder="e.g. 'a', 2"
            />
          )}

          {!method && <div style={infoBox(true)}>⚠ Select an operation / method.</div>}
          {error && <div style={infoBox(true)}>⚠ {error}</div>}
        </>
      )}
    </>
  );
}