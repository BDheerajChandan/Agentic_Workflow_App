// src/nodes/if_else/IfElseNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";
import useNodeData from "../../registry/useNodeData";
import { describeCondition, conditionsSummary } from "../../utils/conditionText";

const MAX_LINES = 3;
const MAX_CHARS = 44;
const cut = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);

const line = {
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  fontSize: 11, fontFamily: "inherit", color: "#e2e8f0",
};

const branchLabel = (custom, fallback) => {
  const t = (custom || "").trim();
  return t && t.toLowerCase() !== fallback.toLowerCase() ? `${fallback} · ${t}` : fallback;
};

export default function IfElseNode({ id }) {
  const data = useNodeData(id) || {};
  const conds = Array.isArray(data.conditions) ? data.conditions : [];
  const shown = conds.slice(0, MAX_LINES);
  const desc = (data.description || "").trim();
  const legacy = Array.isArray(data.legacy_default?.edges) && data.legacy_default.edges.length > 0;

  const handles = [
    {
      id: "true", tag: "TRUE", label: branchLabel(data.true_label, "True"),
      sub: "when the condition is met", color: "#34d399", bg: "rgba(52,211,153,0.08)",
    },
    {
      id: "false", tag: "FALSE", label: branchLabel(data.false_label, "False"),
      sub: "when the condition is not met", color: "#f87171", bg: "rgba(248,113,113,0.08)",
    },
  ];

  const tooltip = conds
    .map((c, i) => {
      const note = (c.description || "").trim();
      const body = `${note ? `[${note}] ` : ""}${describeCondition(c)}`;
      return i < conds.length - 1 ? `${body}\n${c.logic || "AND"}` : body;
    })
    .join("\n") || conditionsSummary(conds);

  return (
    <BaseNode
      icon="⑂"
      title="If-Else"
      subtitle={desc || "Condition"}
      accent="#60a5fa"
      accentText="#93c5fd"
      gradient="linear-gradient(135deg, #172554 0%, #1e3a8a 100%)"
      handleBorder="#172554"
      shadow="rgba(96,165,250,0.25)"
      handles={handles}
      layoutKey={`${shown.length}|${conds.length}|${legacy ? 1 : 0}`}
    >
      <div
        title={tooltip || "No condition configured"}
        style={{
          padding: "6px 8px", borderRadius: 8, background: "rgba(2,6,23,0.45)",
          border: "1px solid rgba(147,197,253,0.25)",
        }}
      >
        {shown.length === 0 && <div style={{ ...line, color: "#94a3b8" }}>No condition configured</div>}
        {shown.map((c, i) => (
          <React.Fragment key={c.id || i}>
            <div style={line}>{cut(describeCondition(c))}</div>
            {i < shown.length - 1 && (
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "#93c5fd", margin: "2px 0" }}>
                {c.logic || "AND"}
              </div>
            )}
          </React.Fragment>
        ))}
        {conds.length > MAX_LINES && (
          <div style={{ ...line, color: "#93c5fd", marginTop: 2 }}>
            +{conds.length - MAX_LINES} more (hover / open settings)
          </div>
        )}
      </div>
      {legacy && (
        <div style={{ ...line, color: "#fbbf24", marginTop: 6 }}>⚠ Legacy Default link removed — see settings</div>
      )}
    </BaseNode>
  );
}