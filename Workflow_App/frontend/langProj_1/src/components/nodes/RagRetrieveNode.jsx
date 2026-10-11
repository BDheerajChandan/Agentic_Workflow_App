// components/nodes/RagRetrieveNode.jsx  (REPLACE ENTIRE FILE)

import React from "react";
import BaseNode from "./BaseNode";

export default function RagRetrieveNode() {
  return (
    <BaseNode
      icon="📚"
      title="RAG Retrieve"
      subtitle="Click to configure"
      accent="#38bdf8"
      accentText="#7dd3fc"
      gradient="linear-gradient(135deg, #0c4a6e 0%, #075985 100%)"
      handleBorder="#0c4a6e"
      shadow="rgba(56,189,248,0.25)"
    />
  );
}