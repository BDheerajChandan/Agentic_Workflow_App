// src/components/Sidebar.jsx

import React from "react";
import { shortId } from "../utils/ids";

export default function Sidebar({
  bot,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onSwitchBot,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-bot">
        <div className="sidebar-bot-label">Current Bot</div>
        <div className="sidebar-bot-name">🤖 {bot.name}</div>
        <button className="btn btn-ghost btn-sm" onClick={onSwitchBot}>
          Switch / Manage Bots
        </button>
      </div>

      <button className="btn btn-primary btn-block" onClick={onNewChat}>
        ＋ New Chat
      </button>

      <div className="sidebar-section">Chat History</div>
      <div className="session-list">
        {sessions.length === 0 && <div className="muted">No chats yet.</div>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${s.id === activeSessionId ? "session-item-active" : ""}`}
            onClick={() => onSelectSession(s.id)}
          >
            <div className="session-title">{s.title}</div>
            <div className="session-id">ID: {shortId(s.id)}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}