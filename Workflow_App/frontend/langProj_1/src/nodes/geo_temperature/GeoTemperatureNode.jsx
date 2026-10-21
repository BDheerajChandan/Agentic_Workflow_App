// src/nodes/geo_temperature/GeoTemperatureNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function GeoTemperatureNode() {
  return (
    <BaseNode
      icon="🌡"
      title="Geo Temperature"
      subtitle="Click to configure"
      accent="#fb923c"
      accentText="#fdba74"
      gradient="linear-gradient(135deg, #431407 0%, #7c2d12 100%)"
      handleBorder="#431407"
      shadow="rgba(251,146,60,0.25)"
    />
  );
}