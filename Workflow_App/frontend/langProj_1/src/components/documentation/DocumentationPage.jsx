// src/components/documentation/DocumentationPage.jsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getFlowDocumentation, createFlowDocumentation, updateFlowDocumentation,
  deleteFlowDocumentation,
} from "../../services/api";
import { flowPath, groupPath } from "../../utils/routes";

const TOP_FIELDS = [
  { key: "flow_name", label: "Flow Name", rows: 1, hint: "Documentation title. Does not rename the workflow." },
  { key: "description", label: "Description", rows: 5 },
  { key: "objective", label: "Objective", rows: 3 },
  { key: "application", label: "Application", rows: 3 },
  { key: "use_cases", label: "Use Cases", rows: 4 },
];

const BOTTOM_FIELDS = [
  { key: "expected_output", label: "Expected Output", rows: 4 },
  { key: "input_requirements", label: "Input Requirements", rows: 4 },
  { key: "dependencies", label: "Dependencies", rows: 3 },
  { key: "workflow_steps", label: "Workflow Steps", rows: 5 },
  { key: "error_handling", label: "Error Handling", rows: 4 },
  { key: "notes", label: "Notes", rows: 3 },
];

const EMPTY = Object.fromEntries([...TOP_FIELDS, ...BOTTOM_FIELDS].map((f) => [f.key, ""]));

const STATUS = {
  not_run: { label: "Not Run", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  passed:  { label: "Passed",  color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  failed:  { label: "Failed",  color: "#fca5a5", bg: "rgba(239,68,68,0.12)" },
};

let seq = 0;
const newId = () => `tc_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blankCase = (n) => ({
  id: newId(), name: `Test Case ${n}`, description: "", input_data: "",
  expected_output: "", actual_output: "", status: "not_run", notes: "",
});

const snapshot = (content, cases) => JSON.stringify({ content, cases });
const errText = (err, fb) => err?.response?.data?.detail || err?.message || fb;

export default function DocumentationPage() {
  const { flowId: flowParam } = useParams();
  const navigate = useNavigate();
  const flowId = /^\d+$/.test(flowParam || "") ? Number(flowParam) : null;

  const [phase, setPhase] = useState("loading"); // loading | ready | notfound | error
  const [loadError, setLoadError] = useState("");
  const [flow, setFlow] = useState(null);
  const [exists, setExists] = useState(false);
  const [version, setVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [content, setContent] = useState(EMPTY);
  const [cases, setCases] = useState([]);
  const [baseline, setBaseline] = useState(snapshot(EMPTY, []));
  const [open, setOpen] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text, conflict? }

  const dirty = useMemo(() => snapshot(content, cases) !== baseline, [content, cases, baseline]);

  const apply = useCallback((payload) => {
    const d = payload.documentation;
    const c = { ...EMPTY, ...(d.content || {}) };
    const t = d.test_cases || [];
    setFlow(payload.flow);
    setExists(payload.exists);
    setVersion(d.version);
    setUpdatedAt(d.updated_at);
    setContent(c);
    setCases(t);
    setBaseline(snapshot(c, t));
    setOpen(new Set());
  }, []);

  const load = useCallback(async () => {
    if (flowId == null) { setPhase("notfound"); return; }
    setPhase("loading");
    setMessage(null);
    try {
      apply(await getFlowDocumentation(flowId));
      setPhase("ready");
    } catch (err) {
      if (err?.response?.status === 404) setPhase("notfound");
      else { setLoadError(errText(err, "Failed to load documentation.")); setPhase("error"); }
    }
  }, [flowId, apply]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const setField = (key, value) => setContent((c) => ({ ...c, [key]: value }));
  const updCase = (id, u) => setCases((list) => list.map((c) => (c.id === id ? { ...c, ...u } : c)));
  const toggle = (id) =>
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addCase = () => {
    const c = blankCase(cases.length + 1);
    setCases((list) => [...list, c]);
    setOpen((s) => new Set(s).add(c.id));
  };

  const removeCase = (c) => {
    if (!window.confirm(`Delete test case "${c.name}"?`)) return;
    setCases((list) => list.filter((x) => x.id !== c.id));
  };

  const validate = () => {
    const bad = cases.findIndex((c) => !(c.name || "").trim());
    if (bad !== -1) {
      setOpen((s) => new Set(s).add(cases[bad].id));
      return `Test case ${bad + 1}: name is required.`;
    }
    return "";
  };

  const save = async () => {
    if (saving) return;
    const problem = validate();
    if (problem) return setMessage({ ok: false, text: problem });
    setSaving(true);
    setMessage(null);
    try {
      const body = { content, test_cases: cases };
      const payload = exists
        ? await updateFlowDocumentation(flowId, { ...body, base_version: version })
        : await createFlowDocumentation(flowId, body);
      apply(payload);
      setMessage({ ok: true, text: "✓ Documentation saved." });
    } catch (err) {
      setMessage({
        ok: false,
        text: errText(err, "Failed to save documentation."),
        conflict: err?.response?.status === 409,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscard = () => !dirty || window.confirm("You have unsaved changes. Discard them?");

  const cancel = () => {
    if (!dirty || !confirmDiscard()) return;
    const parsed = JSON.parse(baseline);
    setContent(parsed.content);
    setCases(parsed.cases);
    setMessage(null);
  };

  const back = () => {
    if (!confirmDiscard()) return;
    if (!flow) return navigate("/");
    if (flow.route_slug) navigate(flowPath(flow.route_slug, flow.group_id));
    else navigate(flow.group_id ? groupPath(flow.group_id) : "/");
  };

  const remove = async () => {
    if (!exists) return;
    if (!window.confirm("Delete ALL documentation and test cases for this workflow? This cannot be undone.")) return;
    try {
      await deleteFlowDocumentation(flowId);
      await load();
      setMessage({ ok: true, text: "✓ Documentation deleted." });
    } catch (err) {
      setMessage({ ok: false, text: errText(err, "Failed to delete documentation.") });
    }
  };

  if (phase === "loading") return <Shell><div style={s.muted}>Loading documentation…</div></Shell>;

  if (phase === "notfound") {
    return (
      <Shell>
        <div style={s.card}>
          <div style={s.h1}>Workflow not found</div>
          <div style={s.muted}>No workflow exists with ID “{flowParam}”. It may have been deleted.</div>
          <button style={s.btn} onClick={() => navigate("/")}>← All Flows</button>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <div style={s.card}>
          <div style={s.h1}>Could not load documentation</div>
          <div style={s.errBox}>⚠ {loadError}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.btn} onClick={load}>Retry</button>
            <button style={s.btn} onClick={() => navigate("/")}>← All Flows</button>
          </div>
        </div>
      </Shell>
    );
  }

  const renderField = (f) => (
    <div key={f.key} style={s.field}>
      <label style={s.lbl}>{f.label}</label>
      {f.rows === 1 ? (
        <input
          style={s.inp}
          value={content[f.key] ?? ""}
          maxLength={200}
          placeholder={flow?.name || ""}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      ) : (
        <textarea
          style={{ ...s.inp, resize: "vertical", lineHeight: 1.5 }}
          rows={f.rows}
          value={content[f.key] ?? ""}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      )}
      {f.hint && <div style={s.hint}>{f.hint}</div>}
    </div>
  );

  return (
    <Shell>
      <div style={s.header}>
        <div>
          <button style={s.linkBtn} onClick={back}>← Back to workflow</button>
          <div style={s.h1}>📝 Documentation · {flow?.name}</div>
          <div style={s.muted}>
            Workflow ID {flow?.id} · {exists ? `Version ${version}` : "Not saved yet"} ·{" "}
            Last saved: {updatedAt ? new Date(updatedAt).toLocaleString() : "—"}
          </div>
        </div>
        <div style={s.actions}>
          {dirty && <span style={s.dirty}>● Unsaved changes</span>}
          <button style={{ ...s.btn, opacity: dirty ? 1 : 0.5 }} disabled={!dirty} onClick={cancel}>Cancel</button>
          <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "💾 Save Documentation"}
          </button>
        </div>
      </div>

      {message && (
        <div style={message.ok ? s.okBox : s.errBox}>
          <span>{message.text}</span>
          {message.conflict && (
            <button style={s.btn} onClick={() => { if (window.confirm("Discard your edits and load the latest version?")) load(); }}>
              Reload latest
            </button>
          )}
        </div>
      )}

      <div style={s.card}>{TOP_FIELDS.map(renderField)}</div>

      <div style={s.card}>
        <div style={s.sectionHead}>
          <div style={s.h2}>Test Cases ({cases.length})</div>
          <button style={s.btnPrimary} onClick={addCase}>＋ Add Test Case</button>
        </div>
        <div style={s.hint}>
          Documentation only: test cases are never executed automatically and are separate from workflow runs.
        </div>

        {cases.length === 0 && <div style={{ ...s.muted, marginTop: 12 }}>No test cases yet.</div>}

        {cases.map((c, i) => {
          const st = STATUS[c.status] || STATUS.not_run;
          const isOpen = open.has(c.id);
          return (
            <div key={c.id} style={s.caseCard}>
              <div style={s.caseRow}>
                <div style={{ minWidth: 0 }}>
                  <span style={s.caseName}>{i + 1}. {c.name || "(unnamed)"}</span>
                  <span style={{ ...s.badge, color: st.color, background: st.bg }}>{st.label}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={s.btnSm} onClick={() => toggle(c.id)}>{isOpen ? "Done" : "Edit"}</button>
                  <button style={s.btnDanger} onClick={() => removeCase(c)}>✕ Delete</button>
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 10 }}>
                  <div style={s.field}>
                    <label style={s.lbl}>Test Case Name *</label>
                    <input style={s.inp} value={c.name} maxLength={200} onChange={(e) => updCase(c.id, { name: e.target.value })} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Description</label>
                    <textarea style={{ ...s.inp, resize: "vertical" }} rows={2} value={c.description} onChange={(e) => updCase(c.id, { description: e.target.value })} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Input Data</label>
                    <textarea style={{ ...s.inp, resize: "vertical" }} rows={3} value={c.input_data} onChange={(e) => updCase(c.id, { input_data: e.target.value })} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Expected Output</label>
                    <textarea style={{ ...s.inp, resize: "vertical" }} rows={3} value={c.expected_output} onChange={(e) => updCase(c.id, { expected_output: e.target.value })} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Actual Output (optional)</label>
                    <textarea style={{ ...s.inp, resize: "vertical" }} rows={3} value={c.actual_output} onChange={(e) => updCase(c.id, { actual_output: e.target.value })} />
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Status</label>
                    <select style={s.inp} value={c.status} onChange={(e) => updCase(c.id, { status: e.target.value })}>
                      <option value="not_run">Not Run</option>
                      <option value="passed">Passed</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  <div style={s.field}>
                    <label style={s.lbl}>Notes</label>
                    <textarea style={{ ...s.inp, resize: "vertical" }} rows={2} value={c.notes} onChange={(e) => updCase(c.id, { notes: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={s.card}>{BOTTOM_FIELDS.map(renderField)}</div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...s.btnDanger, opacity: exists ? 1 : 0.4 }} disabled={!exists} onClick={remove}>
          ✕ Delete Documentation
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.btn} onClick={back}>Back</button>
          <button style={{ ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "💾 Save Documentation"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <span style={{ color: "#818cf8", fontWeight: 700, fontSize: 14 }}>🚀 DJ Workflow Builder · Documentation</span>
        <span style={{ color: "#e9e9f3", fontWeight: 600, fontSize: 12 }}>Developed by Dheeraj</span>
      </div>
      <div style={s.scroll}>
        <div style={s.wrap}>{children}</div>
      </div>
    </div>
  );
}

const s = {
  root: {
    width: "100%", height: "100%", display: "flex", flexDirection: "column",
    background: "#020617", color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  topBar: {
    height: 42, flexShrink: 0, background: "#0f172a", borderBottom: "1px solid #1e293b",
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px",
  },
  scroll: { flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 16px" },
  wrap: { maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  h1: { fontSize: 20, fontWeight: 700, color: "#e2e8f0", margin: "6px 0 4px", wordBreak: "break-word" },
  h2: { fontSize: 15, fontWeight: 700, color: "#818cf8" },
  muted: { color: "#64748b", fontSize: 12 },
  hint: { color: "#475569", fontSize: 11, marginTop: 4 },
  dirty: { color: "#fbbf24", fontSize: 12, fontWeight: 600 },
  card: {
    background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 14, padding: 18,
    display: "flex", flexDirection: "column", gap: 4,
  },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  field: { marginBottom: 12 },
  lbl: {
    display: "block", fontSize: 10, color: "#94a3b8", marginBottom: 5,
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  inp: {
    width: "100%", padding: "9px 11px", borderRadius: 8, background: "#0f172a", color: "#e2e8f0",
    border: "1px solid #1e293b", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  },
  btn: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  btnPrimary: {
    padding: "8px 18px", borderRadius: 9, border: "none", color: "white", fontSize: 13, fontWeight: 700,
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)", cursor: "pointer", fontFamily: "inherit",
  },
  btnSm: {
    padding: "4px 10px", borderRadius: 7, border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  btnDanger: {
    padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  linkBtn: {
    background: "transparent", border: "none", color: "#818cf8", fontSize: 12, fontWeight: 700,
    cursor: "pointer", padding: 0, fontFamily: "inherit",
  },
  okBox: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px",
    borderRadius: 10, fontSize: 12, background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7",
  },
  errBox: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px",
    borderRadius: 10, fontSize: 12, background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  caseCard: { marginTop: 10, padding: 12, borderRadius: 10, border: "1px solid #1e293b", background: "#0f172a" },
  caseRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
  caseName: { fontSize: 13, fontWeight: 700, marginRight: 10, wordBreak: "break-word" },
  badge: { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, letterSpacing: "0.06em" },
};