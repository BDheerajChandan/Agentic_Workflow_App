// src/nodes/switch/SwitchNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";
import useNodeData from "../../registry/useNodeData";
import { resolveCase } from "../../utils/caseValue";

export default function SwitchNode({ id }) {
  const data = useNodeData(id) || {};
  const cases = Array.isArray(data.cases) ? data.cases : [];
  const def = data.default || {};
  const input = (data.input || "").trim();

  const handles = cases.map((c, i) => {
    const r = resolveCase(c);
    return {
      id: `case_${c.id}`,
      tag: "CASE",
      label: (c.label || "").trim() || `Case ${i + 1}`,
      sub: `Match value: ${r.text} · ${r.kind}`,
      color: "#f0abfc",
      bg: "rgba(232,121,249,0.08)",
    };
  });
  handles.push({
    id: "default",
    tag: "DEFAULT",
    label: (def.label || "").trim() || "Default",
    sub: "No matching case",
    color: "#f87171",
    bg: "rgba(248,113,113,0.08)",
  });

  return (
    <BaseNode
      icon="⇶"
      title="Switch"
      subtitle="Multi-case routing"
      accent="#e879f9"
      accentText="#f0abfc"
      gradient="linear-gradient(135deg, #4a044e 0%, #701a75 100%)"
      handleBorder="#4a044e"
      shadow="rgba(232,121,249,0.25)"
      handles={handles}
      layoutKey={String(cases.length)}
    >
      <div
        title={input || "Uses the incoming value"}
        style={{
          padding: "6px 8px", borderRadius: 8, background: "rgba(2,6,23,0.45)",
          border: "1px solid rgba(240,171,252,0.25)", fontSize: 11, color: "#e2e8f0",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        Input: {input || "(incoming value)"}
      </div>
    </BaseNode>
  );
}