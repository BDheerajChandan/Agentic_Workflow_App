// src/nodes/time_operation/TimeOperationNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function TimeOperationNode() {
  return (
    <BaseNode
      icon="⏱"
      title="Time Operation"
      subtitle="Click to configure"
      accent="#f472b6"
      accentText="#f9a8d4"
      gradient="linear-gradient(135deg, #500724 0%, #831843 100%)"
      handleBorder="#500724"
      shadow="rgba(244,114,182,0.25)"
    />
  );
}