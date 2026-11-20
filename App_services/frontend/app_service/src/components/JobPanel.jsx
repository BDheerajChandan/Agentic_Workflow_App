const ICON = { pending: "·", running: "⟳", ok: "✓", failed: "✕", skipped: "⏭" };
const TONE = { ok: "var(--ok)", failed: "var(--bad)", skipped: "var(--warn)", running: "var(--accent)", pending: "var(--muted)" };

export default function JobPanel({ job, label, onDismiss }) {
  if (!job) return null;
  const running = job.state === "running";
  return (
    <section className="job">
      <div className="job-head">
        <div className="job-title">
          {running && <span className="spinner" />} {label}
          {job.message ? ` · ${job.message}` : running ? " · in progress…" : ""}
        </div>
        {!running && <button className="btn btn-sm" onClick={onDismiss}>Dismiss</button>}
      </div>
      {job.steps.map((st) => (
        <div key={st.service_id} className="job-step">
          <span style={{ color: TONE[st.state] }}>{ICON[st.state] || "·"}</span>
          <span>{st.name}</span>
          <span className="job-msg">{st.message || st.state}</span>
        </div>
      ))}
    </section>
  );
}