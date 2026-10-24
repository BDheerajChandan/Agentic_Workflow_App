// src/services/api.ts

import axios from "axios";
import { GraphPayload } from "../types/graph";

export const BASE_URL = "http://localhost:8001";

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

// ─── Providers / Models ───────────────────────────────────────────────────────

export type ProviderId = "openai" | "gemini";

export interface ProviderModelsRequest {
  provider: ProviderId;
  mode: "static" | "dynamic";
  purpose: "chat" | "embedding";
  api_key?: string;
}

export const listProviderModels = async (payload: ProviderModelsRequest) => {
  const res = await axios.post(`${BASE_URL}/providers/models`, payload);
  return res.data as { provider: ProviderId; models: string[] };
};

// ─── Variables ────────────────────────────────────────────────────────────────

export interface Variable {
  variable_id: number;
  name: string;
  visibility: "public" | "private";
  flow_id: number | null;
  workflow_name: string | null;
  created_at: string;
  updated_at: string;
}

export const listVariables = async (flowId?: number | null) => {
  const res = await axios.get(`${BASE_URL}/variables`, {
    params: flowId != null ? { flow_id: flowId } : {},
  });
  return res.data as { variables: Variable[] };
};

export const createVariable = async (payload: {
  name: string;
  visibility: "public" | "private";
  flow_id?: number | null;
}) => {
  const res = await axios.post(`${BASE_URL}/variables`, payload);
  return res.data as Variable;
};

export const updateVariable = async (
  variableId: number,
  payload: { name?: string; visibility?: "public" | "private"; flow_id?: number | null }
) => {
  const res = await axios.put(`${BASE_URL}/variables/${variableId}`, payload);
  return res.data as Variable;
};

export const deleteVariable = async (variableId: number) => {
  const res = await axios.delete(`${BASE_URL}/variables/${variableId}`);
  return res.data;
};


// ─── Node input / output definitions (for variable mapping) ──────────────────

export interface NodeIOField {
  key: string;
  label: string;
}

export interface NodeIODef {
  inputs: NodeIOField[];
  outputs: NodeIOField[];
}

export const getNodeIO = async () => {
  const res = await axios.get(`${BASE_URL}/variables/node-io`);
  return res.data as { nodes: Record<string, NodeIODef>; default: NodeIODef };
};



// ─── Run history ──────────────────────────────────────────────────────────────

export interface RunSummary {
  run_id: number;
  run_number: number;
  flow_id: number;
  workflow_name: string;
  status: "passed" | "failed";
  started_at: string;
  ended_at: string;
  duration_ms: number;
  error: string | null;
}

export interface RunDetail extends RunSummary {
  input: string | null;
  result: any;
  node_states: any[];
  variables: Record<string, any>;
}

export const listRuns = async (flowId: number) => {
  const res = await axios.get(`${BASE_URL}/flows/${flowId}/runs`);
  return res.data as { runs: RunSummary[] };
};

export const getRun = async (flowId: number, runId: number) => {
  const res = await axios.get(`${BASE_URL}/flows/${flowId}/runs/${runId}`);
  return res.data as RunDetail;
};


export const deleteRun = async (flowId: number, runId: number) => {
  const res = await axios.delete(`${BASE_URL}/flows/${flowId}/runs/${runId}`);
  return res.data;
};

export const deleteAllRuns = async (flowId: number) => {
  const res = await axios.delete(`${BASE_URL}/flows/${flowId}/runs`);
  return res.data as { message: string; deleted: number };
};

// ─── Type Converter (advanced) ────────────────────────────────────────────────

export interface ConverterMeta {
  types: string[];
  conversions: string[];
  methods: Record<string, string[]>;
}

export const getConverterMeta = async () => {
  const res = await axios.get(`${BASE_URL}/converter/meta`);
  return res.data as ConverterMeta;
};

export const detectConverterType = async (value: string) => {
  const res = await axios.post(`${BASE_URL}/converter/detect`, { value });
  return res.data as { type: string };
};

// ─── Time Operation ───────────────────────────────────────────────────────────

export const signalTimeOperation = async (payload: {
  flow_id: number | null;
  node_id: string;
  action: "resume" | "cancel";
}) => {
  const res = await axios.post(`${BASE_URL}/time-operation/signal`, payload);
  return res.data as { message: string; affected: number };
};


// ─── Python file upload ───────────────────────────────────────────────────────

export interface PythonFileInfo {
  file_name: string;
  code: string;
  size: number;
  lines: number;
}

export const validatePythonFile = async (file_name: string, content: string) => {
  const res = await axios.post(`${BASE_URL}/python-files/validate`, { file_name, content });
  return res.data as PythonFileInfo;
};

// ─── Time Operation: durable pauses ───────────────────────────────────────────

export interface TimePause {
  pause_id: number;
  flow_id: number;
  node_id: string;
  operation: string;
  status: string;
  resume_at: string | null;
  hold_expires_at: string | null;
  on_timeout: string;
  created_at: string;
}

export const listTimePauses = async (flowId: number, nodeId?: string) => {
  const res = await axios.get(`${BASE_URL}/time-operation/pauses`, {
    params: nodeId ? { flow_id: flowId, node_id: nodeId } : { flow_id: flowId },
  });
  return res.data as { pauses: TimePause[] };
};

export const resumeTimePause = async (pauseId: number) => {
  const res = await axios.post(`${BASE_URL}/time-operation/pauses/${pauseId}/resume`);
  return res.data as { message: string };
};

export const cancelTimePause = async (pauseId: number) => {
  const res = await axios.post(`${BASE_URL}/time-operation/pauses/${pauseId}/cancel`);
  return res.data as { message: string };
};

// ─── HITL ─────────────────────────────────────────────────────────────────────

export const validateQuestionsFile = async (file_name: string, content: string) => {
  const res = await axios.post(`${BASE_URL}/hitl/questions/validate`, { file_name, content });
  return res.data as { file_name: string; questions: any[]; count: number };
};

export const normalizeHitlQuestion = async (question: Record<string, any>) => {
  const res = await axios.post(`${BASE_URL}/hitl/questions/normalize`, { question });
  return res.data as { question: any };
};

export const submitHitl = async (
  pauseId: number,
  payload: { response?: Record<string, any>; cancelled?: boolean }
) => {
  const res = await axios.post(`${BASE_URL}/hitl/pauses/${pauseId}/submit`, payload);
  return res.data as { result?: any; error?: string | null; paused?: boolean; display?: any; cancelled?: boolean; message?: string };
};