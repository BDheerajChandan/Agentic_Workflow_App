
// src/components/hitl/HitlCards.jsx
// Shared interactive cards. Rendered from the backend's structured `interaction` object:
// { type, interaction_type, status, interaction_id, pause_id, node_id, title, payload }
// New interaction types are added with registerCard(); unknown types use a safe fallback.

import React, { useState } from "react";

const asText = (v) =>
  v === undefined || v === null || v === ""
    ? "—"
    : typeof v === "string" ? v : JSON.stringify(v, null, 2);

const REGISTRY = {};
export const registerCard = (type, Component, title) => {
  REGISTRY[type] = { Component, title };
};

// ─── Approval ─────────────────────────────────────────────────────────────────
function ApprovalCard({ payload, send, cancel }) {
  return (
    <>
      {payload.instructions ? <div style={s.note}>{payload.instructions}</div> : null}
      <div style={s.label}>Value</div>
      <pre style={s.pre}>{asText(payload.input)}</pre>
      <div style={s.actions}>
        <button style={s.cancelBtn} onClick={cancel}>Cancel</button>
        <button style={s.rejectBtn} onClick={() => send({ decision: "reject" })}>Reject</button>
        <button style={s.okBtn} onClick={() => send({ decision: "approve" })}>Approve</button>
      </div>
    </>
  );
}

// ─── Suggestion ───────────────────────────────────────────────────────────────
function SuggestionCard({ payload, send, cancel, setError }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState([]);

  const add = () => {
    const v = text.trim();
    if (!v) { setError("Enter a suggestion before adding."); return; }
    setError("");
    setItems((p) => [...p, v]);
    setText("");
  };

  const submit = () => {
    if (payload.required && items.length === 0) {
      setError("At least one suggestion is required.");
      return;
    }
    send({ suggestions: items });
  };

  return (
    <>
      {payload.instructions ? <div style={s.note}>{payload.instructions}</div> : null}
      <div style={s.label}>Original Value</div>
      <pre style={s.pre}>{asText(payload.input)}</pre>

      <div style={s.label}>Add Suggestion</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={s.inp}
          value={text}
          placeholder="Type a suggestion…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); }
          }}
        />
        <button style={s.addBtn} onClick={add}>Add Suggestion</button>
      </div>

      <div style={s.label}>Added Suggestions ({items.length})</div>
      {items.length === 0 && <div style={s.muted}>No suggestions added.</div>}
      {items.map((it, i) => (
        <div key={i} style={s.item}>
          <span style={{ wordBreak: "break-word" }}>{i + 1}. {it}</span>
          <button style={s.removeBtn} onClick={() => setItems((p) => p.filter((_, x) => x !== i))}>✕</button>
        </div>
      ))}

      <div style={s.actions}>
        <button style={s.cancelBtn} onClick={cancel}>Cancel</button>
        <button style={s.okBtn} onClick={submit}>OK / Submit</button>
      </div>
    </>
  );
}

// ─── Questions ────────────────────────────────────────────────────────────────
function QuestionsCard({ payload, send, cancel, setError }) {
  const questions = payload.questions || [];
  const [answers, setAnswers] = useState(() =>
    questions.map((q) => (q.type === "Checkbox" ? [] : ""))
  );

  const setAnswer = (i, v) => setAnswers((p) => p.map((a, x) => (x === i ? v : a)));
  const toggle = (i, opt) =>
    setAnswers((p) =>
      p.map((a, x) => (x !== i ? a : a.includes(opt) ? a.filter((o) => o !== opt) : [...a, opt]))
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

  const hasInput = payload.input !== undefined && payload.input !== null && payload.input !== "";

  return (
    <>
      {hasInput && (
        <>
          <div style={s.label}>Input</div>
          <pre style={s.pre}>{asText(payload.input)}</pre>
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

          {q.type === "Radio" && q.options.map((opt) => (
            <label key={opt} style={s.opt}>
              <input type="radio" name={`q_${q.id ?? i}`} checked={answers[i] === opt} onChange={() => setAnswer(i, opt)} />
              {opt}
            </label>
          ))}

          {q.type === "Checkbox" && q.options.map((opt) => (
            <label key={opt} style={s.opt}>
              <input type="checkbox" checked={answers[i].includes(opt)} onChange={() => toggle(i, opt)} />
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
        <button style={s.cancelBtn} onClick={cancel}>Cancel</button>
        <button style={s.okBtn} onClick={submit}>Submit</button>
      </div>
    </>
  );
}

registerCard("approval", ApprovalCard, "Approval Required");
registerCard("suggestion", SuggestionCard, "Suggestions Required");
registerCard("questions", QuestionsCard, "Questionnaire");

// ─── Safe fallback ────────────────────────────────────────────────────────────
function FallbackCard({ interaction }) {
  return (
    <>
      <div style={s.muted}>Unsupported interaction type: {String(interaction?.interaction_type)}</div>
      <pre style={s.pre}>{asText(interaction?.payload)}</pre>
    </>
  );
}

const STATUS_COLOR = { pending: "#fbbf24", submitted: "#34d399", cancelled: "#fca5a5" };

// ─── Renderer ─────────────────────────────────────────────────────────────────
export default function InteractionCard({ interaction, onSubmit, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = interaction?.status || "pending";
  const pending = status === "pending";
  const entry = REGISTRY[interaction?.interaction_type];
  const Body = entry?.Component;

  const send = async (response) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(response);
    } catch (err) {
      setError(err?.userMessage || err?.response?.data?.detail || err?.message || "Submission failed.");
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onCancel();
    } catch (err) {
      setError(err?.userMessage || err?.message || "Cancel failed.");
      setBusy(false);
    }
  };

  return (
    <div style={s.card}>
      <div style={s.head}>
        <span style={s.title}>{interaction?.title || entry?.title || "Interaction"}</span>
        {!pending && (
          <span style={{ ...s.badge, color: STATUS_COLOR[status] || "#94a3b8" }}>{status}</span>
        )}
      </div>
      <fieldset
        disabled={!pending || busy}
        style={{ ...s.fieldset, opacity: pending && !busy ? 1 : 0.6 }}
      >
        {Body ? (
          <Body payload={interaction.payload || {}} send={send} cancel={cancel} setError={setError} />
        ) : (
          <FallbackCard interaction={interaction} />
        )}
      </fieldset>
      {error && <div style={s.error}>⚠ {error}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  card: {
    display: "flex", flexDirection: "column", gap: 10, padding: 16, width: "100%",
    background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 14, color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace", boxSizing: "border-box",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 15, fontWeight: 700, color: "#fbbf24" },
  badge: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 },
  fieldset: { border: "none", padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  note: {
    fontSize: 12, color: "#94a3b8", lineHeight: 1.6, padding: "8px 10px",
    background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8,
  },
  label: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6366f1", fontWeight: 700, marginTop: 4 },
  pre: {
    margin: 0, padding: 10, borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b",
    color: "#cbd5e1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
    maxHeight: 240, overflow: "auto",
  },
  muted: { color: "#475569", fontSize: 12 },
  inp: {
    flex: 1, width: "100%", padding: "8px 10px", borderRadius: 8, background: "#0f172a",
    color: "#e2e8f0", border: "1px solid #1e293b", fontSize: 12, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  },
  item: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
    padding: "7px 10px", borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a", fontSize: 12,
  },
  removeBtn: { background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 12 },
  question: { padding: 12, borderRadius: 10, border: "1px solid #1e293b", background: "#0f172a" },
  qText: { fontSize: 13, fontWeight: 600, marginBottom: 8, wordBreak: "break-word" },
  opt: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#cbd5e1", marginBottom: 4, cursor: "pointer" },
  error: {
    padding: "8px 12px", borderRadius: 8, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  cancelBtn: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  okBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #059669, #065f46)", color: "white",
    fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  rejectBtn: {
    padding: "8px 18px", borderRadius: 9, border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.12)", color: "#fca5a5", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  addBtn: {
    padding: "8px 14px", borderRadius: 9, border: "none", whiteSpace: "nowrap",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "white",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
};