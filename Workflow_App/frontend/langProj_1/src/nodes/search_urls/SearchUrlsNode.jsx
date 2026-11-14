// src/nodes/search_urls/SearchUrlsNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function SearchUrlsNode() {
  return (
    <BaseNode
      icon="🔎"
      title="Search_URLs"
      subtitle="Web search → URLs"
      accent="#38bdf8"
      accentText="#7dd3fc"
      gradient="linear-gradient(135deg, #082f49 0%, #0c4a6e 100%)"
      handleBorder="#082f49"
      shadow="rgba(56,189,248,0.25)"
    />
  );
}