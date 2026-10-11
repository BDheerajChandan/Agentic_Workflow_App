// src/services/api.ts

import axios from "axios";
import { GraphPayload } from "../types/graph";

const BASE_URL = "http://localhost:8001";

// ─── Graph execution ──────────────────────────────────────────────────────────

export const runGraph = async (payload: GraphPayload & { flow_id?: number | null }) => {
  const res = await axios.post(`${BASE_URL}/graph/run`, payload);
  console.log("res :", res.data);
  return res.data;
};

export const runGraphStream = async (
  payload: GraphPayload & { flow_id?: number | null },
  onEvent: (evt: any) => void
) => {
  const res = await fetch(`${BASE_URL}/graph/run-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.body) throw new Error("Streaming not supported by this browser.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = rawEvent.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6));
      onEvent(evt);
      if (evt.type === "result") finalResult = evt.result;
      if (evt.type === "error") throw new Error(evt.message);
    }
  }

  return finalResult;
};

// ─── Flow CRUD ────────────────────────────────────────────────────────────────

export interface SaveFlowPayload {
  flow_id?: number | null;
  name: string;
  nodes: any[];
  edges: any[];
  input_value?: string;
}

export const createFlow = async (name = "Untitled Flow") => {
  const res = await axios.post(`${BASE_URL}/flows/create`, { name });
  return res.data as { flow_id: number; route_slug: string };
};

export const saveFlow = async (payload: SaveFlowPayload) => {
  const res = await axios.post(`${BASE_URL}/flows/save`, payload);
  return res.data as { flow_id: number; message: string };
};

export const listFlows = async () => {
  const res = await axios.get(`${BASE_URL}/flows/list`);
  return res.data as { flows: FlowSummary[] };
};

export const getFlow = async (flowId: number) => {
  const res = await axios.get(`${BASE_URL}/flows/${flowId}`);
  return res.data as FlowDetail;
};

export const getFlowByRoute = async (routeSlug: string) => {
  const res = await axios.get(`${BASE_URL}/flows/route/${routeSlug}`);
  return res.data as FlowDetail;
};

export const getExecutions = async (flowId: number) => {
  const res = await axios.get(`${BASE_URL}/flows/${flowId}/executions`);
  return res.data as { executions: Execution[] };
};

export const deleteFlow = async (flowId: number) => {
  const res = await axios.delete(`${BASE_URL}/flows/${flowId}`);
  return res.data;
};

// ─── Local file browser ───────────────────────────────────────────────────────

export interface BrowseResponse {
  path: string;
  type: "file" | "directory" | "not_found" | "multi";
  files: string[];
  supported: string[];
  extensions: string[];
}

export const browseLocalPath = async (path: string): Promise<BrowseResponse> => {
  const res = await axios.post(`${BASE_URL}/local-files/browse`, { path });
  return res.data;
};

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface FlowSummary {
  id: number;
  name: string;
  route_slug: string;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowDetail {
  id: number;
  name: string;
  route_slug: string;
  nodes: any[];
  edges: any[];
  input_value: string;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Execution {
  id: number;
  flow_id: number;
  input: string;
  result: any;
  executed_at: string;
}

// ─── Bots ─────────────────────────────────────────────────────────────────────

export interface Bot {
  bot_id: string;
  name: string;
  flow_id: number;
  workflow_name: string;
  workflow_url: string;
  workflow_endpoint: string;
  bot_endpoint: string;
  bot_url: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_chat_at: string | null;
}

export interface BotWorkflow {
  workflow_id: number;
  workflow_name: string;
  route_slug: string;
  workflow_url: string;
  workflow_endpoint: string;
}

export const listBotWorkflows = async () => {
  const res = await axios.get(`${BASE_URL}/bots/workflows`);
  return res.data as { workflows: BotWorkflow[] };
};

export const createBot = async (name: string, flow_id: number) => {
  const res = await axios.post(`${BASE_URL}/bots`, { name, flow_id });
  return res.data as Bot;
};

export const listBots = async () => {
  const res = await axios.get(`${BASE_URL}/bots`);
  return res.data as { bots: Bot[] };
};

export const renameBot = async (botId: string, name: string) => {
  const res = await axios.patch(`${BASE_URL}/bots/${botId}/rename`, { name });
  return res.data as Bot;
};

export const deleteBot = async (botId: string) => {
  const res = await axios.delete(`${BASE_URL}/bots/${botId}`);
  return res.data;
};