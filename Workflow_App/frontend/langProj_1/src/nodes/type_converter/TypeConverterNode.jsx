// src/nodes/type_converter/TypeConverterNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function TypeConverterNode() {
  return (
    <BaseNode
      icon="⚙"
      title="Type Converter"
      subtitle="Click to configure"
      accent="#a78bfa"
      accentText="#c4b5fd"
      gradient="linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"
      handleBorder="#1e1b4b"
      shadow="rgba(139,92,246,0.25)"
    />
  );
}