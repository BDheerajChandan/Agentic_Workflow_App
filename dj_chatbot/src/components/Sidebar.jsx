// src/components/Sidebar.jsx

import React, { useState } from "react";
import { shortId } from "../utils/ids";

const fmtDate = (iso) => new Date(iso).toLocaleDateString();
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function groupByDate(sessions) {
  const groups = [];
  sessions.forEach((s) => {
    const label = fmtDate(s.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(s);
    else groups.push({ label, items: [s] });
  });
  return groups;
}

export default function Sidebar({
  bot,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onRename,
  onDeleteSession,
  onDeleteSessions,
  onDeleteAll,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bot.name);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [delErr, setDelErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Only ids that belong to this bot's current list can ever be deleted.
  const selectedIds = sessions
    .map((s) => s.session_id)
    .filter((id) => selected.has(id));

  const startEdit = () => {
    setName(bot.name);
    setErr("");
    setEditing(true);
  };

  const saveName = async () => {
    const v = name.trim();
    if (!v) return setErr("Name required.");
    if (v === bot.name) return setEditing(false);
    try {
      await onRename(v);
      setEditing(false);
    } catch (e) {
      setErr(e?.userMessage || "Rename failed.");
    }
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (action, deletedIds) => {
    if (busy) return;
    setBusy(true);
    setDelErr("");
    try {
      await action();
      setSelected((prev) => {
        if (deletedIds === "all") return new Set();
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch (e) {
      setDelErr(e?.userMessage || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteOne = (e, id) => {
    e.stopPropagation();
    run(() => onDeleteSession(id), [id]);
  };

  const deleteSelected = () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected chat(s)? This cannot be undone.`)) return;
    run(() => onDeleteSessions(selectedIds), selectedIds);
  };

  const deleteAll = () => {
    if (!sessions.length) return;
    if (!window.confirm("Delete ALL chats for this bot? This cannot be undone.")) return;
    run(() => onDeleteAll(), "all");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-bot">
        <div className="sidebar-bot-label">Current Bot</div>

        {editing ? (
          <>
            <input
              className="inp"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            {err && <div className="form-error">{err}</div>}
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={saveName}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-bot-name">🤖 {bot.name}</div>
            <div className="muted" style={{ wordBreak: "break-all" }}>
              {bot.workflow_name} · {bot.bot_id}
            </div>
            <button className="btn btn-ghost btn-sm btn-block" onClick={startEdit}>✎ Rename</button>
          </>
        )}
      </div>

      <button className="btn btn-primary btn-block" onClick={onNewChat}>
        ＋ New Chat
      </button>

      <div className="sidebar-section">Chat History</div>

      <div className="history-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={deleteAll}
          disabled={busy || sessions.length === 0}
        >
          Delete All
        </button>
        {selectedIds.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={deleteSelected}
            disabled={busy}
          >
            Delete Selected ({selectedIds.length})
          </button>
        )}
      </div>
      {delErr && <div className="form-error">{delErr}</div>}

      <div className="session-list">
        {sessions.length === 0 && <div className="muted">No chats yet.</div>}
        {groupByDate(sessions).map((g) => (
          <React.Fragment key={g.label}>
            <div className="session-date">{g.label}</div>
            {g.items.map((s) => (
              <div
                key={s.session_id}
                className={`session-item ${s.session_id === activeSessionId ? "session-item-active" : ""}`}
                onClick={() => onSelectSession(s.session_id)}
              >
                <div className="session-row">
                  <input
                    type="checkbox"
                    className="session-check"
                    checked={selected.has(s.session_id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(s.session_id)}
                  />
                  <div className="session-main">
                    <div className="session-title">{s.title}</div>
                    <div className="session-id">
                      {fmtTime(s.created_at)} · ID: {shortId(s.session_id)}
                    </div>
                  </div>
                  <button
                    className="session-del"
                    title="Delete chat"
                    disabled={busy}
                    onClick={(e) => deleteOne(e, s.session_id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </aside>
  );
}