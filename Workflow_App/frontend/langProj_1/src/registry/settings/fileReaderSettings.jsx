// src/registry/settings/fileReaderSettings.jsx

import React from "react";
import { fieldWrap, checkRow, sectionNote } from "./styles";

export default function FileReaderSettings({ localData, patch }) {
  return (
    <>
      <div style={sectionNote}>
        Reads files uploaded from the Start node, Playground or Chatbot (or file references
        from another node). Map "Uploaded Files" from Start via Input Value Mapping, or connect
        it directly. Outputs: content, metadata, results, language (dot-notation paths supported,
        e.g. metadata.file_name).
      </div>
      <div style={fieldWrap}>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={localData.include_results !== false}
            onChange={(e) => patch({ include_results: e.target.checked })}
          />
          Include structured results (pages / sheets / slides / tables)
        </label>
      </div>
      <div style={sectionNote}>
        Scanned PDFs and images need OCR, which is not enabled. Legacy .doc/.ppt/.xls need
        LibreOffice on the server.
      </div>
    </>
  );
}