// src/registry/settings/ifElseSettings.jsx

import React from "react";
import { Field, SelectField } from "./fields";
import VariableInput from "./VariableInput";
import { conditionsSummary } from "../../utils/conditionText";
import {
  fieldWrap, lbl, rowBox, rowHead, miniBtn, miniBtnDanger, miniBtnDisabled,
  infoBox, sectionNote,
} from "./styles";

const OPERATORS = [
  { value: "<",      label: "<  Less than" },
  { value: ">",      label: ">  Greater than" },
  { value: "<=",     label: "<=  Less than or equal" },
  { value: ">=",     label: ">=  Greater than or equal" },
  { value: "==",     label: "==  Equal to" },
  { value: "!=",     label: "!=  Not equal to" },
  { value: "custom", label: "Custom Expression" },
];

const SOURCES = [
  { value: "static",   label: "Static value" },
  { value: "variable", label: "State variable" },
  { value: "node",     label: "Node value" },
];

const TYPES = [
  { value: "auto",  label: "auto (detect)" },
  { value: "str",   label: "str" },
  { value: "int",   label: "int" },
  { value: "float", label: "float" },
  { value: "bool",  label: "bool" },
  { value: "list",  label: "list" },
  { value: "dict",  label: "dict" },
  { value: "null",  label: "null" },
];

const LOGIC = [
  { value: "AND", label: "AND" },
  { value: "OR",  label: "OR" },
];

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
const blank = () => ({ id: newId(), description: "", left: "", operator: "==", right: "", expression: "", expression_type: "auto", logic: "AND" });

const isCustom = (c) => c.operator === "custom";

// One operand = source (static / state variable / node value) + type + value.
// The value stays a plain string ("18" or "{{name}}") so the backend format is unchanged.
function Operand({ side, label, c, upd, common, placeholder }) {
  const source = c[`${side}_source`] || "static";
  const type = c[`${side}_type`] || "auto";
  return (
    <>
      <SelectField
        label={`${label} Source`}
        value={source}
        onChange={(val) => upd(c.id, { [`${side}_source`]: val, [side]: "" })}
        options={SOURCES}
      />
      <SelectField
        label={`${label} Type`}
        value={type}
        onChange={(val) => upd(c.id, { [`${side}_type`]: val })}
        options={TYPES}
      />
      {source === "static" ? (
        <Field
          label={label}
          value={c[side]}
          onChange={(val) => upd(c.id, { [side]: val })}
          placeholder={placeholder}
        />
      ) : (
        <VariableInput
          {...common}
          label={label}
          only={source === "variable" ? "variables" : "nodes"}
          value={c[side]}
          onChange={(val) => upd(c.id, { [side]: val })}
          placeholder={source === "variable" ? "{{my_variable}}" : "{{node_1.output}}"}
        />
      )}
    </>
  );
}

export default function IfElseSettings({ localData, patch, selectedNodeId, flowId, variablesVersion }) {
  const conds = Array.isArray(localData.conditions) && localData.conditions.length
    ? localData.conditions
    : [{ ...blank(), id: "c1" }];

  const setConds = (list) => patch({ conditions: list });
  const upd = (id, u) => setConds(conds.map((c) => (c.id === id ? { ...c, ...u } : c)));
  const add = () => setConds([...conds, blank()]);
  const remove = (id) => conds.length > 1 && setConds(conds.filter((c) => c.id !== id));

  const legacy = localData.legacy_default;
  const legacyEdges = Array.isArray(legacy?.edges) ? legacy.edges : [];

  const errors = [];
  conds.forEach((c, i) => {
    if (isCustom(c)) {
      if (!(c.expression || "").trim()) errors.push(`Condition ${i + 1}: expression is required.`);
    } else {
      if (!(c.left || "").trim()) errors.push(`Condition ${i + 1}: left operand is required.`);
      if (!(c.right || "").trim()) {
        errors.push(`Condition ${i + 1}: right operand is required (use "" for an empty string).`);
      }
    }
  });

  const common = { nodeId: selectedNodeId, flowId, variablesVersion };

  return (
    <>
      <div style={sectionNote}>
        Two branches only: True and False. Conditions are evaluated in order; AND binds tighter than OR.
        An invalid expression, missing variable or type mismatch fails the node. It never routes to False.
        Values keep their type: 18 is a number, "18" is a string.
      </div>

      <Field
        label="Condition Name / Description (optional)"
        value={localData.description}
        onChange={(val) => patch({ description: val })}
        placeholder="e.g. Is adult applicant"
      />

      {conds.map((c, idx) => (
        <div key={c.id} style={rowBox}>
          <div style={rowHead}>
            <span style={{ ...lbl, marginBottom: 0 }}>Condition {idx + 1}</span>
            <button
              type="button"
              style={{ ...miniBtnDanger, ...(conds.length > 1 ? {} : miniBtnDisabled) }}
              disabled={conds.length <= 1}
              onClick={() => remove(c.id)}
            >
              ✕ Remove
            </button>
          </div>

          <Field
            label="Description (optional)"
            value={c.description}
            onChange={(val) => upd(c.id, { description: val })}
          />

          {!isCustom(c) && (
            <Operand side="left" label="Left Operand" c={c} upd={upd} common={common} placeholder="18" />
          )}

          <SelectField
            label="Operator"
            value={c.operator || "=="}
            onChange={(val) => upd(c.id, { operator: val })}
            options={OPERATORS}
          />

          {isCustom(c) ? (
            <>
              <SelectField
                label="Expression Type (applies to every {{ }})"
                value={c.expression_type || "auto"}
                onChange={(val) => upd(c.id, { expression_type: val })}
                options={TYPES}
              />
              <VariableInput
                {...common}
                label="Expression"
                mode="append"
                multiline
                rows={3}
                value={c.expression}
                onChange={(val) => upd(c.id, { expression: val })}
                placeholder={"{{Start.a}} % {{Start.b}} == 0"}
              />
              <div style={sectionNote}>
                Mix state variables, node values and literals: {"{{Start.a}} % {{Start.b}} == 0"}.
                Operators: + - * / // % &lt; &gt; &lt;= &gt;= == != and or not in.
                Override one reference with {"{{ref:int}}"} (auto, str, int, float, bool, list, dict, null).
              </div>
            </>
          ) : (
            <Operand
              side="right"
              label="Right Operand"
              c={c}
              upd={upd}
              common={common}
              placeholder={'18, "India", true or null'}
            />
          )}

          {idx < conds.length - 1 && (
            <SelectField
              label="Join With Next Condition"
              value={c.logic || "AND"}
              onChange={(val) => upd(c.id, { logic: val })}
              options={LOGIC}
            />
          )}
        </div>
      ))}

      <div style={{ marginTop: 10 }}>
        <button type="button" style={miniBtn} onClick={add}>＋ Add Condition</button>
      </div>

      <div style={{ ...fieldWrap, marginTop: 14 }}>
        <label style={lbl}>Complete Condition</label>
        <div style={{ ...sectionNote, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 0 }}>
          {conditionsSummary(conds)}
        </div>
      </div>

      <Field
        label="True Branch Label"
        value={localData.true_label ?? "True"}
        onChange={(val) => patch({ true_label: val })}
      />
      <Field
        label="False Branch Label"
        value={localData.false_label ?? "False"}
        onChange={(val) => patch({ false_label: val })}
      />

      {(legacyEdges.length > 0 || legacy?.config) && (
        <div style={infoBox(true)}>
          <div style={{ marginBottom: 6 }}>
            ⚠ Legacy Default branch: If-Else no longer has one. {legacyEdges.length} connection(s) were removed
            from the canvas and kept here for review (never converted to True/False).
          </div>
          {legacyEdges.map((e) => (
            <div key={e.id}>→ {e.target} (edge {e.id})</div>
          ))}
          <div style={{ marginTop: 6 }}>Reconnect the True/False branches as needed, Save, then dismiss.</div>
          <button
            type="button"
            style={{ ...miniBtn, marginTop: 8 }}
            onClick={() => patch({ legacy_default: undefined })}
          >
            Dismiss
          </button>
        </div>
      )}

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}