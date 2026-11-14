// src/utils/caseValue.js
// Typed Switch case values (mirrors backend cast_case_value / values_equal).

const INT = /^[+-]?\d+$/;
const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const bad = (kind, text, error) => ({ kind, key: null, text, error });

export function resolveCase(c) {
  const type = c?.type || "auto";
  const raw = c?.value === undefined || c?.value === null ? "" : String(c.value);
  const s = raw.trim();
  const low = s.toLowerCase();

  if (type === "null") return { kind: "null", key: "null", text: "null", error: "" };

  if (type === "bool") {
    if (low !== "true" && low !== "false") return bad("bool", s || "…", "must be true or false");
    return { kind: "bool", key: `b:${low}`, text: low, error: "" };
  }
  if (type === "int") {
    if (!INT.test(s)) return bad("int", s || "…", "must be a valid integer");
    return { kind: "int", key: `n:${Number(s)}`, text: s, error: "" };
  }
  if (type === "float") {
    if (!NUM.test(s)) return bad("float", s || "…", "must be a valid float");
    return { kind: "float", key: `n:${Number(s)}`, text: s, error: "" };
  }
  if (type === "char") {
    if (raw.length !== 1) return bad("char", `'${raw}'`, "must be exactly one character");
    return { kind: "char", key: `s:${raw}`, text: `'${raw}'`, error: "" };
  }
  if (type === "string") {
    return { kind: "string", key: `s:${raw}`, text: JSON.stringify(raw), error: "" };
  }

  // auto-detect
  if (low === "null" || low === "none") return { kind: "null", key: "null", text: "null", error: "" };
  if (low === "true" || low === "false") return { kind: "bool", key: `b:${low}`, text: low, error: "" };
  if (INT.test(s)) return { kind: "int", key: `n:${Number(s)}`, text: s, error: "" };
  if (NUM.test(s)) return { kind: "float", key: `n:${Number(s)}`, text: s, error: "" };
  if (s.length >= 2 && s[0] === s[s.length - 1] && "\"'".includes(s[0])) {
    const inner = s.slice(1, -1);
    return { kind: "string", key: `s:${inner}`, text: JSON.stringify(inner), error: "" };
  }
  if (!s) return bad("string", "…", "value is required");
  return { kind: "string", key: `s:${raw}`, text: JSON.stringify(raw), error: "" };
}

// [{ index, message }] — invalid values and duplicates (duplicates make routing ambiguous).
export function switchCaseErrors(cases) {
  const out = [];
  const seen = new Map();
  (cases || []).forEach((c, i) => {
    const r = resolveCase(c);
    if (r.error) {
      out.push({ index: i, message: `Case ${i + 1}: value ${r.error}.` });
      return;
    }
    if (seen.has(r.key)) {
      out.push({ index: i, message: `Case ${i + 1}: duplicate of Case ${seen.get(r.key) + 1}.`, duplicate: true });
    } else {
      seen.set(r.key, i);
    }
  });
  return out;
}

export function switchDuplicateErrors(nodes) {
  const out = [];
  (nodes || [])
    .filter((n) => n.type === "switch")
    .forEach((n) => {
      switchCaseErrors(n.data?.cases)
        .filter((e) => e.duplicate)
        .forEach((e) => out.push(`Switch ${n.data?.aka || n.id}: ${e.message}`));
    });
  return out;
}