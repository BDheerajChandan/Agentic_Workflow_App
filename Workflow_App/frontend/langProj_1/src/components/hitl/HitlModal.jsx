// src/components/hitl/HitlModal.jsx
// Modal shell for the Run Graph button. Uses the same shared cards as the Playground and Chatbot.

import React from "react";
import InteractionCard from "./HitlCards";

export default function HitlModal({ request, onSubmit, onCancel }) {
  return (
    <div style={overlay} data-hitl-modal="true">
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <InteractionCard interaction={request} onSubmit={onSubmit} onCancel={onCancel} />
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(2,6,23,0.8)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000,
};
const panel = { width: 560, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" };