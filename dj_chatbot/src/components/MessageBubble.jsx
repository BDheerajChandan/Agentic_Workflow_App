// src/components/MessageBubble.jsx

import React from "react";
import ReactMarkdown from "react-markdown";
import InteractionCard from "./hitl/HitlCards";

const fmtSize = (n) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`;

const mdComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
};

export default function MessageBubble({ message, onRespond, onRetry }) {
  const isUser = message.role === "user";
  const interaction = message.meta?.interaction;
  const files = message.meta?.files;
  const isError = message.error || message.meta?.error;
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  if (interaction) {
    return (
      <div className="bubble-row bubble-row-bot">
        <div className="bubble bubble-card">
          <InteractionCard
            interaction={interaction}
            onSubmit={(response) => onRespond(interaction.pause_id, { response })}
            onCancel={() => onRespond(interaction.pause_id, { cancelled: true })}
          />
        </div>
      </div>
    );
  }

  const waiting = message.streaming && !message.content;
  const renderMarkdown = !isUser && !isError && !!message.content;

  return (
    <div className={`bubble-row ${isUser ? "bubble-row-user" : "bubble-row-bot"}`}>
      <div className={`bubble ${isUser ? "bubble-user" : isError ? "bubble-error" : "bubble-bot"}`}>
        <div className="bubble-role">{isUser ? "You" : isError ? "Error" : "Bot"}</div>

        {waiting && <div className="bubble-loading">Running workflow…</div>}

        {message.content && !(files?.length && message.content === files.map((f) => f.file_name).join(", ")) && (
          renderMarkdown ? (
            <div className="bubble-text bubble-md">
              <ReactMarkdown components={mdComponents}>{message.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="bubble-text">{message.content}</div>
          )
        )}

        {message.streaming && message.content && <span className="stream-caret">▍</span>}

        {files?.length > 0 && (
          <div className="bubble-files">
            {files.map((f) => (
              <div key={f.file_id}>📄 {f.file_name} · {fmtSize(f.size_bytes)}</div>
            ))}
          </div>
        )}

        {message.stopped && <div className="bubble-note">■ Generation stopped (partial response, not saved)</div>}

        {message.retryable && onRetry && (
          <button className="btn btn-ghost btn-sm retry-btn" onClick={() => onRetry(message.retry)}>
            ⟳ Retry
          </button>
        )}

        {time && !message.streaming && <div className="bubble-time">{time}</div>}
      </div>
    </div>
  );
}