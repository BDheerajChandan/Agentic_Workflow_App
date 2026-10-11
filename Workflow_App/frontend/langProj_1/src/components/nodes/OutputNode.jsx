// components/nodes/OutputNode.jsx

import React from "react";
import BaseNode from "./BaseNode";

export default function OutputNode() {
  return (
    <BaseNode
      icon="◎"
      title="Output"
      subtitle="Terminal node"
      accent="#f87171"
      accentText="#fca5a5"
      gradient="linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)"
      handleBorder="#7f1d1d"
      shadow="rgba(239,68,68,0.25)"
      source={false}
    />
  );
}