// src/utils/flowTransfer.js
// Portable flow export/import (format v2). v1 files are normalised on import.
// Secrets (api_key) are never exported. Uploaded files are exported as references only.

import { listVariables, createVariable, BASE_URL } from "../services/api";
import { nodeTypes } from "../registry/node_registration";

export const FLOW_FORMAT = "langgraph-flow";
export const FLOW_VERSION = 2;
const SUPPORTED_VERSIONS = [1, 2];
const SECRET_KEYS = ["api_key"];
const HITL_FEATURES = ["approval", "suggestion", "questions"];

const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

const stripSecrets = (data) => {
  const d = clone(data);
  SECRET_KEYS.forEach((k) => { if (k in d) d[k] = ""; });
  return d;
};

const fileRef = (f) => ({
  file_id: f.file_id,
  file_name: f.file_name,
  file_type: f.file_type,
  size_bytes: f.size_bytes,
});

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
  const fileRefs = new Map();

  const exportedNodes = nodes.map((n) => {
    variableIds(n.data).forEach((i) => used.add(i));
    const data = stripSecrets(n.data);
    if (Array.isArray(data.files)) {
      data.files = data.files.filter((f) => f?.file_id).map(fileRef);
      data.files.forEach((f) => fileRefs.set(f.file_id, f));
    }
    return { id: n.id, type: n.type, position: n.position, data };
  });

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
      nodes: exportedNodes,
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    },
    variables,
    file_references: [...fileRefs.values()],
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
  if (!SUPPORTED_VERSIONS.includes(doc.version)) {
    throw new Error(
      `Unsupported export version: ${doc.version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}.`
    );
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
    if (n.type === "hitl" && n.data?.feature && !HITL_FEATURES.includes(n.data.feature)) {
      errors.push(`${tag} (${n.id}): unsupported HITL feature '${n.data.feature}'.`);
    }
    if (n.type === "hitl" && n.data?.questions) {
      const q = n.data.questions;
      if (q.questions !== undefined && !Array.isArray(q.questions)) {
        errors.push(`${tag} (${n.id}): HITL questions must be a list.`);
      }
      if (q.file_questions !== undefined && !Array.isArray(q.file_questions)) {
        errors.push(`${tag} (${n.id}): HITL file questions must be a list.`);
      }
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
    version: doc.version,
    name: String(flow.name || "Imported Flow"),
    input_value: flow.input_value ?? "",
    nodes: flow.nodes,
    edges: flow.edges,
    variables: vars,
  };
}

// ─── Import: resolve variables + file references, return canvas-ready data ───
async function fileExists(fileId) {
  try {
    const res = await fetch(`${BASE_URL}/files/${encodeURIComponent(fileId)}`);
    return res.ok;
  } catch {
    return false;
  }
}

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

  const warnings = [];
  const nodes = [];
  for (const n of payload.nodes) {
    const data = remapVariables(n.data, map);
    if (Array.isArray(data.files) && data.files.length) {
      const kept = [];
      for (const f of data.files) {
        if (f?.file_id && (await fileExists(f.file_id))) kept.push(f);
        else warnings.push(`'${f?.file_name || f?.file_id}' (node ${n.id}) is not available on this server and was removed.`);
      }
      data.files = kept;
    }
    nodes.push({ ...n, position: n.position || { x: 100, y: 100 }, data });
  }

  return {
    name: payload.name,
    input_value: payload.input_value,
    nodes,
    edges: payload.edges.map((e, i) => ({
      ...e,
      id: e.id || `edge_${e.source}_${e.target}_${i}`,
    })),
    warnings,
  };
}