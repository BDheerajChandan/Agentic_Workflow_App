// RagRetrieveNode.jsx

import React from "react";
import { Handle, Position } from "reactflow";

export default function RagRetrieveNode() {
  return (
    <div style={box}>
      <Handle type="target" position={Position.Left} style={handle} />

      <div style={title}>RAG Retrieve</div>
      <div style={sub}>Fetch relevant docs</div>

      <Handle type="source" position={Position.Right} style={handle} />
    </div>
  );
}

const box = {
  padding: 14,
  borderRadius: 12,
  background: "#0f172a",
  color: "white",
  border: "1px solid #334155",
  minWidth: 160,
};

const title = { fontWeight: 700, color: "#38bdf8" };
const sub = { fontSize: 11, color: "#94a3b8" };

const handle = {
  width: 10,
  height: 10,
  background: "#38bdf8",
};