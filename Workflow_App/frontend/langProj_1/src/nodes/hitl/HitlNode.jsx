// src/nodes/hitl/HitlNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function HitlNode() {
  return (
    <BaseNode
      icon="🙋"
      title="HITL"
      subtitle="Human in the loop"
      accent="#fbbf24"
      accentText="#fcd34d"
      gradient="linear-gradient(135deg, #451a03 0%, #78350f 100%)"
      handleBorder="#451a03"
      shadow="rgba(251,191,36,0.25)"
    />
  );
}