import { useEffect, useState } from "react";
import { createProject } from "../services/serviceApi";
import { slugify } from "../utils/formatters";

export default function RegisterProjectModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (e) => {
    e.preventDefault();
    const projectId = (id || slugify(name)).replace(/_/g, "_");
    const problems = [];
    if (!name.trim()) problems.push("Project name is required.");
    if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(projectId)) problems.push("Project ID must be 2-63 chars: lowercase letters, digits, '_' or '-'.");
    if (problems.length) return setErrors(problems);

    setSaving(true);
    setErrors([]);
    try {
      const res = await createProject({
        project_id: projectId, project_name: name.trim(), project_path: path.trim(),
        description: description.trim(), enabled: true,
      });
      onSaved(res);
    } catch (err) {
      setErrors([err.message, ...(Array.isArray(err.details) ? err.details : [])]);
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={() => !saving && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <div className="modal-title">Register Project</div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <div className="field field-full">
            <label className="label">Project name *</label>
            <input className="input" autoFocus value={name} placeholder="DJ News Agent"
              onChange={(e) => { setName(e.target.value); if (!idTouched) setId(slugify(e.target.value)); }} />
          </div>
          <div className="field">
            <label className="label">Project ID</label>
            <input className="input" value={id} onChange={(e) => { setId(e.target.value); setIdTouched(true); }} />
          </div>
          <div className="field">
            <label className="label">Project path (optional)</label>
            <input className="input" value={path} placeholder="../dj_news_agent" onChange={(e) => setPath(e.target.value)} />
          </div>
          <div className="field field-full">
            <label className="label">Description</label>
            <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        {errors.length > 0 && (
          <ul className="error-list">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Register Project"}</button>
        </div>
      </form>
    </div>
  );
}