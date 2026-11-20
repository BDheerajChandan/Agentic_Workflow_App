// src/utils/conditionText.js

export const describeCondition = (c) => {
  if ((c.operator || "") === "custom") {
    const t = c.expression_type && c.expression_type !== "auto" ? `[${c.expression_type}] ` : "";
    return `${t}${(c.expression || "").trim() || "(empty expression)"}`;
  }
  const right = c.right === undefined || c.right === null || c.right === "" ? '""' : c.right;
  return `${(c.left || "").trim() || "…"} ${c.operator || "=="} ${right}`;
};

export const conditionsSummary = (conds) =>
  (conds || [])
    .map((c, i) => {
      const body = describeCondition(c);
      return i < conds.length - 1 ? `${body}\n${c.logic || "AND"}` : body;
    })
    .join("\n");