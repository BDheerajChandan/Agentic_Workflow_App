// src/components/MessageBubble.jsx

import React from "react";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`bubble-row ${isUser ? "bubble-row-user" : "bubble-row-bot"}`}>
      <div
        className={`bubble ${
          isUser ? "bubble-user" : message.error ? "bubble-error" : "bubble-bot"
        }`}
      >
        <div className="bubble-role">{isUser ? "You" : message.error ? "Error" : "Bot"}</div>
        <div className="bubble-text">{message.content}</div>
      </div>
    </div>
  );
}