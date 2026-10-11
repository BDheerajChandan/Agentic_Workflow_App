// src/components/NodeStatesModal.jsx

import React, { useState } from "react";

const toText = (v) => JSON.stringify(v, null, 2);

const download = (name, data) => {
  const blob = new Blob([toText(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const PALETTE = {
  passed:       { bg: "#dcfce7", border: "#86efac", badge: "#166534", label: "PASSED" },
  failed:       { bg: "#fee2e2", border: "#fca5a5", badge: "#991b1b", label: "FAILED" },
  not_executed: { bg: "#e2e8f0", border: "#cbd5e1", badge: "#475569", label: "NOT EXECUTED" },
};

export default function NodeStatesModal({ traces, nodes, error, onClose }) {
  const [copied, setCopied] = useState("");

  const executed = new Set(traces.map((t) => t.node_id));
  const skipped = nodes
    .filter((n) => !executed.has(n.id))
    .map((n) => ({
      node_id: n.id,
      node_type: n.type,
      status: "not_executed",
      input: null,
      output: null,
      error: null,
      duration_ms: null,
    }));
  const items  = [...traces, ...skipped];
  const report = { error: error || null, nodes: items };

  const copy = async (key, data) => {
    try {
      await navigator.clipboard.writeText(toText(data));
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>Node States</div>
          <div style={s.headerActions}>
            <button style={s.btn} onClick={() => copy("all", report)}>
              {copied === "all" ? "Copied ✓" : "Copy All"}
            </button>
            <button style={s.btn} onClick={() => download("node_states.json", report)}>
              Download All
            </button>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={s.body}>
          {error && <div style={s.errorBanner}>⚠ {error}</div>}

          {items.length === 0 && <div style={s.empty}>No node states yet. Run the graph.</div>}

          {items.map((item, idx) => {
            const p = PALETTE[item.status] || PALETTE.not_executed;
            const key = `${item.node_id}-${idx}`;
            return (
              <div key={key} style={{ ...s.card, background: p.bg, borderColor: p.border }}>
                <div style={s.cardHeader}>
                  <div>
                    <span style={s.nodeName}>{item.node_type} · {item.node_id}</span>
                    <span style={{ ...s.badge, background: p.badge }}>{p.label}</span>
                    {item.duration_ms != null && (
                      <span style={s.duration}>{item.duration_ms} ms</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={s.cardBtn} onClick={() => copy(key, item)}>
                      {copied === key ? "Copied ✓" : "Copy"}
                    </button>
                    <button
                      style={s.cardBtn}
                      onClick={() => download(`${item.node_id}_result.json`, item)}
                    >
                      Download
                    </button>
                  </div>
                </div>

                {item.error && (
                  <>
                    <div style={s.label}>Error</div>
                    <pre style={{ ...s.pre, color: "#991b1b" }}>{item.error}</pre>
                  </>
                )}

                {item.status !== "not_executed" && (
                  <>
                    <div style={s.label}>Input</div>
                    <pre style={s.pre}>{toText(item.input)}</pre>
                    <div style={s.label}>Output</div>
                    <pre style={s.pre}>{item.output == null ? "—" : toText(item.output)}</pre>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
    width: 780, maxWidth: "94vw", maxHeight: "90vh",
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
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  btn: {
    padding: "6px 14px", borderRadius: 8, border: "1px solid #334155",
    background: "transparent", color: "#cbd5e1", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  closeBtn: {
    background: "transparent", border: "none", color: "#475569", fontSize: 14, cursor: "pointer",
  },
  body: {
    padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12,
  },
  empty: { color: "#475569", fontSize: 12, textAlign: "center", padding: 24 },
  errorBanner: {
    padding: "8px 12px", borderRadius: 8, fontSize: 12,
    background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b",
  },
  card: { border: "1px solid", borderRadius: 12, padding: 12, color: "#0f172a" },
  cardHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    gap: 10, marginBottom: 8,
  },
  nodeName: { fontSize: 13, fontWeight: 700, marginRight: 10 },
  badge: {
    fontSize: 10, fontWeight: 700, color: "#fff",
    padding: "2px 8px", borderRadius: 999, letterSpacing: "0.06em",
  },
  duration: { fontSize: 11, color: "#475569", marginLeft: 10 },
  cardBtn: {
    padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(15,23,42,0.25)",
    background: "rgba(255,255,255,0.7)", color: "#0f172a",
    fontSize: 11, fontWeight: 600, cursor: "pointer",
  },
  label: {
    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
    color: "#475569", fontWeight: 700, margin: "8px 0 4px",
  },
  pre: {
    margin: 0, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.65)",
    color: "#0f172a", fontSize: 11, lineHeight: 1.5,
    whiteSpace: "pre-wrap", wordBreak: "break-word",
    maxHeight: 200, overflow: "auto",
  },
};