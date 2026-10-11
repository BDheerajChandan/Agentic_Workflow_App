// RagGenerateNode.jsx

import React from "react";
import { Handle, Position } from "reactflow";

export default function RagGenerateNode() {
  return (
    <div style={box}>
      <Handle type="target" position={Position.Left} style={handle} />

      <div style={title}>RAG Generate</div>
      <div style={sub}>LLM answer from context</div>

      <Handle type="source" position={Position.Right} style={handle} />
    </div>
  );
}

const box = {
  padding: 14,
  borderRadius: 12,
  background: "#111827",
  color: "white",
  border: "1px solid #4b5563",
  minWidth: 160,
};

const title = { fontWeight: 700, color: "#a78bfa" };
const sub = { fontSize: 11, color: "#c4b5fd" };

const handle = {
  width: 10,
  height: 10,
  background: "#a78bfa",
};