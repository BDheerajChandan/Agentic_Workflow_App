import { useEffect, useMemo, useRef, useState } from "react";
import { checkPort, registerService, updateService } from "../services/serviceApi";
import { envToText, parseEnv, slugify } from "../utils/formatters";

const TYPES = [
  { value: "backend", label: "Backend" }, { value: "frontend", label: "Frontend" },
  { value: "worker", label: "Worker" }, { value: "database", label: "Database" }, { value: "other", label: "Other" },
];
const RUNTIMES = [
  { value: "python", label: "Python (FastAPI, scripts)" }, { value: "node", label: "Node (Vite, Express)" },
  { value: "image", label: "Docker image" }, { value: "dockerfile", label: "Dockerfile in project" },
];
const RUNTIME_BY_TYPE = { backend: "python", frontend: "node", worker: "python", database: "image", other: "image" };
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,62}$/;

const blank = (projects) => ({
  projectMode: projects.length ? "existing" : "new", project_id: projects[0]?.project_id || "",
  project_name: "", project_root: "", service_name: "", service_id: "", service_type: "backend",
  runtime_type: "python", project_path: "", dockerfile_path: "", compose_file_path: "", container_name: "",
  docker_image: "", host: "localhost", host_port: "", container_port: "", protocol: "http",
  health_check_path: "/", enabled: true, auto_start: false, auto_restart: true, depends_on: [], envText: "",
});

const fromConfig = (c) => ({
  projectMode: "existing", project_id: c.project_id, project_name: "", project_root: "",
  service_name: c.service_name, service_id: c.service_id, service_type: c.service_type,
  runtime_type: c.runtime_type, project_path: c.project_path, dockerfile_path: c.dockerfile_path || "",
  compose_file_path: c.compose_file_path || "", container_name: c.container_name, docker_image: c.docker_image || "",
  host: c.host, host_port: String(c.host_port), container_port: String(c.container_port), protocol: c.protocol,
  health_check_path: c.health_check_path, enabled: c.enabled, auto_start: c.auto_start,
  auto_restart: c.auto_restart, depends_on: c.depends_on || [], envText: envToText(c.env),
});

function Field({ label, hint, tone, full, children }) {
  return (
    <div className={`field ${full ? "field-full" : ""}`}>
      <label className="label">{label}</label>
      {children}
      {hint && <div className={`hint ${tone ? `hint-${tone}` : ""}`}>{hint}</div>}
    </div>
  );
}

export default function RegisterServiceModal({ mode, config, projects, services, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(() => (isEdit ? fromConfig(config) : blank(projects)));
  const touched = useRef(new Set(isEdit ? ["service_id", "container_name", "container_port", "runtime_type", "health"] : []));
  const [portInfo, setPortInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [advanced, setAdvanced] = useState(isEdit);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const edit = (key, value) => { touched.current.add(key); set({ [key]: value }); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const onName = (value) => {
    const patch = { service_name: value };
    if (!touched.current.has("service_id") && !isEdit) {
      patch.service_id = slugify(value);
      if (!touched.current.has("container_name")) patch.container_name = patch.service_id ? `dj_${patch.service_id}` : "";
    }
    set(patch);
  };
  const onId = (value) => {
    touched.current.add("service_id");
    const patch = { service_id: value };
    if (!touched.current.has("container_name") && !isEdit) patch.container_name = value ? `dj_${value}` : "";
    set(patch);
  };
  const onType = (value) => {
    const patch = { service_type: value };
    if (!touched.current.has("runtime_type")) patch.runtime_type = RUNTIME_BY_TYPE[value];
    set(patch);
  };
  const onHostPort = (value) => {
    const patch = { host_port: value };
    if (!touched.current.has("container_port")) patch.container_port = value;
    set(patch);
  };

  // Host-port availability hint (non-blocking; the backend validates on save).
  useEffect(() => {
    const port = Number(form.host_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) { setPortInfo(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await checkPort(port, isEdit ? form.service_id : undefined);
        if (!cancelled) setPortInfo(res.data);
      } catch { if (!cancelled) setPortInfo(null); }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.host_port, form.service_id, isEdit]);

  const portHint = useMemo(() => {
    if (!portInfo) return null;
    if (portInfo.reserved) return { tone: "bad", text: "Reserved by DJ Services / PostgreSQL." };
    if (portInfo.registered_to) return { tone: "bad", text: `Already assigned to "${portInfo.registered_to}".` };
    if (portInfo.in_use) return { tone: "warn", text: `In use now${portInfo.containers?.length ? ` by ${portInfo.containers.join(", ")}` : " by another process"}.` };
    return { tone: "ok", text: "Port is available." };
  }, [portInfo]);

  const otherServices = services.filter((s) => s.service_id !== form.service_id);
  const toggleDep = (id) =>
    set({ depends_on: form.depends_on.includes(id) ? form.depends_on.filter((d) => d !== id) : [...form.depends_on, id] });

  const validate = () => {
    const out = [];
    const { env, errors: envErrors } = parseEnv(form.envText);
    if (!form.service_name.trim()) out.push("Service name is required.");
    if (!ID_RE.test(form.service_id)) out.push("Service ID must be 2-63 chars: lowercase letters, digits, '_' or '-'.");
    if (!isEdit) {
      if (form.projectMode === "existing" && !form.project_id) out.push("Select a project.");
      if (form.projectMode === "new" && !form.project_name.trim()) out.push("Enter a name for the new project.");
    }
    if (!form.project_path.trim()) out.push("Project path is required.");
    for (const [label, v] of [["Host port", form.host_port], ["Container port", form.container_port]]) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) out.push(`${label} must be a whole number between 1 and 65535.`);
    }
    if (!NAME_RE.test(form.container_name || `dj_${form.service_id}`)) out.push("Container name may use letters, digits, '_', '.', '-'.");
    if (!form.health_check_path.startsWith("/")) out.push("Health check path must start with '/'.");
    if (form.runtime_type === "dockerfile" && !form.dockerfile_path.trim()) out.push("Dockerfile path is required for the Dockerfile runtime.");
    if (form.runtime_type === "image" && !form.docker_image.trim()) out.push("Docker image is required for the image runtime.");
    return { out: [...out, ...envErrors], env };
  };

  const submit = async (e) => {
    e.preventDefault();
    const { out, env } = validate();
    if (out.length) return setErrors(out);

    const base = {
      service_name: form.service_name.trim(), service_type: form.service_type, project_path: form.project_path.trim(),
      runtime_type: form.runtime_type, dockerfile_path: form.dockerfile_path.trim() || null,
      compose_file_path: form.compose_file_path.trim() || null,
      container_name: form.container_name.trim() || `dj_${form.service_id}`,
      docker_image: form.docker_image.trim() || null, host: form.host.trim() || "localhost",
      host_port: Number(form.host_port), container_port: Number(form.container_port), protocol: form.protocol,
      health_check_path: form.health_check_path.trim() || "/", enabled: form.enabled,
      auto_start: form.auto_start, auto_restart: form.auto_restart, depends_on: form.depends_on, env,
    };

    setSaving(true);
    setErrors([]);
    try {
      let res;
      if (isEdit) {
        res = await updateService(form.service_id, base);
      } else {
        const payload = { ...base, service_id: form.service_id };
        if (form.projectMode === "existing") payload.project_id = form.project_id;
        else { payload.project_name = form.project_name.trim(); if (form.project_root.trim()) payload.project_root = form.project_root.trim(); }
        res = await registerService(payload);
      }
      onSaved(res);
    } catch (err) {
      setErrors([err.message, ...(Array.isArray(err.details) ? err.details.filter((d) => d !== err.message) : [])]);
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={() => !saving && onClose()}>
      <form className="modal modal-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <div className="modal-title">{isEdit ? `Edit ${config.service_name}` : "Register Service"}</div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          {!isEdit && (
            <>
              <Field label="Project *">
                <select className="select" value={form.projectMode} onChange={(e) => set({ projectMode: e.target.value })}>
                  {projects.length > 0 && <option value="existing">Existing project</option>}
                  <option value="new">＋ New project</option>
                </select>
              </Field>
              {form.projectMode === "existing" ? (
                <Field label="Select project">
                  <select className="select" value={form.project_id} onChange={(e) => set({ project_id: e.target.value })}>
                    {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="New project name *">
                    <input className="input" value={form.project_name} placeholder="DJ News Agent" onChange={(e) => set({ project_name: e.target.value })} />
                  </Field>
                  <Field label="Project root path (optional)" full>
                    <input className="input" value={form.project_root} placeholder="../dj_news_agent" onChange={(e) => set({ project_root: e.target.value })} />
                  </Field>
                </>
              )}
            </>
          )}

          <Field label="Service name *">
            <input className="input" autoFocus value={form.service_name} placeholder="DJ News Backend" onChange={(e) => onName(e.target.value)} />
          </Field>
          <Field label="Service ID *" hint={isEdit ? "The ID cannot be changed." : "Lowercase, unique."}>
            <input className="input" value={form.service_id} disabled={isEdit} onChange={(e) => onId(e.target.value)} />
          </Field>
          <Field label="Service type">
            <select className="select" value={form.service_type} onChange={(e) => onType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Runtime">
            <select className="select" value={form.runtime_type} onChange={(e) => edit("runtime_type", e.target.value)}>
              {RUNTIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Project path *" full hint="Relative to the DJ_services folder (e.g. ../LcLg_Project/backend) or an absolute path inside the allowed projects root.">
            <input className="input" value={form.project_path} placeholder="../LcLg_Project/backend" onChange={(e) => set({ project_path: e.target.value })} />
          </Field>

          <div className="section-title">Network</div>
          <Field label="Host">
            <input className="input" value={form.host} onChange={(e) => set({ host: e.target.value })} />
          </Field>
          <Field label="Protocol">
            <select className="select" value={form.protocol} onChange={(e) => set({ protocol: e.target.value })}>
              <option value="http">http</option><option value="https">https</option>
            </select>
          </Field>
          <Field label="Host port *" hint={portHint?.text} tone={portHint?.tone}>
            <input className="input" inputMode="numeric" value={form.host_port} placeholder="8002" onChange={(e) => onHostPort(e.target.value)} />
          </Field>
          <Field label="Container port *" hint="The port the application listens on inside the container.">
            <input className="input" inputMode="numeric" value={form.container_port} onChange={(e) => edit("container_port", e.target.value)} />
          </Field>
          <Field label="Health check path" full>
            <input className="input" value={form.health_check_path} onChange={(e) => set({ health_check_path: e.target.value })} />
          </Field>

          <div className="section-title">Behaviour</div>
          <label className="check"><input type="checkbox" checked={form.auto_start} onChange={(e) => set({ auto_start: e.target.checked })} /> Auto start on Docker startup (only if it was running)</label>
          <label className="check"><input type="checkbox" checked={form.auto_restart} onChange={(e) => set({ auto_restart: e.target.checked })} /> Auto restart on failure</label>
          <label className="check"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enabled</label>
          <div className="hint">Registering never starts the service. Click Run when you want it running.</div>

          <div className="field-full">
            <button type="button" className="btn btn-sm" onClick={() => setAdvanced((a) => !a)}>
              {advanced ? "▲ Hide advanced" : "▼ Advanced (container, dependencies, environment)"}
            </button>
          </div>

          {advanced && (
            <>
              <Field label="Container name" hint="Stable name; derived from the service ID.">
                <input className="input" value={form.container_name} onChange={(e) => edit("container_name", e.target.value)} />
              </Field>
              <Field label="Docker image" hint="Optional for Python/Node (defaults apply). Required for image runtime.">
                <input className="input" value={form.docker_image} placeholder="python:3.11" onChange={(e) => set({ docker_image: e.target.value })} />
              </Field>
              <Field label="Dockerfile path" hint="Relative to the project path (Dockerfile runtime).">
                <input className="input" value={form.dockerfile_path} placeholder="Dockerfile" onChange={(e) => set({ dockerfile_path: e.target.value })} />
              </Field>
              <Field label="Docker Compose file path (optional)" hint="Stored for reference only; never executed.">
                <input className="input" value={form.compose_file_path} onChange={(e) => set({ compose_file_path: e.target.value })} />
              </Field>
              <Field label="Depends on" full>
                {otherServices.length === 0 ? (
                  <div className="hint">No other services registered.</div>
                ) : (
                  <div className="check-list">
                    {otherServices.map((s) => (
                      <label key={s.service_id} className="check">
                        <input type="checkbox" checked={form.depends_on.includes(s.service_id)} onChange={() => toggleDep(s.service_id)} />
                        {s.service_name}
                      </label>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="Environment (KEY=VALUE per line)" full hint="Secrets must be references such as API_KEY=${API_KEY}, resolved from the DJ Services environment. Literal secrets are rejected.">
                <textarea className="textarea" rows={4} value={form.envText} placeholder={"DB_HOST=host.docker.internal\nOPENAI_API_KEY=${OPENAI_API_KEY}"} onChange={(e) => set({ envText: e.target.value })} />
              </Field>
            </>
          )}
        </div>

        {errors.length > 0 && (
          <ul className="error-list">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Register Service"}
          </button>
        </div>
      </form>
    </div>
  );
}