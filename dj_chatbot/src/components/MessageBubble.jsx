// src/components/MessageBubble.jsx

import React from "react";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className={`bubble-row ${isUser ? "bubble-row-user" : "bubble-row-bot"}`}>
      <div
        className={`bubble ${
          isUser ? "bubble-user" : message.error ? "bubble-error" : "bubble-bot"
        }`}
      >
        <div className="bubble-role">{isUser ? "You" : message.error ? "Error" : "Bot"}</div>
        <div className="bubble-text">{message.content}</div>
        {time && <div className="bubble-time">{time}</div>}
      </div>
    </div>
  );
}