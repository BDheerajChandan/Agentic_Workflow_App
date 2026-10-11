// src/components/canvas/FlowCanvas.jsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import { nodeTypes } from "../register_nodes";
import { runGraphStream, saveFlow, getFlowByRoute } from "../../services/api";
import PlaygroundPanel from "../playground/PlaygroundPanel";
import SettingsPanel from "../nodes/SettingsPanel";

let _id = 1;
const getNodeId = () => `node_${_id++}`;

const TOPBAR_HEIGHT = 42;

const SIDEBAR_NODES = [
  { type: "start",          label: "Start",         icon: "◉",  color: "#34d399", bg: "rgba(16,185,129,0.08)",  border: "rgba(52,211,153,0.3)",  desc: "Entry point" },
  { type: "type_converter", label: "Type Converter", icon: "⚙",  color: "#a78bfa", bg: "rgba(139,92,246,0.08)", border: "rgba(167,139,250,0.3)", desc: "Transform values" },
  { type: "output",         label: "Output",         icon: "◎",  color: "#f87171", bg: "rgba(239,68,68,0.08)",  border: "rgba(248,113,113,0.3)", desc: "Terminal node" },
  { type: "rag_retrieve",   label: "RAG Retrieve",   icon: "📚", color: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.3)",  desc: "Fetch documents" },
  { type: "rag_generate",   label: "RAG Generate",   icon: "🧠", color: "#a78bfa", bg: "rgba(167,139,250,0.08)",border: "rgba(167,139,250,0.3)", desc: "LLM answer" },
];

// ─── Wrapper ──────────────────────────────────────────────────────────────────
export default function FlowCanvasWrapper({ routeSlug, onBack }) {
  return (
    <ReactFlowProvider>
      <FlowCanvas routeSlug={routeSlug} onBack={onBack} />
    </ReactFlowProvider>
  );
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────
function FlowCanvas({ routeSlug, onBack }) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [input, setInput]           = useState("");
  const [output, setOutput]         = useState(null);
  const [running, setRunning]       = useState(false);
  const [error, setError]           = useState(null);
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState("");

  const [flowId, setFlowId]         = useState(null);
  const [flowName, setFlowName]     = useState("Untitled Flow");
  const [loaded, setLoaded]         = useState(false);
  const [loadError, setLoadError]   = useState(null);

  const [selectedNodeId, setSelectedNodeId]   = useState(null);
  const [selectedEdgeId, setSelectedEdgeId]   = useState(null);

  // ── Live execution highlighting ───────────────────────────────────────────
  const [runningNodeId, setRunningNodeId]         = useState(null);
  const [completedNodeIds, setCompletedNodeIds]   = useState(() => new Set());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outputOpen,   setOutputOpen]   = useState(true);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Resolve flow from the URL route slug ──────────────────────────────────
  useEffect(() => {
    if (!routeSlug) return;
    (async () => {
      try {
        const flow = await getFlowByRoute(routeSlug);
        const loadedNodes = (flow.nodes || []).map((n) => ({
          ...n,
          position: n.position || { x: 100, y: 100 },
        }));
        setNodes(loadedNodes);
        setEdges(flow.edges || []);
        setInput(flow.input_value || "");
        setFlowName(flow.name);
        setFlowId(flow.id);
        let maxId = 0;
        loadedNodes.forEach((n) => {
          const num = parseInt(n.id.replace("node_", ""), 10);
          if (!isNaN(num) && num > maxId) maxId = num;
        });
        _id = maxId + 1;
        setLoaded(true);
        setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 200);
      } catch {
        setLoadError("Failed to load flow.");
      }
    })();
  }, [routeSlug]); // eslint-disable-line

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: false, style: { stroke: "#64748b", strokeWidth: 2 } }, eds)
      ),
    [setEdges]
  );

  const onNodeClick = (_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setSettingsOpen(true);
    setOutputOpen(false);
    setPlaygroundOpen(false);
  };

  const onEdgeClick = (_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setSettingsOpen(false);
  };

  const onPaneClick = () => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSettingsOpen(false);
    setOutputOpen(false);
  };

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      let defaultData = {};
      if (type === "type_converter") defaultData = { operation: "upper" };
      if (type === "rag_retrieve")   defaultData = { source_locality: "nonlocal", source: "", source_type: "", chunk_size: 500, chunk_overlap: 100, k: 5 };
      const newNode = { id: getNodeId(), type, position, data: defaultData };
      setNodes((nds) => [...nds, newNode]);
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
    },
    [screenToFlowPosition, setNodes, fitView]
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await saveFlow({ flow_id: flowId, name: flowName, nodes, edges, input_value: input });
      setFlowId(res.flow_id);
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {
      setSaveMsg("✗ Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Run (SSE-driven execution highlighting) ───────────────────────────────
  const handleRun = async () => {
    setError(null);
    setRunning(true);
    setOutputOpen(true);
    setSettingsOpen(false);
    setRunningNodeId(null);
    setCompletedNodeIds(new Set());
    try {
      const result = await runGraphStream(
        { nodes, edges, input, flow_id: flowId },
        (evt) => {
          if (evt.type === "node") {
            if (evt.status === "running") {
              setRunningNodeId(evt.node_id);
            } else if (evt.status === "done") {
              setRunningNodeId((prev) => (prev === evt.node_id ? null : prev));
              setCompletedNodeIds((prev) => new Set(prev).add(evt.node_id));
            }
          }
        }
      );
      setOutput(result?.result ?? result);
    } catch (err) {
      setError(err?.message || "Execution failed");
    } finally {
      setRunningNodeId(null);
      setRunning(false);
    }
  };

  const handleClear = () => {
    setNodes([]);
    setEdges([]);
    setOutput(null);
    setError(null);
    setInput("");
    setSelectedNodeId(null);
    setSettingsOpen(false);
    setOutputOpen(false);
    setRunningNodeId(null);
    setCompletedNodeIds(new Set());
    _id = 1;
  };

  const styledNodes = nodes.map((node) => {
    const isRunning = runningNodeId === node.id;
    const isSelected = selectedNodeId === node.id;
    const isCompleted = completedNodeIds.has(node.id);

    let border = "1px solid #334155";
    let boxShadow = "0 0 0px transparent";

    if (isRunning) {
      border = "2px solid #f59e0b";
      boxShadow = "0 0 22px rgba(245,158,11,0.8)";
    } else if (isSelected) {
      border = "2px solid #6366f1";
      boxShadow = "0 0 20px rgba(99,102,241,0.7)";
    } else if (isCompleted) {
      border = "1.5px solid #34d399";
      boxShadow = "0 0 10px rgba(52,211,153,0.35)";
    }

    return {
      ...node,
      style: {
        border,
        boxShadow,
        transition: "all 0.2s ease",
        borderRadius: 14,
      },
    };
  });

  const styledEdges = edges.map((edge) => {
    const isActive = runningNodeId && edge.target === runningNodeId;
    const isSelected = selectedEdgeId === edge.id;

    return {
      ...edge,
      animated: isActive,
      type: "smoothstep",
      style: {
        stroke: isActive ? "#f59e0b" : isSelected ? "#6366f1" : "#64748b",
        strokeWidth: isActive || isSelected ? 4 : 2,
        filter: isActive
          ? "drop-shadow(0px 0px 6px rgba(245,158,11,0.8))"
          : isSelected
          ? "drop-shadow(0px 0px 6px rgba(99,102,241,0.8))"
          : "none",
        transition: "all 0.2s ease",
      },
    };
  });

  if (loadError) {
    return (
      <div style={{ ...styles.root, alignItems: "center", justifyContent: "center", color: "#fca5a5" }}>
        {loadError}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ ...styles.root, alignItems: "center", justifyContent: "center", color: "#475569" }}>
        Loading flow…
      </div>
    );
  }

  return (
    <div style={styles.root}>

      <div style={styles.topBar}>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={styles.backBtn} onClick={onBack}>← Back</button>
          <span style={styles.topBarLeft}>🚀 LangGraph Workflow Builder</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            style={styles.flowNameInput}
            title="Flow name"
          />
          {saveMsg && <span style={styles.saveMsg}>{saveMsg}</span>}
          <button
            style={{ ...styles.saveBtn, ...(saving ? styles.saveBtnDisabled : {}) }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "💾 Save"}
          </button>

          <button
            style={{
              ...styles.playgroundTopBtn,
              borderColor: playgroundOpen ? "#6366f1" : "#334155",
              color:       playgroundOpen ? "#818cf8" : "#94a3b8",
            }}
            onClick={() => {
              setPlaygroundOpen(!playgroundOpen);
              if (!playgroundOpen) { setSettingsOpen(false); setOutputOpen(false); }
            }}
          >
            🧪 Playground
          </button>
        </div>

        <div style={styles.topBarCenter}>
          {new Date().toLocaleDateString()} {"  ||  "} {currentTime}
        </div>

        <div style={styles.topBarRight}>
          <span style={{ color: "#e9e9f3", fontWeight: 600 }}>Developed by Dheeraj</span>
        </div>
      </div>

      <div style={styles.body}>

        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={styles.logo}>
              <span style={styles.logoDot} />
              LangGraph
            </div>
            <div style={styles.logoSub}>Visual Flow Builder</div>
          </div>

          <div style={styles.sectionLabel}>Nodes</div>
          {SIDEBAR_NODES.map((n) => (
            <SidebarNode key={n.type} {...n} onDragStart={onDragStart} />
          ))}

          <div style={styles.divider} />

          <button
            style={{ ...styles.runBtn, ...(running ? styles.runBtnDisabled : {}) }}
            onClick={handleRun}
            disabled={running}
          >
            {running ? <span style={styles.spinner}>⟳</span> : "▶  Run Graph"}
          </button>

          <button style={styles.clearBtn} onClick={handleClear}>✕  Clear</button>

          <button
            style={{
              ...styles.togglePanelBtn,
              borderColor: outputOpen ? "#6366f1" : "#1e293b",
              color:       outputOpen ? "#818cf8" : "#475569",
            }}
            onClick={() => {
              setOutputOpen(!outputOpen);
              if (!outputOpen) setSettingsOpen(false);
            }}
          >
            {outputOpen ? "▣  Hide Output" : "▣  Show Output"}
          </button>
        </aside>

        <div ref={reactFlowWrapper} style={styles.canvas}>
          <ReactFlow
            nodes={styledNodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            deleteKeyCode={["Delete", "Backspace"]}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Controls style={styles.controls} />
            <Background gap={24} size={1} color="#1e293b" />
          </ReactFlow>

          {nodes.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>⬡</div>
              <div style={styles.emptyText}>Drag nodes here to build your graph</div>
            </div>
          )}
        </div>

        {settingsOpen && (
          <SettingsPanel
            selectedNodeId={selectedNodeId}
            onClose={() => { setSettingsOpen(false); setSelectedNodeId(null); }}
            globalInput={input}
            onGlobalInputChange={setInput}
          />
        )}

        {outputOpen && !settingsOpen && (
          <aside style={styles.outputPanel}>
            <div style={styles.outputHeader}>
              <span style={styles.outputTitle}>Output</span>
              <div style={{ display: "flex", gap: 8 }}>
                {output && (
                  <button
                    style={styles.copyBtn}
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(output, null, 2))}
                  >
                    Copy
                  </button>
                )}
                <button style={styles.copyBtn} onClick={() => setOutputOpen(false)}>✕</button>
              </div>
            </div>

            {error && (
              <div style={styles.errorBox}>
                <span style={styles.errorIcon}>⚠</span>
                {error}
              </div>
            )}

            {!output && !error && (
              <div style={styles.outputEmpty}>Run the graph to see results here.</div>
            )}

            {output && <OutputDisplay data={output} />}
          </aside>
        )}

        {playgroundOpen && (
          <div style={styles.playgroundWrapper}>
            <PlaygroundPanel
              output={output}
              loading={running}
              onSend={async (message) => {
                setRunningNodeId(null);
                setCompletedNodeIds(new Set());
                const result = await runGraphStream(
                  { nodes, edges, input: message, flow_id: flowId },
                  (evt) => {
                    if (evt.type === "node") {
                      if (evt.status === "running") setRunningNodeId(evt.node_id);
                      else if (evt.status === "done") {
                        setRunningNodeId((prev) => (prev === evt.node_id ? null : prev));
                        setCompletedNodeIds((prev) => new Set(prev).add(evt.node_id));
                      }
                    }
                  }
                );
                setRunningNodeId(null);
                return result?.result ?? result;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OutputDisplay ────────────────────────────────────────────────────────────
function OutputDisplay({ data }) {
  if (!data || typeof data !== "object") {
    return <pre style={styles.outputPre}>{String(data)}</pre>;
  }
  const keyOrder = ["input", "data", "final_output"];
  const allKeys  = Object.keys(data);
  const sorted   = [...keyOrder.filter((k) => k in data), ...allKeys.filter((k) => !keyOrder.includes(k))];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {sorted.map((key) => <OutputField key={key} fieldKey={key} value={data[key]} />)}
    </div>
  );
}

function OutputField({ fieldKey, value }) {
  const isObject  = value !== null && typeof value === "object";
  const highlight = fieldKey === "final_output" || fieldKey === "data";
  return (
    <div style={{ ...styles.outputField, ...(highlight ? styles.outputFieldHighlight : {}) }}>
      <div style={styles.outputFieldKey}>{fieldKey}</div>
      {isObject
        ? <NestedOutput data={value} />
        : <div style={styles.outputFieldValue}>{String(value)}</div>}
    </div>
  );
}

function NestedOutput({ data }) {
  if (typeof data !== "object" || data === null)
    return <div style={styles.outputFieldValue}>{String(data)}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={styles.nestedRow}>
          <span style={styles.nestedKey}>{k}</span>
          <span style={styles.nestedValue}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SidebarNode ──────────────────────────────────────────────────────────────
function SidebarNode({ type, label, icon, color, bg, border, desc, onDragStart }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, type)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.sidebarNode,
        background:  hovered ? bg : "transparent",
        borderColor: hovered ? color : border,
        transform:   hovered ? "translateX(3px)" : "none",
      }}
    >
      <span style={{ ...styles.nodeIcon, color }}>{icon}</span>
      <div>
        <div style={{ ...styles.nodeLabel, color: hovered ? "#fff" : "#cbd5e1" }}>{label}</div>
        <div style={styles.nodeDesc}>{desc}</div>
      </div>
      <span style={{ ...styles.nodeDrag, color }}>⠿</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    width: "100vw", height: "100vh",
    display: "flex", flexDirection: "column",
    overflow: "hidden", background: "#020617",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  },

  topBar: {
    position: "fixed",
    top: 0, left: 0, right: 0,
    height: TOPBAR_HEIGHT,
    background: "#0f172a",
    borderBottom: "1px solid #1e293b",
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    zIndex: 3000,
    color: "#e2e8f0", fontSize: 13, fontWeight: 600,
    gap: 12, flexShrink: 0,
  },

  body: {
    marginTop: TOPBAR_HEIGHT,
    flex: 1,
    display: "flex",
    overflow: "hidden",
    position: "relative",
  },

  backBtn: {
    padding: "5px 12px", borderRadius: 8,
    border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontSize: 12, cursor: "pointer", fontWeight: 600,
  },
  topBarLeft:   { color: "#818cf8", letterSpacing: "0.04em" },
  topBarCenter: { color: "#38bdf8", fontSize: 13 },
  topBarRight:  { color: "#94a3b8", fontSize: 12 },

  flowNameInput: {
    padding: "4px 10px", borderRadius: 7,
    border: "1px solid #334155", background: "#0f172a",
    color: "#e2e8f0", fontSize: 13, fontWeight: 700,
    outline: "none", width: 200, fontFamily: "inherit",
  },
  saveBtn: {
    padding: "5px 14px", borderRadius: 8, border: "none",
    background: "linear-gradient(135deg, #059669, #065f46)",
    color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  saveBtnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  saveMsg: { fontSize: 12, color: "#34d399", fontWeight: 600 },

  playgroundTopBtn: {
    padding: "5px 14px", borderRadius: 8,
    border: "1px solid", background: "transparent",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    transition: "all 0.15s", letterSpacing: "0.03em",
  },

  sidebar: {
    width: 240, minWidth: 240,
    background: "#0a0f1e", borderRight: "1px solid #1e293b",
    display: "flex", flexDirection: "column",
    padding: "20px 16px", gap: 8,
    overflowY: "auto", overflowX: "hidden", zIndex: 100,
  },
  sidebarHeader: { marginBottom: 8 },
  logo: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 15, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.05em",
  },
  logoDot: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#6366f1", boxShadow: "0 0 8px #6366f1", display: "inline-block",
  },
  logoSub: {
    fontSize: 10, color: "#475569",
    letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
  },
  sectionLabel: {
    fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
    color: "#475569", marginTop: 4, marginBottom: 2,
    display: "flex", alignItems: "center", gap: 6,
  },
  sidebarNode: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 10, border: "1px solid",
    cursor: "grab", transition: "all 0.18s ease", userSelect: "none",
  },
  nodeIcon:  { fontSize: 16, flexShrink: 0 },
  nodeLabel: { fontSize: 13, fontWeight: 600, transition: "color 0.15s" },
  nodeDesc:  { fontSize: 10, color: "#475569", marginTop: 1 },
  nodeDrag:  { marginLeft: "auto", fontSize: 16, opacity: 0.4 },
  divider:   { height: 1, background: "#1e293b", margin: "8px 0" },

  runBtn: {
    width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
    letterSpacing: "0.05em", transition: "opacity 0.2s",
    boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
  },
  runBtnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  clearBtn: {
    width: "100%", padding: "9px 0", borderRadius: 10,
    border: "1px solid #1e293b", background: "transparent",
    color: "#64748b", fontSize: 12, cursor: "pointer", letterSpacing: "0.04em",
  },
  togglePanelBtn: {
    width: "100%", padding: "9px 0", borderRadius: 10,
    border: "1px solid", background: "transparent",
    fontSize: 12, cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.15s",
  },
  spinner: { display: "inline-block", animation: "spin 0.8s linear infinite", fontSize: 16 },

  canvas: { flex: 1, position: "relative" },
  controls: { background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 10 },
  emptyState: {
    position: "absolute", top: "50%", left: "50%",
    transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none",
  },
  emptyIcon: { fontSize: 48, color: "#1e293b", marginBottom: 12 },
  emptyText: { color: "#334155", fontSize: 13, letterSpacing: "0.04em" },

  outputPanel: {
    width: 280, minWidth: 280,
    background: "#0a0f1e", borderLeft: "1px solid #1e293b",
    display: "flex", flexDirection: "column",
    padding: "20px 16px", gap: 12,
    overflowY: "auto", overflowX: "hidden", zIndex: 100,
  },
  outputHeader: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  outputTitle: {
    fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
    color: "#475569", fontWeight: 600,
  },
  copyBtn: {
    fontSize: 10, padding: "3px 8px", borderRadius: 6,
    border: "1px solid #1e293b", background: "transparent",
    color: "#64748b", cursor: "pointer", letterSpacing: "0.04em",
  },
  outputEmpty: { color: "#334155", fontSize: 12, textAlign: "center", marginTop: 40, lineHeight: 1.6 },
  errorBox: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 10, padding: "10px 12px", color: "#fca5a5",
    fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start",
  },
  errorIcon:  { flexShrink: 0 },
  outputPre:  { color: "#94a3b8", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, lineHeight: 1.6 },
  outputField: { borderRadius: 10, border: "1px solid #1e293b", padding: "10px 12px", background: "transparent" },
  outputFieldHighlight: { border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.05)" },
  outputFieldKey: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6366f1", marginBottom: 6, fontWeight: 600 },
  outputFieldValue: { color: "#e2e8f0", fontSize: 13, wordBreak: "break-word", lineHeight: 1.5 },
  nestedRow:  { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 },
  nestedKey:  { color: "#64748b", minWidth: 60, flexShrink: 0, paddingTop: 1 },
  nestedValue:{ color: "#cbd5e1", wordBreak: "break-word", lineHeight: 1.5 },

  playgroundWrapper: {
    position: "absolute", top: 0, right: 0,
    zIndex: 1000, height: "100%",
  },
};