// src/registry/settings/styles.js

export const panel = {
  position: "absolute",
  top: 0, right: 0,
  width: 300,
  height: "100%",
  background: "#0a0f1e",
  borderLeft: "1px solid #1e293b",
  display: "flex",
  flexDirection: "column",
  zIndex: 900,
  boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
};

export const panelHeader = {
  padding: "16px 16px 12px",
  borderBottom: "1px solid #1e293b",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexShrink: 0,
};

export const panelTitle = {
  fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.04em",
};
export const panelSub = { fontSize: 10, color: "#475569", marginTop: 2 };
export const closeBtn = {
  background: "transparent", border: "none",
  color: "#475569", fontSize: 14, cursor: "pointer", padding: 4,
};

export const panelBody = {
  padding: "16px",
  overflowY: "auto",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export const fieldWrap = { marginBottom: 12 };

export const lbl = {
  display: "block", fontSize: 10, color: "#94a3b8",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em",
};

export const inp = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  background: "#0f172a", color: "#e2e8f0",
  border: "1px solid #1e293b", fontSize: 12,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

export const ddSelect = {
  width: "100%",
  padding: "8px 32px 8px 10px",
  borderRadius: 8,
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #1e293b",
  fontSize: 12,
  cursor: "pointer",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export const ddArrow = {
  position: "absolute",
  right: 10, top: "50%",
  transform: "translateY(-50%)",
  color: "#475569", fontSize: 10,
  pointerEvents: "none", userSelect: "none",
};

export const toggle = { display: "flex", gap: 6, marginTop: 4 };
export const toggleBtn = {
  flex: 1, padding: "6px 0", borderRadius: 7,
  border: "1px solid", fontSize: 11, fontWeight: 600,
  cursor: "pointer", transition: "all 0.15s",
};

export const browseBtnStyle = {
  padding: "8px 10px", borderRadius: 7,
  border: "1px solid #0284c7", background: "#0284c7",
  color: "white", fontSize: 12, cursor: "pointer", flexShrink: 0,
};

export const eyeBtnStyle = {
  padding: "8px 10px", borderRadius: 7,
  border: "1px solid #1e293b", background: "#0f172a",
  color: "#94a3b8", fontSize: 11, cursor: "pointer", flexShrink: 0,
  whiteSpace: "nowrap",
};

export const infoBox = (isErr) => ({
  marginTop: 6, padding: "5px 8px", borderRadius: 6, fontSize: 11,
  background: isErr ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
  border: `1px solid ${isErr ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
  color: isErr ? "#fca5a5" : "#6ee7b7",
});

export const infoStyle = { fontSize: 12, color: "#475569", lineHeight: 1.6 };

export const sectionNote = {
  fontSize: 11, color: "#475569", lineHeight: 1.6,
  marginBottom: 12, padding: "8px 10px",
  background: "rgba(99,102,241,0.05)",
  border: "1px solid rgba(99,102,241,0.15)",
  borderRadius: 8,
};