// src/components/BotSetup.jsx

import React, { useState } from "react";
import { isValidFlowUrl } from "../services/flowApi";

export default function BotSetup({
  bots,
  activeBotId,
  onCreate,
  onSelect,
  onDelete,
  onCancel,
}) {
  const [name, setName] = useState("");
  const [flowUrl, setFlowUrl] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a Bot Name.");
    if (!flowUrl.trim()) return setError("Enter a Flow URL.");
    if (!isValidFlowUrl(flowUrl)) {
      return setError(
        "Invalid Flow URL. Example: http://localhost:5173/flow/abc123XYZ"
      );
    }
    setError("");
    onCreate(name.trim(), flowUrl.trim());
    setName("");
    setFlowUrl("");
  };

  return (
    <div className="setup-root">
      <div className="setup-card">
        <div className="setup-head">
          <div>
            <h1 className="setup-title">DJ Chatbot</h1>
            <div className="muted">Create a Bot and tag it to a Flow URL</div>
          </div>
          {onCancel && (
            <button className="btn btn-ghost" onClick={onCancel}>
              ← Back to chat
            </button>
          )}
        </div>

        <form onSubmit={submit} className="setup-form">
          <label className="lbl">Bot Name</label>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Support Bot"
          />

          <label className="lbl">Flow URL</label>
          <input
            className="inp"
            value={flowUrl}
            onChange={(e) => setFlowUrl(e.target.value)}
            placeholder="http://localhost:5173/flow/abc123XYZ"
          />

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary">
            ＋ Create Bot
          </button>
        </form>

        <div className="lbl" style={{ marginTop: 24 }}>Your Bots</div>
        {bots.length === 0 && <div className="muted">No bots yet.</div>}
        <div className="bot-list">
          {bots.map((b) => (
            <div
              key={b.id}
              className={`bot-item ${b.id === activeBotId ? "bot-item-active" : ""}`}
            >
              <div className="bot-info">
                <div className="bot-name">{b.name}</div>
                <div className="bot-url">{b.flowUrl}</div>
              </div>
              <div className="bot-actions">
                <button className="btn btn-primary btn-sm" onClick={() => onSelect(b.id)}>
                  Use
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (window.confirm(`Delete "${b.name}" and its chats?`)) onDelete(b.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}