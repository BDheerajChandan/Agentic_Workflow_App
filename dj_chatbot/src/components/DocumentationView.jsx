// src/components/DocumentationView.jsx
// Read-only view of the tagged workflow's documentation. No edit controls, no writes.

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBotDocumentation } from "../services/botApi";

const FLOW_APP_URL = import.meta.env.VITE_FLOW_APP_URL || "http://localhost:5173";

const TOP = [
  ["flow_name", "Flow Name"], ["description", "Description"], ["objective", "Objective"],
  ["application", "Application"], ["use_cases", "Use Cases"],
];
const BOTTOM = [
  ["expected_output", "Expected Output"], ["input_requirements", "Input Requirements"],
  ["dependencies", "Dependencies"], ["workflow_steps", "Workflow Steps"],
  ["error_handling", "Error Handling"], ["notes", "Notes"],
];
const STATUS = { not_run: "Not Run", passed: "Passed", failed: "Failed" };

function Section({ label, value }) {
  return (
    <div className="doc-section">
      <div className="doc-label">{label}</div>
      <div className={`doc-text ${value ? "" : "doc-empty"}`}>{value || "—"}</div>
    </div>
  );
}

export default function DocumentationView() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading", data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: "" });
    getBotDocumentation(botId)
      .then((data) => { if (!cancelled) setState({ status: "ready", data, error: "" }); })
      .catch((e) => {
        if (!cancelled) {
          setState({
            status: e?.kind === "not_found" ? "notfound" : "error",
            data: null,
            error: e?.userMessage || "Failed to load documentation.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [botId]);

  const back = () => navigate(`/bots/${botId}`);

  if (state.status === "loading") {
    return <div className="setup-root"><div className="muted">Loading documentation…</div></div>;
  }

  if (state.status !== "ready") {
    return (
      <div className="setup-root">
        <div className="setup-card">
          <h1 className="setup-title">
            {state.status === "notfound" ? "Not found" : "Could not load documentation"}
          </h1>
          <div className="form-error">{state.error}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
            ← All Bots
          </button>
        </div>
      </div>
    );
  }

  const { bot, flow, exists, documentation: doc } = state.data;
  const content = doc.content || {};
  const cases = doc.test_cases || [];

  return (
    <div className="setup-root">
      <div className="doc-wrap">
        <div className="doc-head">
          <div>
            <button className="doc-link" onClick={back}>← Back to Chat</button>
            <h1 className="setup-title" style={{ marginTop: 6 }}>📄 Workflow Documentation</h1>
            <div className="muted">
              🤖 {bot.name} · ⚙ {flow.name}
              {exists && doc.updated_at ? ` · Last updated ${new Date(doc.updated_at).toLocaleString()}` : ""}
            </div>
          </div>
          <span className="doc-readonly">Read-only</span>
        </div>

        {!exists ? (
          <div className="doc-card">
            <div className="doc-empty-title">No documentation has been written for this workflow yet.</div>
            <div className="muted" style={{ marginBottom: 12 }}>
              Documentation is created and edited in the Workflow App.
            </div>
            <a
              className="btn btn-primary"
              href={`${FLOW_APP_URL}/flows/${flow.id}/documentation`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Workflow App ↗
            </a>
          </div>
        ) : (
          <>
            <div className="doc-card">
              {TOP.map(([k, l]) => <Section key={k} label={l} value={content[k]} />)}
            </div>

            <div className="doc-card">
              <div className="doc-h2">Test Cases ({cases.length})</div>
              {cases.length === 0 && <div className="muted">No test cases documented.</div>}
              {cases.map((c, i) => (
                <div key={c.id} className="doc-case">
                  <div className="doc-case-head">
                    <span className="doc-case-name">{i + 1}. {c.name}</span>
                    <span className={`doc-badge doc-badge-${c.status}`}>{STATUS[c.status] || c.status}</span>
                  </div>
                  <Section label="Description" value={c.description} />
                  <Section label="Input Data" value={c.input_data} />
                  <Section label="Expected Output" value={c.expected_output} />
                  <Section label="Actual Output" value={c.actual_output} />
                  <Section label="Notes" value={c.notes} />
                </div>
              ))}
            </div>

            <div className="doc-card">
              {BOTTOM.map(([k, l]) => <Section key={k} label={l} value={content[k]} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}