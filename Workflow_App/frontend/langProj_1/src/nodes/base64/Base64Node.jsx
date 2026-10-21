// src/nodes/base64/Base64Node.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function Base64Node() {
  return (
    <BaseNode
      icon="🔐"
      title="Base64 E/D"
      subtitle="Click to configure"
      accent="#facc15"
      accentText="#fde68a"
      gradient="linear-gradient(135deg, #422006 0%, #713f12 100%)"
      handleBorder="#422006"
      shadow="rgba(250,204,21,0.25)"
    />
  );
}