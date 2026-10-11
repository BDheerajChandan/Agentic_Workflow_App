// nodes/OutputNode.jsx
import React from "react";
import { Handle, Position } from "reactflow";

export default function OutputNode() {
  return (
    <div style={box}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div style={header}>
        <span style={icon}>◎</span>
        <span style={title}>Output</span>
      </div>
      <div style={sub}>Terminal node</div>
    </div>
  );
}

const handleStyle = {
  width: 12,
  height: 12,
  background: "#f87171",
  border: "2px solid #7f1d1d",
};

const box = {
  padding: "14px 18px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)",
  color: "white",
  border: "1.5px solid #dc2626",
  minWidth: 150,
  boxShadow: "0 4px 24px rgba(239,68,68,0.25)",
};

const header = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const icon = {
  fontSize: 14,
  color: "#fca5a5",
};

const title = {
  fontWeight: 700,
  fontSize: 13,
  color: "#fca5a5",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const sub = {
  fontSize: 11,
  color: "#fca5a5",
  opacity: 0.6,
};