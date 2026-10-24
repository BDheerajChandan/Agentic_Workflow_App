// src/components/RunHistoryModal.jsx

import React, { useEffect, useState } from "react";
import { deleteAllRuns, deleteRun, getRun, listRuns } from "../services/api";
import NodeStatesModal from "./NodeStatesModal";

const toText = (v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
const fmtDuration = (ms) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

const STATUS = {
  passed:       { bg: "#dcfce7", border: "#86efac", badge: "#166534", label: "PASSED" },
  failed:       { bg: "#fee2e2", border: "#fca5a5", badge: "#991b1b", label: "FAILED" },
  paused:       { bg: "#fef9c3", border: "#fde047", badge: "#854d0e", label: "PAUSED" },
};

export default function RunHistoryModal({ flowId, onClose }) {
  const [runs,       setRuns]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [selected,   setSelected]   = useState(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [statesOpen, setStatesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRuns(flowId)
      .then((d) => { if (!cancelled) setRuns(d.runs || []); })
      .catch(() => { if (!cancelled) setError("Failed to load run history."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [flowId]);

  const openRun = async (runId) => {
    setLoadingRun(true);
    setError("");
    try {
      setSelected(await getRun(flowId, runId));
    } catch {
      setError("Failed to load run.");
    } finally {
      setLoadingRun(false);
    }
  };

    const removeRun = async (e, runId) => {
    e.stopPropagation();
    setError("");
    try {
      await deleteRun(flowId, runId);
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
      setSelected((prev) => (prev?.run_id === runId ? null : prev));
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to delete run.");
    }
  };

  const removeAllRuns = async () => {
    if (!runs.length) return;
    if (!window.confirm("Delete ALL run history for this workflow? This cannot be undone.")) return;
    setError("");
    try {
      await deleteAllRuns(flowId);
      setRuns([]);
      setSelected(null);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to delete run history.");
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>Run History</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              style={{ ...s.deleteAllBtn, opacity: runs.length ? 1 : 0.5 }}
              onClick={removeAllRuns}
              disabled={!runs.length}
            >
              Delete All
            </button>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={s.body}>
          <div style={s.list}>
            {loading && <div style={s.muted}>Loading…</div>}
            {!loading && runs.length === 0 && !error && (
              <div style={s.muted}>No previous runs available</div>
            )}
            {runs.map((r) => {
              const p = STATUS[r.status] || STATUS.failed;
              const active = selected?.run_id === r.run_id;
              return (
                <div
                  key={r.run_id}
                  onClick={() => openRun(r.run_id)}
                  style={{ ...s.runRow, borderColor: active ? "#6366f1" : "#1e293b" }}
                >
                  <div style={s.runTop}>
                    <span style={s.runId}>Run #{r.run_number ?? r.run_id}</span>
                    <span style={{ ...s.badge, background: p.badge }}>{p.label}</span>
                  </div>
                  <div style={s.runMeta}>{fmtDate(r.started_at)}</div>
                  <div style={{ ...s.runTop, marginBottom: 0 }}>
                    <span style={s.runMeta}>{fmtDuration(r.duration_ms)}</span>
                    <button style={s.deleteBtn} onClick={(e) => removeRun(e, r.run_id)}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={s.detail}>
            {error && <div style={s.errorBox}>⚠ {error}</div>}
            {loadingRun && <div style={s.muted}>Loading run…</div>}
            {!selected && !loadingRun && (
              <div style={s.muted}>Select a run to view its details.</div>
            )}

            {selected && !loadingRun && (
              <>
                <div style={s.summary}>
                  <Row k="Run ID"    v={`#${selected.run_number ?? selected.run_id}`} />
                  <Row k="Workflow"  v={selected.workflow_name} />
                  <Row k="Status"    v={selected.status} />
                  <Row k="Started"   v={fmtDate(selected.started_at)} />
                  <Row k="Ended"     v={fmtDate(selected.ended_at)} />
                  <Row k="Duration"  v={fmtDuration(selected.duration_ms)} />
                  <Row k="Input"     v={selected.input ?? "—"} />
                </div>

                {selected.error && (
                  <div style={s.errorBox}>⚠ {selected.error}</div>
                )}

                <button style={s.statesBtn} onClick={() => setStatesOpen(true)}>
                  🔍 View Node States
                </button>

                <div style={s.label}>Result</div>
                <pre style={s.resizePre}>{selected.result == null ? "—" : toText(selected.result)}</pre>

                <div style={s.label}>Runtime Variables</div>
                <pre style={s.resizePre}>
                  {Object.keys(selected.variables || {}).length
                    ? toText(selected.variables)
                    : "No variables used in this run."}
                </pre>

                <div style={s.label}>Node Values</div>
                {(selected.node_states || []).map((n, idx) => {
                  const p = STATUS[n.status] || STATUS.failed;
                  return (
                    <div key={`${n.node_id}-${idx}`} style={{ ...s.nodeCard, background: p.bg, borderColor: p.border }}>
                      <div style={s.nodeHead}>
                        <span style={s.nodeName}>{n.node_type} · {n.node_id}</span>
                        <span style={{ ...s.badge, background: p.badge }}>{p.label}</span>
                        <span style={s.duration}>{fmtDuration(n.duration_ms)}</span>
                      </div>
                      <pre style={s.nodePre}>
                        {n.error
                          ? n.error
                          : n.value != null
                          ? toText(n.value)
                          : n.output != null
                          ? toText(n.output)
                          : "—"}
                      </pre>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {statesOpen && selected && (
        <NodeStatesModal
          traces={selected.node_states || []}
          nodes={[]}
          error={selected.error}
          onClose={() => setStatesOpen(false)}
        />
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
      <span style={{ color: "#64748b", fontSize: 11 }}>{k}</span>
      <span style={{ color: "#cbd5e1", fontSize: 11, textAlign: "right", wordBreak: "break-word" }}>{String(v)}</span>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(2,6,23,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000,
  },
  panel: {
    width: 900, maxWidth: "95vw", height: "85vh",
    display: "flex", flexDirection: "column",
    background: "#0a0f1e", border: "1px solid #1e293b",
    borderRadius: 14, color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 18px", borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 700, color: "#818cf8" },
  closeBtn: { background: "transparent", border: "none", color: "#475569", fontSize: 14, cursor: "pointer" },
  body: { flex: 1, display: "flex", minHeight: 0 },
  list: {
    width: 260, minWidth: 260, borderRight: "1px solid #1e293b",
    padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
  },
  detail: { flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 },
  muted: { color: "#475569", fontSize: 12, textAlign: "center", padding: 16 },
  runRow: {
    padding: "10px 12px", borderRadius: 10, border: "1px solid",
    background: "#0f172a", cursor: "pointer",
  },
  runTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  runId: { fontSize: 12, fontWeight: 700, color: "#e2e8f0" },
  runMeta: { fontSize: 10, color: "#64748b" },
  badge: {
    fontSize: 10, fontWeight: 700, color: "#fff",
    padding: "2px 8px", borderRadius: 999, letterSpacing: "0.06em",
  },
  summary: {
    padding: 12, borderRadius: 10, border: "1px solid #1e293b", background: "#0f172a",
  },
  errorBox: {
    padding: "8px 12px", borderRadius: 8, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  statesBtn: {
    padding: "8px 0", borderRadius: 10,
    border: "1px solid #6366f1", background: "rgba(99,102,241,0.08)",
    color: "#818cf8", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  label: {
    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
    color: "#6366f1", fontWeight: 700, marginTop: 6,
  },
  pre: {
    margin: 0, padding: 10, borderRadius: 8, background: "#0f172a",
    border: "1px solid #1e293b", color: "#cbd5e1", fontSize: 11, lineHeight: 1.5,
    whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto",
  },
  deleteBtn: {
    padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.35)",
    background: "transparent", color: "#fca5a5", fontSize: 10, fontWeight: 600, cursor: "pointer",
  },
  deleteAllBtn: {
    padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.08)", color: "#fca5a5", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  resizePre: {
    margin: 0, padding: 10, borderRadius: 8, background: "#0f172a",
    border: "1px solid #1e293b", color: "#cbd5e1", fontSize: 11, lineHeight: 1.5,
    whiteSpace: "pre-wrap", wordBreak: "break-word",
    height: 280, minHeight: 80, maxHeight: "none",
    overflowY: "auto", overflowX: "hidden",
    resize: "vertical", flexShrink: 0, boxSizing: "border-box",
  },
  nodeCard: { border: "1px solid", borderRadius: 10, padding: 10, color: "#0f172a" },
  nodeHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  nodeName: { fontSize: 12, fontWeight: 700 },
  duration: { fontSize: 10, color: "#475569", marginLeft: "auto" },
  nodePre: {
    margin: 0, padding: 8, borderRadius: 6, background: "rgba(255,255,255,0.65)",
    color: "#0f172a", fontSize: 11, lineHeight: 1.5,
    whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 140, overflow: "auto",
  },
};