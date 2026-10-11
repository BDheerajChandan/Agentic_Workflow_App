// src/registry/settings/startSettings.jsx

import React from "react";
import { fieldWrap, lbl, inp, sectionNote } from "./styles";

export default function StartSettings({ globalInput, onGlobalInputChange }) {
  return (
    <>
      <div style={sectionNote}>
        Entry point of the workflow. The value below is the initial input
        passed to the graph when Run is clicked.
      </div>
      <div style={fieldWrap}>
        <label style={lbl}>Input value</label>
        <textarea
          value={globalInput ?? ""}
          placeholder="Enter starting input…"
          onChange={(e) => onGlobalInputChange(e.target.value)}
          rows={5}
          style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>
    </>
  );
}