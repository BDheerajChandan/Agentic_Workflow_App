// src/registry/settings/VariableInput.jsx
// Shared variable selector: text input + grouped picker of node outputs and runtime variables.
// Inserts {{ref}} using stable node ids; AKA is shown only as a label.

import React, { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "reactflow";
import { getNodeIO, listVariables, resolveNodeIO } from "../../services/api";
import { fieldWrap, lbl, inp, miniBtn, sectionNote } from "./styles";

let ioPromise = null;
const loadIO = () => {
  if (!ioPromise) {
    ioPromise = getNodeIO().catch((e) => {
      ioPromise = null;
      throw e;
    });
  }
  return ioPromise;
};

const itemBtn = {
  display: "flex", justifyContent: "space-between", gap: 8, width: "100%",
  padding: "5px 8px", border: "none", background: "transparent",
  color: "#cbd5e1", fontSize: 11, textAlign: "left", cursor: "pointer",
  fontFamily: "inherit", borderRadius: 6,
};

export default function VariableInput({
  label, value, onChange, placeholder = "", nodeId, flowId, variablesVersion,
  mode = "replace", multiline = false, rows = 3,
  only, // optional: "variables" | "nodes" limits the picker
}) {
  const { getNodes } = useReactFlow();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [io, setIo] = useState(null);
    const [vars, setVars] = useState([]);
  const [dyn, setDyn] = useState({});

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
        loadIO()
      .then(async (d) => {
        if (cancelled) return;
        setIo(d);
        const dynNodes = getNodes().filter((n) => (d.dynamic || []).includes(n.type));
        const pairs = await Promise.all(
          dynNodes.map((n) => resolveNodeIO(n.type, n.data).then((r) => [n.id, r]).catch(() => null))
        );
        if (!cancelled) setDyn(Object.fromEntries(pairs.filter(Boolean)));
      })
      .catch(() => {});
    listVariables(flowId)
      .then((d) => { if (!cancelled) setVars(d.variables || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, flowId, variablesVersion]);

  const groups = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const out = [];

    getNodes()
      .filter((n) => only !== "variables" && n.id !== nodeId)
      .forEach((n) => {
        const def = dyn[n.id] || (io ? io.nodes[n.type] || io.default : null);
        const name = (n.data?.aka || "").trim() || n.type;
        const items = [{ ref: `{{${n.id}}}`, label: "Primary value" }];
        (def?.outputs || []).forEach((o) =>
          items.push({ ref: `{{${n.id}.${o.key}}}`, label: o.label })
        );
        out.push({ title: `${name} · ${n.id}`, items });
      });

    if (vars.length && only !== "nodes") {
      out.push({
        title: "Variables",
        items: vars.map((v) => ({ ref: `{{${v.name}}}`, label: `${v.name} (${v.visibility})` })),
      });
    }

    return out
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) => !q || `${g.title} ${i.label} ${i.ref}`.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length);
  }, [open, io, vars, dyn, query, nodeId, only]); // eslint-disable-line

  const insert = (ref) => {
    const current = value ?? "";
    onChange(mode === "append" && String(current).trim() ? `${current} ${ref}` : ref);
    setOpen(false);
    setQuery("");
  };

  const Control = multiline ? "textarea" : "input";

  return (
    <div style={fieldWrap}>
      {label && <label style={lbl}>{label}</label>}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <Control
          value={value ?? ""}
          placeholder={placeholder}
          rows={multiline ? rows : undefined}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inp, flex: 1, ...(multiline ? { resize: "vertical", lineHeight: 1.5 } : {}) }}
        />
        <button
          type="button"
          style={{ ...miniBtn, padding: "8px 10px" }}
          title="Insert variable"
          onClick={() => setOpen((o) => !o)}
        >
          {"{ }"}
        </button>
      </div>

      {open && (
        <div
          style={{
            marginTop: 6, border: "1px solid #1e293b", borderRadius: 8,
            background: "#0f172a", padding: 6,
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search variables…"
            style={{ ...inp, marginBottom: 6 }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {groups.length === 0 && <div style={{ ...sectionNote, marginBottom: 0 }}>No variables found.</div>}
            {groups.map((g) => (
              <div key={g.title} style={{ marginBottom: 6 }}>
                <div style={{ ...lbl, margin: "4px 4px 2px", color: "#6366f1" }}>{g.title}</div>
                {g.items.map((i) => (
                  <button key={i.ref} type="button" style={itemBtn} onClick={() => insert(i.ref)}>
                    <span>{i.label}</span>
                    <span style={{ color: "#64748b" }}>{i.ref}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div style={{ ...sectionNote, margin: "6px 0 0" }}>
            Append a path for nested values, e.g. {"{{node_1.output.age}}"} or {"{{node_4.results[0].url}}"}.
          </div>
        </div>
      )}
    </div>
  );
}