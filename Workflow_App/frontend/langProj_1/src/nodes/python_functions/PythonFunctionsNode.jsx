// src/nodes/python_functions/PythonFunctionsNode.jsx

import React from "react";
import BaseNode from "../../registry/BaseNode";

export default function PythonFunctionsNode() {
  return (
    <BaseNode
      icon="🐍"
      title="Python Functions"
      subtitle="Click to configure"
      accent="#4ade80"
      accentText="#86efac"
      gradient="linear-gradient(135deg, #052e16 0%, #14532d 100%)"
      handleBorder="#052e16"
      shadow="rgba(74,222,128,0.25)"
    />
  );
}