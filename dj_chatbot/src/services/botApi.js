// src/services/botApi.js
// Thin client for the lclg_project backend (source of truth for bots, sessions, messages).

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";
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

export const sendChat = (botId, sessionId, message, files = []) =>
  request(
    `/bots/${encodeURIComponent(botId)}/sessions/${encodeURIComponent(sessionId)}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ message, files: files.map((f) => ({ file_id: f.file_id })) }),
    }
  );

export const submitInteraction = (botId, sessionId, pauseId, payload) =>
  request(
    `/bots/${encodeURIComponent(botId)}/sessions/${encodeURIComponent(sessionId)}/interactions/${pauseId}/submit`,
    { method: "POST", body: JSON.stringify(payload) }
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


export const deleteSession = (botId, sessionId) =>
  request(
    `/bots/${encodeURIComponent(botId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );

export const deleteSessions = (botId, sessionIds) =>
  request(`/bots/${encodeURIComponent(botId)}/sessions/delete`, {
    method: "POST",
    body: JSON.stringify({ session_ids: sessionIds }),
  });

export const deleteAllSessions = (botId) =>
  request(`/bots/${encodeURIComponent(botId)}/sessions`, { method: "DELETE" });

export const getBotDocumentation = (botId) =>
  request(`/bots/${encodeURIComponent(botId)}/documentation`);

const STREAM_IDLE_MS = 90000;

// Live SSE chat. Events are delivered through onEvent. Throws BotError with kind:
// "unsupported" (endpoint missing), "aborted" (user stopped), "timeout", "connection", "backend", "not_found".
export async function streamChat(botId, sessionId, message, files = [], { onEvent, signal, retry = false } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  let idle = null;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { timedOut = true; controller.abort(); }, STREAM_IDLE_MS);
  };
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    arm();
    const res = await fetch(
      `${API_BASE}/bots/${encodeURIComponent(botId)}/sessions/${encodeURIComponent(sessionId)}/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message, retry, files: files.map((f) => ({ file_id: f.file_id })) }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.detail || ""; } catch { /* ignore */ }
      if (res.status === 405 || (res.status === 404 && detail === "Not Found")) {
        throw new BotError("unsupported", "Streaming is not available.");
      }
      if (res.status === 404) throw new BotError("not_found", detail || "Not found.");
      throw new BotError("backend", detail || "The server returned an error. Please try again.");
    }
    if (!res.body) throw new BotError("unsupported", "Streaming is not supported by this browser.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = raw.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }
        onEvent?.(evt);
      }
    }
  } catch (err) {
    if (err instanceof BotError) throw err;
    if (err?.name === "AbortError") {
      throw timedOut
        ? new BotError("timeout", "The response stalled and was stopped. Please try again.")
        : new BotError("aborted", "Generation stopped.");
    }
    throw new BotError("connection", "Could not reach the server. Check that the backend is running.");
  } finally {
    clearTimeout(idle);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}