// src/nodes/file_reader/FileReaderNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function FileReaderNode() {
  return (
    <BaseNode
      icon="📄"
      title="File Reader"
      subtitle="Extract file content"
      accent="#22d3ee"
      accentText="#67e8f9"
      gradient="linear-gradient(135deg, #083344 0%, #155e75 100%)"
      handleBorder="#083344"
      shadow="rgba(34,211,238,0.25)"
    />
  );
}