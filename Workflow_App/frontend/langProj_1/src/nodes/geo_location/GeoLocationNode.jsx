// src/nodes/geo_location/GeoLocationNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function GeoLocationNode() {
  return (
    <BaseNode
      icon="📍"
      title="Geo Location"
      subtitle="Click to configure"
      accent="#2dd4bf"
      accentText="#5eead4"
      gradient="linear-gradient(135deg, #042f2e 0%, #134e4a 100%)"
      handleBorder="#042f2e"
      shadow="rgba(45,212,191,0.25)"
    />
  );
}