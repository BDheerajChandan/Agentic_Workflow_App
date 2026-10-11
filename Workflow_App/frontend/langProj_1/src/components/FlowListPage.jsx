// src/components/FlowListPage.jsx

import React, { useEffect, useState } from "react";
import { listFlows, deleteFlow } from "../services/api";
import CreateBotModal from "./CreateBotModal";

const TOPBAR_HEIGHT = 42;

export default function FlowListPage({ onOpen, onNew }) {
  const [flows,   setFlows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  const [botTarget,  setBotTarget]  = useState(null); // { id, name } of the workflow
  const [createdBot, setCreatedBot] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFlows();
      setFlows(data.flows);
    } catch {
      setError("Failed to load flows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this flow? Bots tagged to it will also be deleted.")) return;
    await deleteFlow(id);
    load();
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

  return (
    <div style={styles.root}>

      <div style={styles.topBar}>
        <span style={styles.brand}>🚀 LangGraph Workflow Builder</span>

        <div style={styles.topBarCenter}>
          {new Date().toLocaleDateString()} {"  ||  "} {currentTime}
        </div>

        <div>
          <span style={{ color: "#e9e9f3", fontWeight: 600, fontSize: 12 }}>
            Developed by Dheeraj
          </span>
        </div>
      </div>

      <div style={styles.content}>
        {/* <div style={styles.headingRow}>
          <div style={styles.heading}>My Flows</div>
          <button style={styles.newBtn} onClick={onNew}>＋ Create New Flow</button>
        </div> */}
        <div style={styles.headingRow}>
          <div style={styles.heading}>My Flows</div>
          <div style={styles.headingActions}>
            <a
              style={styles.chatbotBtn}
              href="http://localhost:5174/"
              target="_blank"
              rel="noreferrer"
            >
              🤖 Open Chatbot App
            </a>
            <button style={styles.newBtn} onClick={onNew}>＋ Create New Flow</button>
          </div>
        </div>

        {createdBot && (
          <div style={styles.successBox}>
            <span>
              ✓ Bot “{createdBot.name}” created and tagged to “{createdBot.workflow_name}”.
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <a
                href={createdBot.bot_url}
                target="_blank"
                rel="noreferrer"
                style={styles.successOpenBtn}
              >
                Open Bot →
              </a>
              <button style={styles.successClose} onClick={() => setCreatedBot(null)}>✕</button>
            </div>
          </div>
        )}

        {loading && <div style={styles.muted}>Loading…</div>}
        {error   && <div style={styles.errStyle}>{error}</div>}

        {!loading && flows.length === 0 && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyIcon}>⬡</div>
            <div style={styles.muted}>No flows yet. Create your first flow.</div>
            <button style={styles.newBtn} onClick={onNew}>＋ Create New Flow</button>
          </div>
        )}

        <div style={styles.grid}>
          {flows.map((f) => (
            <div
              key={f.id}
              style={styles.card}
              onClick={() => onOpen(f.route_slug)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e293b")}
            >
              <div style={styles.cardHeader}>
                <div style={styles.cardName}>{f.name}</div>
                <button
                  style={styles.delBtn}
                  onClick={(e) => handleDelete(f.id, e)}
                  title="Delete flow"
                >✕</button>
              </div>

              <div style={styles.meta}>
                <MetaRow label="Executions" value={f.execution_count} />
                <MetaRow label="Last run"   value={fmt(f.last_executed_at)} />
                <MetaRow label="Created"    value={fmt(f.created_at)} />
                <MetaRow label="Updated"    value={fmt(f.updated_at)} />
              </div>

              <div style={styles.cardFooter}>
                <button
                  style={styles.botBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBotTarget({ id: f.id, name: f.name });
                  }}
                  title="Create a Bot tagged to this workflow"
                >
                  🤖 Create Bot
                </button>
                <div style={styles.openHint}>Click to open →</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {botTarget && (
        <CreateBotModal
          flowId={botTarget.id}
          flowName={botTarget.name}
          onClose={() => setBotTarget(null)}
          onCreated={(bot) => {
            setBotTarget(null);
            setCreatedBot(bot);
          }}
        />
      )}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
      <span style={{ color: "#475569", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#94a3b8", fontSize: 11 }}>{String(value)}</span>
    </div>
  );
}

const styles = {
  root: {
    width: "100vw",
    height: "100vh",
    background: "#020617",
    color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  topBar: {
    position: "fixed",
    top: 0, left: 0, right: 0,
    height: TOPBAR_HEIGHT,
    background: "#0f172a",
    borderBottom: "1px solid #1e293b",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    zIndex: 3000,
    flexShrink: 0,
  },

  brand:        { color: "#818cf8", fontWeight: 700, fontSize: 14 },
  topBarCenter: { color: "#38bdf8", fontSize: 13 },

  content: {
    marginTop: TOPBAR_HEIGHT,
    flex: 1,
    padding: "40px",
    overflowY: "auto",
  },

  headingRow: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginBottom: 28,
  },

  heading: { fontSize: 22, fontWeight: 700, color: "#e2e8f0" },

  headingActions: {
    display: "flex", alignItems: "center", gap: 10,
  },

  chatbotBtn: {
    padding: "8px 18px", borderRadius: 9,
    border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontWeight: 700, fontSize: 13,
    cursor: "pointer", letterSpacing: "0.04em",
    textDecoration: "none", display: "inline-block",
  },

  newBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontWeight: 700, fontSize: 13,
    cursor: "pointer", letterSpacing: "0.04em",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 20,
  },

  card: {
    background: "#c7da7e",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: "18px 20px",
    cursor: "pointer",
    transition: "border-color 0.2s",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  cardHeader: {
    display: "flex", alignItems: "flex-start",
    justifyContent: "space-between", marginBottom: 14,
  },

  cardName: { fontSize: 15, fontWeight: 700, color: "#060707", wordBreak: "break-word" },

  delBtn: {
    background: "transparent", border: "none",
    color: "#475569", fontSize: 13, cursor: "pointer",
    padding: "2px 4px", flexShrink: 0,
  },

  meta: {
    marginBottom: 14, padding: "12px",
    background: "#020617", borderRadius: 8, border: "1px solid #1e293b",
  },

  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
    paddingTop: 10,
    borderTop: "1px solid rgba(2,6,23,0.15)",
  },

  botBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white",
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    letterSpacing: "0.03em",
    flexShrink: 0,
  },

  openHint: {
    fontSize: 11, color: "#4801ee",
    textAlign: "right", letterSpacing: "0.04em",
  },

  successBox: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    marginBottom: 20, padding: "10px 14px", borderRadius: 10, fontSize: 12,
    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
    color: "#6ee7b7",
  },
  successOpenBtn: {
    padding: "6px 14px", borderRadius: 8, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontWeight: 700, fontSize: 11,
    cursor: "pointer", letterSpacing: "0.03em", textDecoration: "none",
    flexShrink: 0,
  },
  successClose: { background: "transparent", border: "none", color: "#6ee7b7", cursor: "pointer", fontSize: 13 },

  emptyBox: {
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 16, marginTop: 80,
  },

  emptyIcon: { fontSize: 48, color: "#1e293b" },
  muted:     { color: "#475569", fontSize: 13 },
  errStyle:  { color: "#fca5a5", fontSize: 13 },
};