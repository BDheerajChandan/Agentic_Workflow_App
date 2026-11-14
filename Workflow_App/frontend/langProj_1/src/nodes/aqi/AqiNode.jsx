// src/nodes/aqi/AqiNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function AqiNode() {
  return (
    <BaseNode
      icon="🌫"
      title="AQI"
      subtitle="Air quality by location"
      accent="#a3e635"
      accentText="#bef264"
      gradient="linear-gradient(135deg, #1a2e05 0%, #365314 100%)"
      handleBorder="#1a2e05"
      shadow="rgba(163,230,53,0.25)"
    />
  );
}