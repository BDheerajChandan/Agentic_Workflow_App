// components/nodes/TypeConverterNode.jsx

import React from "react";
import { Handle, Position } from "reactflow";

export default function TypeConverterNode() {
  return (
    <div style={box}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div style={header}>
        <span style={icon}>⚙</span>
        <span style={title}>Type Converter</span>
      </div>
      <div style={sub}>Click to configure</div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

const handleStyle = {
  width: 12,
  height: 12,
  background: "#a78bfa",
  border: "2px solid #1e1b4b",
};

const box = {
  padding: "14px 18px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
  color: "white",
  border: "1.5px solid #4c1d95",
  minWidth: 150,
  boxShadow: "0 4px 24px rgba(139,92,246,0.25)",
};

const header = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const icon = {
  fontSize: 14,
  color: "#c4b5fd",
};

const title = {
  fontWeight: 700,
  fontSize: 13,
  color: "#c4b5fd",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const sub = {
  fontSize: 11,
  color: "#c4b5fd",
  opacity: 0.6,
};