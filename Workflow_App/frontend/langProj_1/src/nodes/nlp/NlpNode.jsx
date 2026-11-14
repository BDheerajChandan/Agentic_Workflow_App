// src/nodes/nlp/NlpNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";
import useNodeData from "../../registry/useNodeData";

export default function NlpNode({ id }) {
  const data = useNodeData(id);
  const n = Array.isArray(data?.features) ? data.features.length : 0;
  return (
    <BaseNode
      icon="🧬"
      title="NLP"
      subtitle={n ? `${n} feature${n > 1 ? "s" : ""} selected` : "Select features"}
      accent="#fb7185"
      accentText="#fda4af"
      gradient="linear-gradient(135deg, #4c0519 0%, #881337 100%)"
      handleBorder="#4c0519"
      shadow="rgba(251,113,133,0.25)"
    />
  );
}