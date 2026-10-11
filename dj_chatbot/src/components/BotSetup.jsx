// src/components/BotSetup.jsx

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listBots } from "../services/botApi";
import BotFormModal from "./BotFormModal";

const FLOW_APP_URL = import.meta.env.VITE_FLOW_APP_URL || "http://localhost:5173";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

function MetaRow({ label, value }) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{String(value)}</span>
    </div>
  );
}

export default function BotSetup() {
  const navigate = useNavigate();
  const [bots, setBots]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [formState, setFormState] = useState(null); // { mode: "create" | "edit", bot? }

  const load = async () => {
    setLoading(true);
    try {
      const data = await listBots();
      setBots(data.bots);
      setError("");
    } catch (e) {
      setError(e?.userMessage || "Failed to load bots.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaved = () => {
    setFormState(null);
    load();
  };

  return (
    <div className="setup-root">
      <div className="setup-card setup-card-wide">
        <div className="setup-head">
          <div>
            <h1 className="setup-title">DJ Chatbot</h1>
            <div className="muted">Select a Bot to start chatting</div>
          </div>
          <div className="setup-head-actions">
            <a className="btn btn-ghost" href={FLOW_APP_URL} target="_blank" rel="noreferrer">
              Open Workflow App
            </a>
            <button className="btn btn-primary" onClick={() => setFormState({ mode: "create" })}>
              ＋ Create Bot
            </button>
          </div>
        </div>

        <div className="lbl" style={{ marginTop: 24 }}>My Bots</div>
        {loading && <div className="muted">Loading…</div>}
        {error && <div className="form-error">{error}</div>}
        {!loading && !error && bots.length === 0 && (
          <div className="muted">
            No bots yet. Click “Create Bot” above, or use “Create Bot” on a workflow card in the Workflow App.
          </div>
        )}

        <div className="bot-grid">
          {bots.map((b) => (
            <div key={b.bot_id} className="bot-card" onClick={() => navigate(`/bots/${b.bot_id}`)}>
              <div className="bot-card-head">
                <div className="bot-name">🤖 {b.name}</div>
                <button
                  className="icon-btn"
                  title="Edit Bot"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFormState({ mode: "edit", bot: b });
                  }}
                >
                  ✎
                </button>
              </div>

              <div className="bot-tag">
                <div className="bot-tag-label">Tagged Workflow</div>
                <div className="bot-tag-name">⚙ {b.workflow_name}</div>
                <MetaRow label="Workflow ID" value={b.workflow_id ?? b.flow_id} />
                <div className="meta-row">
                  <span className="meta-label">Endpoint</span>
                  <span className="meta-value meta-ellipsis" title={b.workflow_endpoint}>
                    {b.workflow_endpoint}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Workflow URL</span>
                  <a
                    className="meta-link meta-ellipsis"
                    href={b.workflow_url}
                    target="_blank"
                    rel="noreferrer"
                    title={b.workflow_url}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {b.workflow_url}
                  </a>
                </div>
              </div>

              <div className="bot-card-meta">
                <MetaRow label="Bot ID" value={b.bot_id} />
                <MetaRow label="Created" value={fmt(b.created_at)} />
                <MetaRow label="Last chat" value={fmt(b.last_chat_at)} />
              </div>

              <div className="bot-card-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFormState({ mode: "edit", bot: b });
                  }}
                >
                  ✎ Edit
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/bots/${b.bot_id}`);
                  }}
                >
                  Open Bot →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {formState && (
        <BotFormModal
          mode={formState.mode}
          bot={formState.bot}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}