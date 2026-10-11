// src/services/flowApi.js
// Talks to the existing Flow application. The Flow URL comes from the Bot.
//
// Accepted Flow URL formats:
//   http://localhost:5173/flow/<slug>          (editor URL; API base = VITE_FLOW_API_URL)
//   http://localhost:8001/flows/route/<slug>   (API URL; API base = that origin)
//
// Optional .env:  VITE_FLOW_API_URL=http://localhost:8001

const DEFAULT_API_BASE = import.meta.env.VITE_FLOW_API_URL || "http://localhost:8001";
const TIMEOUT_MS = 120000;

export class FlowError extends Error {
  constructor(kind, userMessage) {
    super(userMessage);
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

export function parseFlowUrl(flowUrl) {
  let url;
  try {
    url = new URL(String(flowUrl || "").trim());
  } catch {
    throw new FlowError("invalid_url", "The Flow URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FlowError("invalid_url", "The Flow URL is invalid.");
  }

  const parts = url.pathname.split("/").filter(Boolean);

  const flowIdx = parts.indexOf("flow");
  if (flowIdx !== -1 && parts[flowIdx + 1]) {
    return { apiBase: DEFAULT_API_BASE, slug: parts[flowIdx + 1] };
  }

  if (parts[0] === "flows" && parts[1] === "route" && parts[2]) {
    return { apiBase: url.origin, slug: parts[2] };
  }

  throw new FlowError("invalid_url", "The Flow URL is invalid.");
}

export function isValidFlowUrl(flowUrl) {
  try {
    parseFlowUrl(flowUrl);
    return true;
  } catch {
    return false;
  }
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });

    if (res.status === 404) {
      throw new FlowError("not_found", "Flow not found. Please check the Flow URL.");
    }
    if (!res.ok) {
      throw new FlowError("backend", "The workflow returned an error. Please try again.");
    }

    try {
      return await res.json();
    } catch {
      throw new FlowError("invalid_response", "The workflow returned an invalid response.");
    }
  } catch (err) {
    if (err instanceof FlowError) throw err;
    if (err?.name === "AbortError") {
      throw new FlowError("timeout", "The workflow took too long to respond. Please try again.");
    }
    throw new FlowError(
      "connection",
      "Could not reach the workflow. Check the Flow URL and that the server is running."
    );
  } finally {
    clearTimeout(timer);
  }
}

function toText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if (typeof value.answer === "string") return value.answer.trim();
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function extractReply(result) {
  if (!result || typeof result !== "object") return toText(result);
  return (
    toText(result.final_output) ||
    toText(result.answer) ||
    toText(result.current_value)
  );
}

export async function sendToFlow({ flowUrl, message, sessionId }) {
  const { apiBase, slug } = parseFlowUrl(flowUrl);

  const flow = await request(`${apiBase}/flows/route/${encodeURIComponent(slug)}`);

  const data = await request(`${apiBase}/graph/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodes: flow.nodes,
      edges: flow.edges,
      input: message,
      flow_id: flow.id,
      session_id: sessionId,
    }),
  });

  const reply = extractReply(data?.result);
  if (!reply) {
    throw new FlowError("empty", "The workflow returned an empty response.");
  }
  return reply;
}