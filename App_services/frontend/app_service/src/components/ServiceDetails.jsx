import { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import ServiceLogs from "./ServiceLogs";
import { HealthBadge, StatusBadge } from "./StatusBadge";
import { deleteService, getDetails, updateService } from "../services/serviceApi";
import { TYPE_LABEL, dockerLabel, fmtAgo, fmtDate } from "../utils/formatters";

const TABS = ["Overview", "Logs", "Events", "Configuration"];

function Row({ label, children }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children === undefined || children === null || children === "" ? "—" : children}</dd>
    </div>
  );
}

export default function ServiceDetails({ serviceId, version, onClose, onEdit, onChanged, notify }) {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [alsoVolumes, setAlsoVolumes] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const run = async () => {
      try {
        const res = await getDetails(serviceId);
        if (!cancelled) { setData(res.data); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) timer = setTimeout(run, 5000);
      }
    };
    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [serviceId, version]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !confirmDelete) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmDelete]);

  const svc = data?.service;
  const cfg = data?.config;
  const ctr = data?.container;

  const toggleEnabled = async () => {
    setWorking(true);
    try {
      await updateService(serviceId, { enabled: !cfg.enabled });
      notify("success", `${cfg.service_name} ${cfg.enabled ? "disabled" : "enabled"}.`);
      onChanged();
    } catch (err) {
      notify("error", err.message);
    } finally {
      setWorking(false);
    }
  };

  const doDelete = async () => {
    setWorking(true);
    try {
      const res = await deleteService(serviceId, { removeContainer: true, volumes: alsoVolumes });
      notify(res.data?.warning ? "info" : "success", res.message + (res.data?.warning ? `\n${res.data.warning}` : ""));
      setConfirmDelete(false);
      onChanged();
      onClose();
    } catch (err) {
      notify("error", err.message);
      setConfirmDelete(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{svc?.service_name || serviceId}</div>
            {svc && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <StatusBadge state={svc.state} />
                <HealthBadge health={svc.health} />
              </div>
            )}
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {error && <div className="note note-error" style={{ marginBottom: 10 }}>{error.message}</div>}
        {!data && !error && <div className="hint"><span className="spinner" /> Loading…</div>}

        {data && tab === "Overview" && (
          <>
            {data.pending_recreate && (
              <div className="note note-warn" style={{ marginBottom: 10 }}>
                The saved configuration differs from the running container. Restart the service to apply it.
              </div>
            )}
            {(svc.last_error || data.runtime?.last_error) && (
              <div className="note note-error" style={{ marginBottom: 10 }}>{svc.last_error || data.runtime.last_error}</div>
            )}
            <dl className="detail-grid">
              <Row label="Application name">{cfg.service_name}</Row>
              <Row label="Project">{data.project?.project_name}</Row>
              <Row label="Service ID">{cfg.service_id}</Row>
              <Row label="Type / runtime">{`${TYPE_LABEL[cfg.service_type] || cfg.service_type} / ${cfg.runtime_type}`}</Row>
              <Row label="Container ID">{ctr?.short_id}</Row>
              <Row label="Container name">{cfg.container_name}</Row>
              <Row label="Image">{ctr?.image || cfg.docker_image}</Row>
              <Row label="Created">{fmtDate(ctr?.created)}</Row>
              <Row label="Host port">{cfg.host_port}</Row>
              <Row label="Container port">{cfg.container_port}</Row>
              <Row label="Application URL"><a href={svc.url} target="_blank" rel="noopener noreferrer">{svc.url}</a></Row>
              <Row label="Port mapping">
                {ctr?.ports?.length
                  ? ctr.ports.map((p) => `${p.host_ip || ""}:${p.host_port} → ${p.container_port}/${p.protocol}`).join(", ")
                  : `${cfg.bind_address}:${cfg.host_port} → ${cfg.container_port}`}
              </Row>
              <Row label="Project location">{data.paths?.local || cfg.project_path}</Row>
              <Row label="Docker sees it as">{data.paths?.docker_host}</Row>
              <Row label="Docker status">{dockerLabel(svc.docker_status)}</Row>
              <Row label="Application health">{svc.health}{svc.health_detail?.status_code ? ` (HTTP ${svc.health_detail.status_code})` : ""}</Row>
              <Row label="Last health check OK">{svc.last_health_check_at ? `${fmtDate(svc.last_health_check_at)} (${fmtAgo(svc.last_health_check_at)})` : "—"}</Row>
              <Row label="Restart policy">{ctr?.restart_policy || cfg.restart_policy}</Row>
              <Row label="Auto-start / auto-restart">{`${cfg.auto_start ? "ON" : "OFF"} / ${cfg.auto_restart ? "ON" : "OFF"}`}</Row>
              <Row label="Last started">{fmtDate(svc.last_started_at)}</Row>
              <Row label="Last stopped">{fmtDate(svc.last_stopped_at)}</Row>
              <Row label="Restart count / exit code">{ctr ? `${ctr.restart_count ?? 0} / ${ctr.exit_code ?? "—"}` : "—"}</Row>
              <Row label="Depends on">{cfg.depends_on?.length ? cfg.depends_on.join(", ") : "None"}</Row>
              <Row label="Mounts">
                {ctr?.mounts?.length ? ctr.mounts.map((m) => `${m.source} → ${m.target}`).join("; ") : "—"}
              </Row>
              <Row label="Environment (secrets masked)">
                {Object.keys(cfg.env || {}).length ? Object.entries(cfg.env).map(([k, v]) => `${k}=${v}`).join(", ") : "None"}
              </Row>
            </dl>
            <div className="detail-actions">
              <button className="btn" onClick={() => onEdit(cfg)}>✎ Edit</button>
              <button className="btn" disabled={working} onClick={toggleEnabled}>{cfg.enabled ? "Disable" : "Enable"}</button>
              <button className="btn btn-danger" disabled={working} onClick={() => setConfirmDelete(true)}>✕ Delete</button>
            </div>
          </>
        )}

        {tab === "Logs" && <ServiceLogs serviceId={serviceId} />}

        {data && tab === "Events" && (
          <div className="events">
            {data.events.length === 0 && <div className="hint">No events recorded.</div>}
            {data.events.map((e) => (
              <div key={e.event_id} className="event">
                <span>{fmtDate(e.created_at)}</span>
                <span className="event-type">{e.event_type}</span>
                <span>{e.event_message}</span>
              </div>
            ))}
          </div>
        )}

        {data && tab === "Configuration" && (
          <pre className="json">{JSON.stringify(cfg, null, 2)}</pre>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${cfg?.service_name}?`}
          message={`This removes the registration and its Docker container. Other services depending on it block the deletion. Project source files are never touched.`}
          confirmLabel="Delete service"
          danger
          busy={working}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        >
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={alsoVolumes} onChange={(e) => setAlsoVolumes(e.target.checked)} />
            Also remove installed dependency volumes (next start reinstalls them)
          </label>
        </ConfirmModal>
      )}
    </div>
  );
}