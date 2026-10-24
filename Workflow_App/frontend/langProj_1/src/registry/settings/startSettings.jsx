// src/registry/settings/startSettings.jsx

import React from "react";
import { BASE_URL } from "../../services/api";
import { useAttachments, AttachButton, AttachmentList } from "../../components/files/AttachmentBar";
import { fieldWrap, lbl, inp, sectionNote } from "./styles";

export default function StartSettings({ globalInput, onGlobalInputChange, localData, patch, flowId }) {
  const att = useAttachments(
    BASE_URL,
    { flow_id: flowId },
    localData?.files || [],
    (files) => patch({ files })
  );

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

      <div style={fieldWrap}>
        <label style={lbl}>Attachments</label>
        <AttachButton att={att} style={{ padding: "6px 12px", fontSize: 12 }} />
        <AttachmentList att={att} style={{ marginTop: 8 }} />
        <div style={{ ...sectionNote, marginTop: 8, marginBottom: 0 }}>
          Exposed as "Uploaded Files" for Input Value Mapping and passed to File Reader.
        </div>
      </div>
    </>
  );
}