// src/utils/ifElseMigration.js
// If-Else has exactly "true" / "false" handles. Legacy Default data is preserved, never converted.
// Idempotent: running it again changes nothing.

const VALID = new Set(["true", "false"]);

export function migrateLegacyIfElse(nodes, edges) {
  const ids = new Set(nodes.filter((n) => n.type === "if_else").map((n) => n.id));
  if (!ids.size) return { nodes, edges, warnings: [] };

  const kept = [];
  const legacy = {};
  edges.forEach((e) => {
    if (ids.has(e.source) && !VALID.has(e.sourceHandle)) {
      (legacy[e.source] = legacy[e.source] || []).push({
        id: e.id, target: e.target, sourceHandle: e.sourceHandle ?? null,
      });
    } else {
      kept.push(e);
    }
  });

  const warnings = [];
  let changed = false;
  const out = nodes.map((n) => {
    if (!ids.has(n.id)) return n;
    const data = n.data || {};
    const found = legacy[n.id] || [];
    if (!found.length && data.default === undefined) return n;
    changed = true;

    const { default: legacyCfg, ...rest } = data;
    const prev = data.legacy_default || {};
    const merged = [...(prev.edges || [])];
    found.forEach((f) => {
      if (!merged.some((m) => m.id === f.id)) merged.push(f);
    });
    const next = { ...prev, edges: merged };
    if (legacyCfg !== undefined) next.config = prev.config ?? legacyCfg;

    if (found.length) {
      warnings.push(
        `If-Else ${n.id}: ${found.length} legacy Default connection(s) were removed from the canvas ` +
        "(not converted to True/False). Reconnect the True/False branches, then Save."
      );
    }
    return { ...n, data: { ...rest, legacy_default: next } };
  });

  return { nodes: changed ? out : nodes, edges: kept, warnings };
}