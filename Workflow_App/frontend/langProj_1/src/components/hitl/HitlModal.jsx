// src/components/hitl/HitlModal.jsx
// Runtime popup for a paused HITL node (Approval / Suggestion / Questions).

import React, { useState } from "react";

const asText = (v) =>
  v === undefined || v === null ? "—" : typeof v === "string" ? v : JSON.stringify(v, null, 2);

export default function HitlModal({ request, onSubmit, onCancel }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  const send = async (response) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(response);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Submission failed.");
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    await onCancel();
  };

  const props = { request, send, cancel, busy, setError };

  return (
    <div style={s.overlay} data-hitl-modal="true">
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>{request.title || "Human Input"}</div>
          <button type="button" style={s.closeBtn} onClick={cancel} disabled={busy}>✕</button>
        </div>

        <div style={s.body}>
          {request.instructions ? <div style={s.note}>{request.instructions}</div> : null}

          {request.feature !== "questions" && (
            <>
              <div style={s.label}>Input</div>
              <pre style={s.pre}>{asText(request.input)}</pre>
            </>
          )}

          {request.feature === "approval"   && <ApprovalBody {...props} />}
          {request.feature === "suggestion" && <SuggestionBody {...props} />}
          {request.feature === "questions"  && <QuestionsBody {...props} />}

          {error && <div style={s.error}>⚠ {error}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Approval ─────────────────────────────────────────────────────────────────
function ApprovalBody({ send, cancel, busy }) {
  return (
    <div style={s.actions}>
      <button style={s.cancelBtn} disabled={busy} onClick={cancel}>Cancel</button>
      <button style={s.rejectBtn} disabled={busy} onClick={() => send({ decision: "reject" })}>
        Reject
      </button>
      <button style={s.approveBtn} disabled={busy} onClick={() => send({ decision: "approve" })}>
        Approve
      </button>
    </div>
  );
}

// ─── Suggestion ───────────────────────────────────────────────────────────────
function SuggestionBody({ request, send, cancel, busy, setError }) {
  const [text,  setText]  = useState("");
  const [items, setItems] = useState([]);

  const add = () => {
    const v = text.trim();
    if (!v) {
      setError("Enter a suggestion before adding.");
      return;
    }
    setError("");
    setItems((prev) => [...prev, v]);
    setText("");
  };

  const ok = () => {
    if (request.required && items.length === 0) {
      setError("At least one suggestion is required.");
      return;
    }
    send({ suggestions: items });
  };

  return (
    <>
      <div style={s.label}>Add Suggestion</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={s.inp}
          value={text}
          placeholder="Type a suggestion…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button style={s.addBtn} disabled={busy} onClick={add}>Add Suggestion</button>
      </div>

      <div style={s.label}>Suggestions ({items.length})</div>
      {items.length === 0 && <div style={s.muted}>No suggestions added.</div>}
      {items.map((it, i) => (
        <div key={i} style={s.item}>
          <span style={{ wordBreak: "break-word" }}>{i + 1}. {it}</span>
          <button
            style={s.removeBtn}
            disabled={busy}
            onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}

      <div style={s.actions}>
        <button style={s.cancelBtn} disabled={busy} onClick={cancel}>Cancel</button>
        <button style={s.approveBtn} disabled={busy} onClick={ok}>OK</button>
      </div>
    </>
  );
}

// ─── Questions ────────────────────────────────────────────────────────────────
function QuestionsBody({ request, send, cancel, busy, setError }) {
  const questions = request.questions || [];
  const [answers, setAnswers] = useState(() =>
    questions.map((q) => (q.type === "Checkbox" ? [] : ""))
  );

  const setAnswer = (i, v) =>
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? v : a)));

  const toggle = (i, opt) =>
    setAnswers((prev) =>
      prev.map((a, idx) =>
        idx !== i ? a : a.includes(opt) ? a.filter((x) => x !== opt) : [...a, opt]
      )
    );

  const submit = () => {
    const missing = [];
    questions.forEach((q, i) => {
      const a = answers[i];
      const empty = q.type === "Checkbox" ? a.length === 0 : !String(a).trim();
      if (q.required && empty) missing.push(i + 1);
    });
    if (missing.length) {
      setError(`Please answer the required question(s): ${missing.join(", ")}.`);
      return;
    }
    setError("");
    send({ answers });
  };

  return (
    <>
      {request.input !== undefined && request.input !== null && request.input !== "" && (
        <>
          <div style={s.label}>Input</div>
          <pre style={s.pre}>{asText(request.input)}</pre>
        </>
      )}

      {questions.map((q, i) => (
        <div key={q.id ?? i} style={s.question}>
          <div style={s.qText}>
            {i + 1}. {q.question}{" "}
            <span style={{ color: q.required ? "#fca5a5" : "#64748b", fontSize: 11 }}>
              {q.required ? "* Required" : "(Optional)"}
            </span>
          </div>

          {q.type === "Radio" &&
            q.options.map((opt) => (
              <label key={opt} style={s.opt}>
                <input
                  type="radio"
                  name={`q_${i}`}
                  checked={answers[i] === opt}
                  onChange={() => setAnswer(i, opt)}
                />
                {opt}
              </label>
            ))}

          {q.type === "Checkbox" &&
            q.options.map((opt) => (
              <label key={opt} style={s.opt}>
                <input
                  type="checkbox"
                  checked={answers[i].includes(opt)}
                  onChange={() => toggle(i, opt)}
                />
                {opt}
              </label>
            ))}

          {q.type === "Text" && (
            <textarea
              rows={3}
              style={{ ...s.inp, resize: "vertical" }}
              value={answers[i]}
              placeholder="Your answer…"
              onChange={(e) => setAnswer(i, e.target.value)}
            />
          )}
        </div>
      ))}

      <div style={s.actions}>
        <button style={s.cancelBtn} disabled={busy} onClick={cancel}>Cancel</button>
        <button style={s.approveBtn} disabled={busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(2,6,23,0.8)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5000,
  },
  panel: {
    width: 560, maxWidth: "94vw", maxHeight: "90vh",
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
  title: { fontSize: 16, fontWeight: 700, color: "#fbbf24" },
  closeBtn: { background: "transparent", border: "none", color: "#475569", fontSize: 14, cursor: "pointer" },
  body: { padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 },
  note: {
    fontSize: 12, color: "#94a3b8", lineHeight: 1.6, padding: "8px 10px",
    background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8,
  },
  label: {
    fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
    color: "#6366f1", fontWeight: 700, marginTop: 4,
  },
  pre: {
    margin: 0, padding: 10, borderRadius: 8, background: "#0f172a",
    border: "1px solid #1e293b", color: "#cbd5e1", fontSize: 12, lineHeight: 1.5,
    whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240, overflow: "auto",
  },
  muted: { color: "#475569", fontSize: 12 },
  inp: {
    flex: 1, width: "100%", padding: "8px 10px", borderRadius: 8,
    background: "#0f172a", color: "#e2e8f0", border: "1px solid #1e293b",
    fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  },
  item: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
    padding: "7px 10px", borderRadius: 8, border: "1px solid #1e293b",
    background: "#0f172a", fontSize: 12,
  },
  removeBtn: { background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 12 },
  question: { padding: 12, borderRadius: 10, border: "1px solid #1e293b", background: "#0f172a" },
  qText: { fontSize: 13, fontWeight: 600, marginBottom: 8, wordBreak: "break-word" },
  opt: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1", marginBottom: 4, cursor: "pointer" },
  error: {
    padding: "8px 12px", borderRadius: 8, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  approveBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #059669, #065f46)",
    color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  rejectBtn: {
    padding: "8px 18px", borderRadius: 9, border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.12)", color: "#fca5a5", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  addBtn: {
    padding: "8px 14px", borderRadius: 9, border: "none", whiteSpace: "nowrap",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
};