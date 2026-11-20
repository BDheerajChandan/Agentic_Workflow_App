import { useCallback, useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import Header from "./Header";
import JobPanel from "./JobPanel";
import RegisterProjectModal from "./RegisterProjectModal";
import RegisterServiceModal from "./RegisterServiceModal";
import ServiceDetails from "./ServiceDetails";
import ServiceGrid from "./ServiceGrid";
import TokenPrompt from "./TokenPrompt";
import ToastStack from "./ToastStack";
import useServices from "../hooks/useServices";
import useToasts from "../hooks/useToasts";
import { listProjects } from "../services/serviceApi";

export default function Dashboard() {
  const { toasts, push, dismiss } = useToasts();
  const sv = useServices({ notify: push });

  const [projects, setProjects] = useState([]);
  const [detailsId, setDetailsId] = useState(null);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [form, setForm] = useState(null); // { mode: "create" } | { mode: "edit", config }
  const [projectOpen, setProjectOpen] = useState(false);
  const [confirmStopAll, setConfirmStopAll] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      setProjects((await listProjects()).data || []);
    } catch {
      /* the dashboard banner already reports API problems */
    }
  }, []);

  useEffect(() => { if (!sv.error) loadProjects(); }, [loadProjects, sv.error, sv.services.length]);

  const openCreate = () => { loadProjects(); setForm({ mode: "create" }); };

  const afterSave = (res) => {
    push("success", res.message);
    setForm(null);
    sv.reload();
    loadProjects();
    setDetailsVersion((v) => v + 1);
  };

  const afterChange = () => {
    sv.reload();
    setDetailsVersion((v) => v + 1);
  };

  return (
    <div className="app">
      <main className="page">
        <Header
          summary={sv.summary}
          docker={sv.docker}
          refreshedAt={sv.refreshedAt}
          refreshing={sv.refreshing}
          jobRunning={sv.job?.state === "running"}
          onStartAll={sv.startAll}
          onStopAll={() => setConfirmStopAll(true)}
          onRefresh={sv.refresh}
          onRegisterService={openCreate}
          onRegisterProject={() => setProjectOpen(true)}
        />

        {sv.error && !sv.authRequired && (
          <div className="banner banner-error">
            <span>{sv.error.message}</span>
            <button className="btn btn-sm" onClick={sv.refresh}>Retry</button>
          </div>
        )}

        {sv.docker && !sv.docker.connected && !sv.error && (
          <div className="banner banner-warn">
            <span>Docker is disconnected. {sv.docker.error || "Start Docker Desktop to manage services."}</span>
            <button className="btn btn-sm" onClick={sv.refresh}>Check again</button>
          </div>
        )}

        <JobPanel job={sv.job} label={sv.jobLabel} onDismiss={sv.dismissJob} />

        <ServiceGrid
          services={sv.services}
          loading={sv.loading}
          busy={sv.busy}
          onRun={(s) => sv.act(s, "start")}
          onStop={(s) => sv.act(s, "stop")}
          onRestart={(s) => sv.act(s, "restart")}
          onDetails={(s) => setDetailsId(s.service_id)}
          onRegister={openCreate}
        />
      </main>

      {detailsId && (
        <ServiceDetails
          serviceId={detailsId}
          version={detailsVersion}
          notify={push}
          onClose={() => setDetailsId(null)}
          onEdit={(config) => { loadProjects(); setForm({ mode: "edit", config }); }}
          onChanged={afterChange}
        />
      )}

      {form && (
        <RegisterServiceModal
          mode={form.mode}
          config={form.config}
          projects={projects}
          services={sv.services}
          onClose={() => setForm(null)}
          onSaved={afterSave}
        />
      )}

      {projectOpen && (
        <RegisterProjectModal
          onClose={() => setProjectOpen(false)}
          onSaved={(res) => { push("success", res.message); setProjectOpen(false); loadProjects(); sv.reload(); }}
        />
      )}

      {confirmStopAll && (
        <ConfirmModal
          title="Stop all services?"
          message={"Every service managed by DJ Services will be stopped, dependents first.\nOther Docker containers are not affected."}
          confirmLabel="Stop All"
          danger
          onConfirm={() => { setConfirmStopAll(false); sv.stopAll(); }}
          onCancel={() => setConfirmStopAll(false)}
        />
      )}

      {sv.authRequired && <TokenPrompt onSaved={sv.reload} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}