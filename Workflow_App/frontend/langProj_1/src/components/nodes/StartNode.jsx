// components/nodes/StartNode.jsx

import React from "react";
import BaseNode from "./BaseNode";

const dot = (
  <span
    style={{
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "#34d399",
      boxShadow: "0 0 6px #34d399",
      display: "inline-block",
    }}
  />
);

export default function StartNode() {
  return (
    <BaseNode
      icon={dot}
      title="Start"
      subtitle="Entry point"
      accent="#34d399"
      accentText="#6ee7b7"
      gradient="linear-gradient(135deg, #064e3b 0%, #065f46 100%)"
      handleBorder="#064e3b"
      shadow="rgba(16,185,129,0.25)"
      target={false}
    />
  );
}