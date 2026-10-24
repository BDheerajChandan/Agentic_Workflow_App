// src/utils/flowTransfer.js
// Portable flow export/import. Uses the existing flow data model (nodes, edges, input, variables).
// Secrets (api_key) are never exported.

import { listVariables, createVariable } from "../services/api";
import { nodeTypes } from "../registry/node_registration";

export const FLOW_FORMAT = "langgraph-flow";
export const FLOW_VERSION = 1;
const SECRET_KEYS = ["api_key"];

const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

const stripSecrets = (data) => {
  const d = clone(data);
  SECRET_KEYS.forEach((k) => { if (k in d) d[k] = ""; });
  return d;
};

// ─── Variable id discovery / remapping ───────────────────────────────────────
function variableIds(data) {
  const ids = new Set();
  const add = (x) => { if (x != null && x !== "" && !Number.isNaN(Number(x))) ids.add(Number(x)); };
  const v = data?.variable;
  if (v) {
    add(v.variable_id);
    add(v.input_mapping?.variable_id);
    add(v.output_mapping?.variable_id);
    Object.values(v.input_mapping?.bindings || {}).forEach((b) => add(b?.variable_id));
    Object.keys(v.output_mapping?.bindings || {}).forEach(add);
  }
  (data?.display?.variable_ids || []).forEach(add);
  return ids;
}

function remapVariables(data, map) {
  const m = (id) => (id == null || id === "" ? id : map.get(Number(id)) ?? id);
  const d = clone(data);
  const v = d.variable;
  if (v) {
    if (v.variable_id != null) v.variable_id = m(v.variable_id);
    const im = v.input_mapping;
    if (im) {
      if (im.variable_id != null) im.variable_id = m(im.variable_id);
      Object.values(im.bindings || {}).forEach((b) => {
        if (b && b.variable_id != null) b.variable_id = m(b.variable_id);
      });
    }
    const om = v.output_mapping;
    if (om) {
      if (om.variable_id != null) om.variable_id = m(om.variable_id);
      if (om.bindings) {
        const nb = {};
        Object.entries(om.bindings).forEach(([k, b]) => { nb[k === "" ? "" : String(m(k))] = b; });
        om.bindings = nb;
      }
      if (Array.isArray(om.order)) om.order = om.order.map((k) => (k === "" ? "" : String(m(k))));
    }
  }
  if (Array.isArray(d.display?.variable_ids)) d.display.variable_ids = d.display.variable_ids.map(m);
  return d;
}

// ─── Export ──────────────────────────────────────────────────────────────────
export async function buildExport({ flowName, input, nodes, edges, flowId }) {
  const used = new Set();
  nodes.forEach((n) => variableIds(n.data).forEach((i) => used.add(i)));

  let variables = [];
  if (flowId != null && used.size) {
    const { variables: defs } = await listVariables(flowId);
    variables = defs
      .filter((d) => used.has(d.variable_id))
      .map((d) => ({ id: d.variable_id, name: d.name, visibility: d.visibility }));
  }

  return {
    format: FLOW_FORMAT,
    version: FLOW_VERSION,
    exported_at: new Date().toISOString(),
    flow: {
      name: flowName,
      input_value: input ?? "",
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: stripSecrets(n.data),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    },
    variables,
  };
}

// ─── Import: validate (no side effects) ──────────────────────────────────────
export function parseImport(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`Malformed JSON: ${e.message}`);
  }
  if (!doc || typeof doc !== "object" || doc.format !== FLOW_FORMAT) {
    throw new Error("Not a LangGraph flow export file.");
  }
  if (!Number.isInteger(doc.version) || doc.version < 1 || doc.version > FLOW_VERSION) {
    throw new Error(`Unsupported export version: ${doc.version}.`);
  }
  const flow = doc.flow;
  if (!flow || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    throw new Error("Invalid file: 'flow.nodes' and 'flow.edges' must be lists.");
  }

  const errors = [];
  const ids = new Set();
  flow.nodes.forEach((n, i) => {
    const tag = `Node ${i + 1}`;
    if (!n || typeof n.id !== "string" || !n.id) return errors.push(`${tag}: missing id.`);
    if (ids.has(n.id)) errors.push(`${tag}: duplicate id '${n.id}'.`);
    ids.add(n.id);
    if (!nodeTypes[n.type]) errors.push(`${tag} (${n.id}): unsupported node type '${n.type}'.`);
    if (n.data !== undefined && (typeof n.data !== "object" || n.data === null || Array.isArray(n.data))) {
      errors.push(`${tag} (${n.id}): 'data' must be an object.`);
    }
    if (n.position && (typeof n.position.x !== "number" || typeof n.position.y !== "number")) {
      errors.push(`${tag} (${n.id}): invalid position.`);
    }
  });
  const edgeIds = new Set();
  flow.edges.forEach((e, i) => {
    const tag = `Edge ${i + 1}`;
    if (!e || !ids.has(e.source)) errors.push(`${tag}: source '${e?.source}' does not exist.`);
    else if (!ids.has(e.target)) errors.push(`${tag}: target '${e.target}' does not exist.`);
    if (e?.id) {
      if (edgeIds.has(e.id)) errors.push(`${tag}: duplicate id '${e.id}'.`);
      edgeIds.add(e.id);
    }
  });
  const vars = Array.isArray(doc.variables) ? doc.variables : [];
  vars.forEach((v, i) => {
    if (!v || typeof v.name !== "string" || !["public", "private"].includes(v.visibility)) {
      errors.push(`Variable ${i + 1}: invalid definition.`);
    }
  });
  if (errors.length) {
    const more = errors.length > 8 ? ` (+${errors.length - 8} more)` : "";
    throw new Error(errors.slice(0, 8).join(" | ") + more);
  }

  return {
    name: String(flow.name || "Imported Flow"),
    input_value: flow.input_value ?? "",
    nodes: flow.nodes,
    edges: flow.edges,
    variables: vars,
  };
}

// ─── Import: resolve variables, return canvas-ready nodes/edges ──────────────
export async function prepareImport(payload, flowId) {
  const map = new Map();
  if (payload.variables.length) {
    if (flowId == null) throw new Error("Save the workflow first to import variables.");
    const existing = (await listVariables(flowId)).variables;
    for (const v of payload.variables) {
      const hit = existing.find(
        (e) =>
          e.name === v.name &&
          e.visibility === v.visibility &&
          (v.visibility === "public" || e.flow_id === flowId)
      );
      if (hit) {
        map.set(Number(v.id), hit.variable_id);
      } else {
        const created = await createVariable({
          name: v.name,
          visibility: v.visibility,
          flow_id: v.visibility === "private" ? flowId : null,
        });
        existing.push(created);
        map.set(Number(v.id), created.variable_id);
      }
    }
  }

  return {
    name: payload.name,
    input_value: payload.input_value,
    nodes: payload.nodes.map((n) => ({
      ...n,
      position: n.position || { x: 100, y: 100 },
      data: remapVariables(n.data, map),
    })),
    edges: payload.edges.map((e, i) => ({
      ...e,
      id: e.id || `edge_${e.source}_${e.target}_${i}`,
    })),
  };
}