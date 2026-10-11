// src/components/BotFormModal.jsx

import React, { useEffect, useState } from "react";
import { listWorkflows, createBot, updateBot } from "../services/botApi";

export default function BotFormModal({ mode = "create", bot, onClose, onSaved }) {
  const isEdit = mode === "edit";

  const [name, setName]                 = useState(isEdit ? bot.name : "");
  const [flowId, setFlowId]             = useState(isEdit ? String(bot.workflow_id ?? bot.flow_id) : "");
  const [workflows, setWorkflows]       = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await listWorkflows();
        setWorkflows(data.workflows);
        setFlowId((prev) =>
          prev || (data.workflows.length ? String(data.workflows[0].workflow_id) : "")
        );
      } catch {
        setError("Failed to load workflows.");
      } finally {
        setLoadingFlows(false);
      }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a Bot name.");
    if (!flowId) return setError("Select a workflow to tag.");
    setError("");
    setSaving(true);
    try {
      const saved = isEdit
        ? await updateBot(bot.bot_id, { name: trimmed, flow_id: Number(flowId) })
        : await createBot(trimmed, Number(flowId));
      onSaved(saved);
    } catch (err) {
      setError(err?.userMessage || "Failed to save Bot.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? "Edit Bot" : "Create Bot"}</div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <label className="lbl">Bot Name</label>
        <input
          className="inp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Support Bot"
          autoFocus
        />

        <label className="lbl">Tagged Workflow</label>
        {loadingFlows ? (
          <div className="muted">Loading workflows…</div>
        ) : workflows.length === 0 ? (
          <div className="muted">No workflows found. Create one in the Workflow App first.</div>
        ) : (
          <div className="select-wrap">
            <select
              className="inp select-native"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
            >
              {workflows.map((w) => (
                <option key={w.workflow_id} value={w.workflow_id}>
                  {w.workflow_name}
                </option>
              ))}
            </select>
            <span className="select-arrow">▼</span>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || loadingFlows || workflows.length === 0}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Bot"}
          </button>
        </div>
      </form>
    </div>
  );
}