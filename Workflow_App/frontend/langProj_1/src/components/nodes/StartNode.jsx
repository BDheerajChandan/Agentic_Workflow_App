// nodes/StartNode.jsx
import React from "react";
import { Handle, Position } from "reactflow";

export default function StartNode() {
  return (
    <div style={box}>
      <div style={header}>
        <span style={dot} />
        <span style={title}>Start</span>
      </div>
      <div style={sub}>Entry point</div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

const handleStyle = {
  width: 12,
  height: 12,
  background: "#34d399",
  border: "2px solid #064e3b",
};

const box = {
  padding: "14px 18px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
  color: "white",
  border: "1.5px solid #059669",
  minWidth: 150,
  boxShadow: "0 4px 24px rgba(16,185,129,0.25)",
};

const header = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 4,
};

const dot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#34d399",
  boxShadow: "0 0 6px #34d399",
  display: "inline-block",
};

const title = {
  fontWeight: 700,
  fontSize: 13,
  color: "#6ee7b7",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const sub = {
  fontSize: 11,
  color: "#6ee7b7",
  opacity: 0.6,
};