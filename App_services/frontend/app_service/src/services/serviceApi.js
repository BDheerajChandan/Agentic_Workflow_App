// src/services/serviceApi.js
// Thin client for the DJ Services backend. The browser never talks to Docker: only these fixed endpoints.

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8010").replace(/\/+$/, "");
const TOKEN_KEY = "dj_services_admin_token";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "error", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const getToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
};

export const setToken = (token) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
};

async function request(path, { method = "GET", body, timeout = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["X-Admin-Token"] = token;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw new ApiError("The request timed out.", { code: "timeout" });
    throw new ApiError(`Cannot reach the DJ Services API at ${API_BASE}. Is the backend running?`, { code: "network" });
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try { payload = await res.json(); } catch { /* not JSON */ }

  if (!res.ok || payload?.success === false) {
    const err = payload?.error || {};
    throw new ApiError(
      err.message || payload?.message || `Request failed (HTTP ${res.status}).`,
      {
        status: res.status,
        code: res.status === 401 ? "unauthorized" : err.code || "error",
        details: err.details || null,
      }
    );
  }
  return payload;
}

const enc = encodeURIComponent;
const LONG = 90000; // lifecycle calls may wait while the container starts

// ── services ────────────────────────────────────────────────────────────────
export const listServices = (refresh = false) => request(`/api/services${refresh ? "?refresh=true" : ""}`);
export const registerService = (body) => request("/api/services", { method: "POST", body, timeout: 30000 });
export const updateService = (id, body) => request(`/api/services/${enc(id)}`, { method: "PUT", body, timeout: 30000 });
export const deleteService = (id, { removeContainer = true, volumes = false, force = false } = {}) =>
  request(
    `/api/services/${enc(id)}?remove_container=${removeContainer}&volumes=${volumes}&force=${force}`,
    { method: "DELETE", timeout: 60000 }
  );

export const startService = (id) => request(`/api/services/${enc(id)}/start`, { method: "POST", timeout: LONG });
export const stopService = (id) => request(`/api/services/${enc(id)}/stop`, { method: "POST", timeout: LONG });
export const restartService = (id) => request(`/api/services/${enc(id)}/restart`, { method: "POST", timeout: LONG });
export const removeContainer = (id, volumes = false) =>
  request(`/api/services/${enc(id)}/remove-container?volumes=${volumes}`, { method: "POST", timeout: 60000 });

export const getDetails = (id) => request(`/api/services/${enc(id)}/details`);
export const getLogs = (id, tail = 200) => request(`/api/services/${enc(id)}/logs?tail=${tail}`, { timeout: 30000 });

// ── global controls / jobs ──────────────────────────────────────────────────
export const startAll = () => request("/api/services/start-all", { method: "POST", timeout: 30000 });
export const stopAll = () => request("/api/services/stop-all", { method: "POST", timeout: 30000 });
export const getJob = (jobId) => request(`/api/jobs/${enc(jobId)}`);

// ── projects ────────────────────────────────────────────────────────────────
export const listProjects = () => request("/api/projects");
export const createProject = (body) => request("/api/projects", { method: "POST", body });

// ── docker / ports ──────────────────────────────────────────────────────────
export const getDockerStatus = () => request("/api/docker/status");
export const checkPort = (port, serviceId) =>
  request(`/api/health/ports/${enc(port)}${serviceId ? `?service_id=${enc(serviceId)}` : ""}`);