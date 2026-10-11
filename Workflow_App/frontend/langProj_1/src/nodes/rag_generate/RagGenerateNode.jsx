// src/nodes/rag_generate/RagGenerateNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function RagGenerateNode() {
  return (
    <BaseNode
      icon="🧠"
      title="RAG Generate"
      subtitle="Click to configure"
      accent="#a78bfa"
      accentText="#c4b5fd"
      gradient="linear-gradient(135deg, #111827 0%, #1f2937 100%)"
      handleBorder="#111827"
      shadow="rgba(167,139,250,0.25)"
    />
  );
}