// src/utils/formatters.js

export const TYPE_LABEL = {
  backend: "Backend", frontend: "Frontend", worker: "Worker", database: "Database", other: "Other",
};

export const DOCKER_LABEL = {
  running: "Running", exited: "Exited", created: "Created", restarting: "Restarting", paused: "Paused",
  dead: "Dead", removing: "Removing", not_found: "Not created",
};

export const dockerLabel = (status) => (status === null || status === undefined ? "Unavailable" : DOCKER_LABEL[status] || status);

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

export const fmtAgo = (iso) => {
  if (!iso) return "—";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};

export const slugify = (value) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

export const logLevel = (line) => {
  if (/\b(error|exception|traceback|fatal|critical|failed|denied|refused)\b/i.test(line)) return "error";
  if (/\b(warn|warning|deprecated)\b/i.test(line)) return "warn";
  return "info";
};

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const envToText = (env) =>
  Object.entries(env || {}).map(([k, v]) => `${k}=${v}`).join("\n");

// "KEY=VALUE" per line. Lines starting with # are ignored.
export function parseEnv(text) {
  const env = {};
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const idx = line.indexOf("=");
    const key = idx === -1 ? line : line.slice(0, idx).trim();
    if (idx === -1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`Environment line ${i + 1}: use KEY=VALUE (letters, digits, underscore).`);
      return;
    }
    env[key] = line.slice(idx + 1).trim();
  });
  return { env, errors };
}

export const formatError = (prefix, err) => {
  const msg = err?.message || "Unknown error.";
  return /^Unable to/i.test(msg) ? msg : `${prefix}\n${msg}`;
};