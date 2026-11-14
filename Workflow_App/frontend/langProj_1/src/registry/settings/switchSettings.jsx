// src/registry/settings/switchSettings.jsx

import React from "react";
import { useReactFlow } from "reactflow";
import { Field, SelectField } from "./fields";
import VariableInput from "./VariableInput";
import { resolveCase, switchCaseErrors } from "../../utils/caseValue";
import {
  fieldWrap, lbl, rowBox, rowHead, miniBtn, miniBtnDanger, miniBtnDisabled,
  infoBox, sectionNote,
} from "./styles";

const TYPES = [
  { value: "auto",   label: "Auto-detect" },
  { value: "string", label: "String" },
  { value: "char",   label: "Character" },
  { value: "int",    label: "Integer" },
  { value: "float",  label: "Float" },
  { value: "bool",   label: "Boolean" },
  { value: "null",   label: "Null" },
];

const BOOLS = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
];

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
const blank = () => ({ id: newId(), label: "", type: "auto", value: "" });

export default function SwitchSettings({ localData, patch, selectedNodeId, flowId, variablesVersion }) {
  const { getEdges, setEdges } = useReactFlow();

  const cases = Array.isArray(localData.cases) && localData.cases.length
    ? localData.cases
    : [{ ...blank(), id: "c1" }];
  const def = localData.default || {};

  const setCases = (list) => patch({ cases: list });
  const upd = (id, u) => setCases(cases.map((c) => (c.id === id ? { ...c, ...u } : c)));
  const add = () => setCases([...cases, blank()]);

  const remove = (c) => {
    if (cases.length <= 1) return;
    const handle = `case_${c.id}`;
    const linked = getEdges().some((e) => e.source === selectedNodeId && e.sourceHandle === handle);
    if (linked && !window.confirm("Removing this case removes its connections. Continue?")) return;
    setCases(cases.filter((x) => x.id !== c.id));
    setEdges((eds) => eds.filter((e) => !(e.source === selectedNodeId && e.sourceHandle === handle)));
  };

  const caseErrors = switchCaseErrors(cases);

  return (
    <>
      <div style={sectionNote}>
        Each case has a Label (shown on the node) and a separate typed Match Value (used for routing).
        Exactly one branch runs: the matching case, or Default when none match. 18 does not match "18"
        unless the type is String. Leave the input empty to use the incoming value.
      </div>

      <VariableInput
        nodeId={selectedNodeId}
        flowId={flowId}
        variablesVersion={variablesVersion}
        label="Switch Input"
        value={localData.input}
        onChange={(val) => patch({ input: val })}
        placeholder="{{Start.status}}"
      />

      {cases.map((c, idx) => {
        const r = resolveCase(c);
        return (
          <div key={c.id} style={rowBox}>
            <div style={rowHead}>
              <span style={{ ...lbl, marginBottom: 0 }}>Case {idx + 1}</span>
              <button
                type="button"
                style={{ ...miniBtnDanger, ...(cases.length > 1 ? {} : miniBtnDisabled) }}
                disabled={cases.length <= 1}
                onClick={() => remove(c)}
              >
                ✕ Remove
              </button>
            </div>

            <Field
              label="Case Label (display name)"
              value={c.label}
              onChange={(val) => upd(c.id, { label: val })}
              placeholder="Approved Route"
            />

            <SelectField
              label="Match Value Type"
              value={c.type || "auto"}
              onChange={(val) =>
                upd(c.id, { type: val, ...(val === "null" ? { value: "" } : {}), ...(val === "bool" ? { value: "true" } : {}) })
              }
              options={TYPES}
            />

            {c.type === "null" ? (
              <div style={sectionNote}>Matches a null value.</div>
            ) : c.type === "bool" ? (
              <SelectField
                label="Match Value"
                value={String(c.value || "true").toLowerCase()}
                onChange={(val) => upd(c.id, { value: val })}
                options={BOOLS}
              />
            ) : (
              <Field
                label="Match Value"
                value={c.value}
                onChange={(val) => upd(c.id, { value: val })}
                placeholder={'Approved, 18, 0.5, "text"'}
              />
            )}
            <div style={{ fontSize: 10, color: "#64748b", marginTop: -6 }}>
              Interpreted as {r.kind}: {r.text}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 10 }}>
        <button type="button" style={miniBtn} onClick={add}>＋ Add Case</button>
      </div>

      <Field
        label="Default Label"
        value={def.label ?? "Default"}
        onChange={(val) => patch({ default: { ...def, label: val } })}
        placeholder="Unknown Status"
      />

      <div style={{ ...fieldWrap, marginTop: 6 }}>
        <label style={lbl}>Configured Cases</label>
        <div style={{ ...sectionNote, marginBottom: 0 }}>
          {cases.map((c, i) => {
            const r = resolveCase(c);
            return (
              <div key={c.id} style={{ wordBreak: "break-word" }}>
                {i + 1}. {(c.label || "").trim() || `Case ${i + 1}`} → match {r.text} ({r.kind})
              </div>
            );
          })}
          <div>↳ {(def.label || "").trim() || "Default"} → no matching case</div>
        </div>
      </div>

      {caseErrors.map((e) => (
        <div key={e.message} style={infoBox(true)}>⚠ {e.message}</div>
      ))}
      {caseErrors.some((e) => e.duplicate) && (
        <div style={infoBox(true)}>⚠ Duplicate values make routing ambiguous: Save and Run are blocked until fixed.</div>
      )}
    </>
  );
}