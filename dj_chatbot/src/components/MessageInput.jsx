// src/components/MessageInput.jsx

import React, { useState } from "react";
import { API_BASE } from "../services/botApi";
import { useAttachments, AttachButton, AttachmentList } from "./files/AttachmentBar";

export default function MessageInput({ onSend, disabled, loading, botId, sessionId }) {
  const [text, setText] = useState("");
  const att = useAttachments(API_BASE, { bot_id: botId, session_id: sessionId });

  const canSend = !disabled && !att.uploading && (text.trim() || att.files.length > 0);

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), att.files);
    setText("");
    att.clear();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="input-area">
      <AttachmentList att={att} style={{ padding: "10px 20px 0" }} />
      <div className="input-bar">
        <AttachButton att={att} disabled={disabled} />
        <textarea
          className="input-box"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
        />
        <button className="btn btn-primary send-btn" onClick={submit} disabled={!canSend}>
          {loading ? "Running…" : "Send"}
        </button>
      </div>
    </div>
  );
}