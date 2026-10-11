// src/registry/BaseNode.jsx

import React from "react";
import { Handle, Position } from "reactflow";

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
}) {
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
          }}
        >
          {title}
        </span>
      </div>

      <div style={{ fontSize: 11, color: accentText, opacity: 0.6 }}>{subtitle}</div>

      {source && <Handle type="source" position={Position.Right} style={handleStyle} />}
    </div>
  );
}