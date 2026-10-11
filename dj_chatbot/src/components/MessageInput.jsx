// src/components/MessageInput.jsx

import React, { useState } from "react";

export default function MessageInput({ onSend, disabled, loading }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="input-bar">
      <textarea
        className="input-box"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
      />
      <button
        className="btn btn-primary send-btn"
        onClick={submit}
        disabled={disabled || !text.trim()}
      >
        {loading ? "Running…" : "Send"}
      </button>
    </div>
  );
}