// src/utils/bulkExport.js
// Workflow ZIP exports. Every ZIP entry is the existing single-flow export (importable as-is),
// plus a top-level "metadata" block that the importer ignores.

import { listFlows, listGroups, getFlow } from "../services/api";
import { buildExport } from "./flowTransfer";
import { downloadBlob } from "./download";
import { buildZip } from "./zip";

export const STANDALONE_FOLDER = "Standalone_Workflows";
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

export function safeName(value, fallback = "item") {
  let s = String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80)
    .replace(/[._]+$/g, "");
  if (!s || s === "." || s === "..") s = fallback;
  if (RESERVED.test(s)) s = `${s}_`;
  return s;
}

function uniqueName(base, used, suffix = "") {
  let name = base;
  let n = 2;
  while (used.has(`${name}${suffix}`.toLowerCase())) name = `${base}_${n++}`;
  used.add(`${name}${suffix}`.toLowerCase());
  return `${name}${suffix}`;
}

// Group folders: readable names; identical / reserved names get the group id appended.
function folderNames(groups) {
  const counts = new Map();
  const bases = groups.map((g) => {
    const b = safeName(g.name, "Group");
    counts.set(b.toLowerCase(), (counts.get(b.toLowerCase()) || 0) + 1);
    return b;
  });
  const used = new Set([STANDALONE_FOLDER.toLowerCase()]);
  const out = new Map();
  groups.forEach((g, i) => {
    const b = bases[i];
    const clash = counts.get(b.toLowerCase()) > 1 || b.toLowerCase() === STANDALONE_FOLDER.toLowerCase();
    const base = clash ? `${b}_${String(g.group_id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}` : b;
    out.set(g.group_id, uniqueName(base, used));
  });
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function readFlow(summary, groupName) {
  try {
    const full = await getFlow(summary.id);
    const doc = await buildExport({
      flowName: full.name,
      input: full.input_value,
      nodes: full.nodes,
      edges: full.edges,
      flowId: full.id,
    });
    return {
      name: full.name,
      doc: {
        ...doc,
        metadata: {
          flow_id: full.id,
          route_slug: full.route_slug ?? null,
          group_id: full.group_id ?? null,
          group_name: groupName ?? null,
          created_at: full.created_at ?? null,
          updated_at: full.updated_at ?? null,
          execution_count: full.execution_count ?? 0,
        },
      },
    };
  } catch (err) {
    const msg = err?.response?.data?.detail || err?.message || "unknown error";
    throw new Error(`could not read workflow "${summary.name}" (id ${summary.id}): ${msg}`);
  }
}

// scope: { type: "all" } | { type: "group", groupId }
export async function exportWorkflowsZip(scope) {
  const [{ flows }, { groups }] = await Promise.all([listFlows(), listGroups()]);

  const byId = new Map();
  flows.forEach((f) => byId.set(f.id, f));
  const all = [...byId.values()];
  const groupById = new Map(groups.map((g) => [g.group_id, g]));

  const buckets = []; // [{ folder, groupName, flows }]
  let zipName;

  if (scope?.type === "group") {
    const group = groupById.get(scope.groupId);
    if (!group) throw new Error("group not found.");
    const folder = safeName(group.name, "Group");
    buckets.push({ folder, groupName: group.name, flows: all.filter((f) => f.group_id === group.group_id) });
    zipName = `${folder}_Workflows.zip`;
  } else {
    buckets.push({
      folder: STANDALONE_FOLDER,
      groupName: null,
      flows: all.filter((f) => !f.group_id || !groupById.has(f.group_id)),
    });
    const names = folderNames(groups);
    groups.forEach((g) => {
      buckets.push({
        folder: names.get(g.group_id),
        groupName: g.name,
        flows: all.filter((f) => f.group_id === g.group_id),
      });
    });
    zipName = "All_Workflows.zip";
  }

  const files = [];
  let workflowCount = 0;

  for (const b of buckets) {
    files.push({ name: `${b.folder}/`, data: new Uint8Array(0) });
    const used = new Set();
    const read = await mapLimit(b.flows, 4, (f) => readFlow(f, b.groupName));
    read.forEach((r) => {
      const file = uniqueName(safeName(r.name, "workflow"), used, ".json");
      files.push({ name: `${b.folder}/${file}`, data: JSON.stringify(r.doc, null, 2) });
      workflowCount += 1;
    });
  }

  downloadBlob(zipName, buildZip(files));
  return { zipName, workflowCount, folders: buckets.map((b) => b.folder) };
}