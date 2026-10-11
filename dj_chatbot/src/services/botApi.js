// src/services/botApi.js
// Thin client for the lclg_project backend (source of truth for bots, sessions, messages).

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";
const TIMEOUT_MS = 120000;

export class BotError extends Error {
  constructor(kind, userMessage) {
    super(userMessage);
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json())?.detail || "";
      } catch {
        /* ignore */
      }
      if (res.status === 404) {
        throw new BotError("not_found", detail || "Not found.");
      }
      throw new BotError("backend", detail || "The server returned an error. Please try again.");
    }

    try {
      return await res.json();
    } catch {
      throw new BotError("invalid_response", "The server returned an invalid response.");
    }
  } catch (err) {
    if (err instanceof BotError) throw err;
    if (err?.name === "AbortError") {
      throw new BotError("timeout", "The workflow took too long to respond. Please try again.");
    }
    throw new BotError(
      "connection",
      "Could not reach the server. Check that the backend is running."
    );
  } finally {
    clearTimeout(timer);
  }
}

export const listBots = () => request("/bots");

export const getBot = (botId) => request(`/bots/${encodeURIComponent(botId)}`);

export const renameBot = (botId, name) =>
  request(`/bots/${encodeURIComponent(botId)}/rename`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const listSessions = (botId) =>
  request(`/bots/${encodeURIComponent(botId)}/sessions`);

export const createSession = (botId) =>
  request(`/bots/${encodeURIComponent(botId)}/sessions`, { method: "POST" });

export const getMessages = (botId, sessionId) =>
  request(
    `/bots/${encodeURIComponent(botId)}/sessions/${encodeURIComponent(sessionId)}/messages`
  );

export const sendChat = (botId, sessionId, message) =>
  request(
    `/bots/${encodeURIComponent(botId)}/sessions/${encodeURIComponent(sessionId)}/chat`,
    { method: "POST", body: JSON.stringify({ message }) }
  );


// add alongside the existing exports

export const listWorkflows = () => request("/bots/workflows");

export const createBot = (name, flow_id) =>
  request("/bots", {
    method: "POST",
    body: JSON.stringify({ name, flow_id }),
  });

export const updateBot = (botId, payload) =>
  request(`/bots/${encodeURIComponent(botId)}`, {
    method: "PUT",
    body: JSON.stringify(payload), // { name?, flow_id? }
  });