// src/components/OpenBotModal.jsx

import React, { useEffect, useState } from "react";
import { listBots } from "../services/api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

export default function OpenBotModal({ flowId, flowName, onClose, onCreate }) {
  const [bots,   setBots]   = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error,  setError]  = useState("");

  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      const data = await listBots();
      setBots((data.bots || []).filter((b) => Number(b.flow_id) === Number(flowId)));
      setStatus("ready");
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load bots.");
      setStatus("error");
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openBot = (b) => {
    window.open(b.bot_url, "_blank", "noreferrer");
    onClose();
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div
        style={s.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Open Bot"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={s.header}>
          <div style={s.title}>Open Bot</div>
          <button type="button" style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.sub}>⚙ {flowName}</div>

        {status === "loading" && <div style={s.muted}>Loading bots…</div>}

        {status === "error" && (
          <>
            <div style={s.error}>{error}</div>
            <div style={s.actions}>
              <button type="button" style={s.cancelBtn} onClick={onClose}>Close</button>
              <button type="button" style={s.primaryBtn} onClick={load}>Retry</button>
            </div>
          </>
        )}

        {status === "ready" && bots.length === 0 && (
          <div style={s.empty}>
            <div style={s.emptyText}>Please create a Bot</div>
            <button type="button" style={s.primaryBtn} onClick={onCreate}>＋ Create Bot</button>
          </div>
        )}

        {status === "ready" && bots.length > 0 && (
          <>
            <div style={s.list}>
              {bots.map((b) => (
                <div
                  key={b.bot_id}
                  style={s.item}
                  tabIndex={0}
                  onClick={() => openBot(b)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openBot(b);
                    }
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e293b")}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={s.itemName}>🤖 {b.name}</div>
                    <div style={s.itemMeta}>{b.bot_id}</div>
                    <div style={s.itemMeta}>Last chat: {fmt(b.last_chat_at)}</div>
                  </div>
                  <span style={s.muted}>Open →</span>
                </div>
              ))}
            </div>
            <div style={s.actions}>
              <button type="button" style={s.cancelBtn} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(2,6,23,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000,
  },
  panel: {
    width: 440, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto",
    background: "#0a0f1e", border: "1px solid #1e293b",
    borderRadius: 14, padding: 22, color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 700, color: "#818cf8" },
  closeBtn: { background: "transparent", border: "none", color: "#475569", fontSize: 14, cursor: "pointer" },
  sub: { fontSize: 11, color: "#64748b", marginBottom: 12 },
  muted: { color: "#64748b", fontSize: 12 },
  error: {
    marginTop: 10, padding: "8px 10px", borderRadius: 8, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" },
  item: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: "10px 12px", border: "1px solid #1e293b", borderRadius: 10,
    background: "#0f172a", cursor: "pointer", outline: "none", transition: "border-color 0.15s",
  },
  itemName: { fontSize: 13, fontWeight: 700, color: "#e2e8f0", wordBreak: "break-word" },
  itemMeta: { fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "20px 0 6px" },
  emptyText: { fontSize: 14, fontWeight: 700, color: "#e2e8f0" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  cancelBtn: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  primaryBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
};