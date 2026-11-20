import { StatusBadge, HealthBadge } from "./StatusBadge";
import { TYPE_LABEL, dockerLabel } from "../utils/formatters";

const RUNNING = ["running", "restarting", "paused"];

export default function ServiceCard({ service: s, busy, onRun, onStop, onRestart, onDetails }) {
  const running = RUNNING.includes(s.docker_status);
  const dockerDown = s.state === "unavailable";
  const working = Boolean(busy);
  const starting = busy === "start" || busy === "restart" || (!running && s.state === "starting");
  const op = s.operation;
  const showError = !running && s.last_error && s.state !== "starting";

  const open = () => window.open(s.url, "_blank", "noopener,noreferrer");

  return (
    <article className={`card card-${s.state}`}>
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="card-name">{s.service_name}</h3>
          <span className="card-project">Project: {s.project_name}</span>
        </div>
        <StatusBadge state={starting && !running ? "starting" : s.state} />
      </div>

      <dl className="meta">
        <div><dt>Type</dt><dd>{TYPE_LABEL[s.service_type] || s.service_type}</dd></div>
        <div><dt>Host</dt><dd>{s.host}</dd></div>
        <div>
          <dt>Port</dt>
          <dd>{s.host_port}{s.container_port !== s.host_port ? ` → ${s.container_port}` : ""}</dd>
        </div>
        <div><dt>Auto-start</dt><dd>{s.auto_start ? "ON" : "OFF"}</dd></div>
        <div className="meta-wide">
          <dt>URL</dt>
          <dd>{s.state === "active" ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a> : s.url}</dd>
        </div>
        <div className="meta-wide"><dt>Docker container</dt><dd className="mono">{s.container_name}</dd></div>
        <div><dt>Docker status</dt><dd>{dockerLabel(s.docker_status)}</dd></div>
        <div><dt>Health</dt><dd><HealthBadge health={s.health} /></dd></div>
      </dl>

      {op?.state === "running" && <div className="note note-info"><span className="spinner" /> {op.message}</div>}
      {op?.state === "failed" && !running && <div className="note note-error">{op.error || op.message}</div>}
      {showError && op?.state !== "failed" && <div className="note note-error">{s.last_error}</div>}
      {s.pending_recreate && (
        <div className="note note-warn">Configuration changed. Restart to apply it (the container will be recreated).</div>
      )}
      {!s.enabled && <div className="note note-warn">This service is disabled.</div>}
      {dockerDown && <div className="note note-warn">Docker is not reachable. Actions are unavailable.</div>}

      <div className="card-actions">
        {running ? (
          <>
            <button
              className="btn"
              disabled={s.state !== "active" || working}
              title={s.state === "active" ? "Open in a new tab" : "Available when the service is active and healthy"}
              onClick={open}
            >
              Open
            </button>
            <button className="btn btn-danger" disabled={working || dockerDown} onClick={() => onStop(s)}>
              {busy === "stop" ? "Stopping…" : "Stop"}
            </button>
            <button className="btn" disabled={working || dockerDown} onClick={() => onRestart(s)}>
              {busy === "restart" ? "Restarting…" : "Restart"}
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            disabled={working || starting || dockerDown || !s.enabled}
            title={!s.enabled ? "Enable the service first" : undefined}
            onClick={() => onRun(s)}
          >
            {starting ? "Starting…" : "Run"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => onDetails(s)}>Details</button>
      </div>
    </article>
  );
}