import { fmtAgo } from "../utils/formatters";

function Chip({ label, value, tone }) {
  return (
    <div className={`chip ${tone ? `chip-${tone}` : ""}`}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </div>
  );
}

export default function Header({
  summary, docker, refreshedAt, refreshing, jobRunning,
  onStartAll, onStopAll, onRefresh, onRegisterService, onRegisterProject,
}) {
  const s = summary || { total: 0, active: 0, inactive: 0, unhealthy: 0, starting: 0 };
  const connected = docker?.connected;

  return (
    <header className="header">
      <div className="header-top">
        <div>
          <h1 className="title">DJ Application Services</h1>
          <div className="subtitle">
            Manage local applications as Docker containers
            {refreshedAt ? ` · updated ${fmtAgo(refreshedAt)}` : ""}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" disabled={jobRunning} onClick={onStartAll}>▶ Start All</button>
          <button className="btn btn-danger" disabled={jobRunning} onClick={onStopAll}>■ Stop All</button>
          <button className="btn" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? <span className="spinner" /> : "⟳"} Refresh Status
          </button>
          <button className="btn" onClick={onRegisterService}>＋ Register Service</button>
          <button className="btn" onClick={onRegisterProject}>＋ Register Project</button>
        </div>
      </div>

      <div className="summary">
        <Chip label="Total Services" value={s.total} />
        <Chip label="Active" value={s.active} tone={s.active ? "ok" : ""} />
        <Chip label="Inactive" value={s.inactive} tone={s.inactive ? "bad" : ""} />
        <Chip label="Unhealthy" value={s.unhealthy} tone={s.unhealthy ? "warn" : ""} />
        {s.starting > 0 && <Chip label="Starting" value={s.starting} tone="warn" />}
        <div title={docker?.error || ""}>
          <Chip
            label="Docker"
            value={docker ? (connected ? `Connected${docker.version ? ` · ${docker.version}` : ""}` : "Disconnected") : "…"}
            tone={docker ? (connected ? "ok" : "bad") : ""}
          />
        </div>
      </div>
    </header>
  );
}