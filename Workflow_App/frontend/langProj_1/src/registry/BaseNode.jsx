// src/registry/BaseNode.jsx

import React, { useEffect } from "react";
import { Handle, Position, useNodeId, useUpdateNodeInternals } from "reactflow";
import useNodeData from "./useNodeData";

const clip = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// handles: [{ id, label, sub?, tag?, color?, bg? }] -> one labelled section + source handle each.
export default function BaseNode({
  icon,
  title,
  subtitle = "Click to configure",
  accent,
  accentText,
  gradient,
  handleBorder,
  shadow,
  target = true,
  source = true,
  handles,
  children,
  layoutKey = "",
}) {
  const id = useNodeId();
  const data = useNodeData(id);
  const updateInternals = useUpdateNodeInternals();

  const aka = typeof data?.aka === "string" ? data.aka.trim() : "";
  const sig =
    (handles || []).map((h) => `${h.id}:${h.label}:${h.sub || ""}`).join("|") + `#${layoutKey}#${aka}`;

  useEffect(() => {
    if (id && (handles || children)) updateInternals(id);
  }, [id, sig]); // eslint-disable-line

  const handleStyle = {
    width: 12,
    height: 12,
    background: accent,
    border: `2px solid ${handleBorder}`,
  };

  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        background: gradient,
        color: "white",
        border: `1.5px solid ${accent}`,
        minWidth: 150,
        width: handles ? 270 : undefined,
        boxSizing: "border-box",
        boxShadow: `0 4px 24px ${shadow}`,
      }}
    >
      {target && <Handle type="target" position={Position.Left} style={handleStyle} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, color: accentText }}>{icon}</span>
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: accentText,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            wordBreak: "break-word",
          }}
        >
          {aka || title}
        </span>
      </div>

      <div style={{ fontSize: 11, color: accentText, opacity: 0.6, wordBreak: "break-word" }}>
        {aka ? title : subtitle}
      </div>

      {children && <div style={{ marginTop: 8 }}>{children}</div>}

      {handles && handles.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {handles.map((h, i) => {
            const color = h.color || accent;
            return (
              <div
                key={h.id}
                title={h.sub ? `${h.tag ? `${h.tag}: ` : ""}${h.label} — ${h.sub}` : h.label}
                style={{
                  position: "relative",
                  margin: "0 -18px",
                  padding: "7px 26px 7px 18px",
                  background: h.bg || "rgba(255,255,255,0.04)",
                  borderTop: `1px solid ${color}55`,
                  borderBottom: i === handles.length - 1 ? `1px solid ${color}55` : "none",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {h.tag && (
                    <span
                      style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                        padding: "1px 6px", borderRadius: 4, border: `1px solid ${color}`, color,
                      }}
                    >
                      {h.tag}
                    </span>
                  )}
                  <span style={{ ...clip, fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{h.label}</span>
                </div>
                {h.sub && (
                  <span style={{ ...clip, fontSize: 11, color: accentText, opacity: 0.85, marginTop: 2 }}>
                    {h.sub}
                  </span>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={h.id}
                  style={{ ...handleStyle, background: color, top: "50%" }}
                />
              </div>
            );
          })}
        </div>
      )}

      {source && !handles && <Handle type="source" position={Position.Right} style={handleStyle} />}
    </div>
  );
}