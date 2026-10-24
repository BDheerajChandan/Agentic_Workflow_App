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

import { useNavigate } from "react-router-dom";
import {
  runGraphStream, saveFlow, getFlowByRoute, submitHitl, createFlow, deleteFlow,
} from "../../services/api";
import HitlModal from "../hitl/HitlModal";
import PlaygroundPanel from "../playground/PlaygroundPanel";
import CreateVariableModal from "../CreateVariableModal";

// import { nodeTypes } from "../register_nodes";
// import SettingsPanel from "../nodes/SettingsPanel";
import { nodeTypes, nodeDefaults, extraSidebarNodes } from "../../registry/node_registration";
import SettingsPanel from "../../registry/SettingsPanel";
import NodeStatesModal from "../NodeStatesModal";
import RunHistoryModal from "../RunHistoryModal";
import { buildOutputDisplay } from "../../utils/outputDisplay";
import { downloadJson } from "../../utils/download";
import { buildExport, parseImport, prepareImport } from "../../utils/flowTransfer";

let _id = 1;
const getNodeId = () => `node_${_id++}`;

const TOPBAR_HEIGHT = 42;

const SIDEBAR_NODES = [
  { type: "start",          label: "Start",         icon: "◉",  color: "#34d399", bg: "rgba(16,185,129,0.08)",  border: "rgba(52,211,153,0.3)",  desc: "Entry point" },
  { type: "type_converter", label: "Type Converter", icon: "⚙",  color: "#a78bfa", bg: "rgba(139,92,246,0.08)", border: "rgba(167,139,250,0.3)", desc: "Transform values" },
  { type: "output",         label: "Output",         icon: "◎",  color: "#f87171", bg: "rgba(239,68,68,0.08)",  border: "rgba(248,113,113,0.3)", desc: "Terminal node" },
  { type: "rag_retrieve",   label: "RAG Retrieve",   icon: "📚", color: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.3)",  desc: "Fetch documents" },
  { type: "rag_generate",   label: "RAG Generate",   icon: "🧠", color: "#a78bfa", bg: "rgba(167,139,250,0.08)",border: "rgba(167,139,250,0.3)", desc: "LLM answer" },
  ...extraSidebarNodes,
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
  const [nodeSearch, setNodeSearch] = useState("");
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [nodeTraces, setNodeTraces] = useState([]);
  const [statesOpen, setStatesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [hitlPrompt, setHitlPrompt] = useState(null);
  const navigate = useNavigate();
  const [importDialog, setImportDialog] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [transferMsg, setTransferMsg] = useState(null);
  const importFileRef = useRef(null);

  const playgroundRef = useRef(null);
  useEffect(() => {
    if (!playgroundOpen) return undefined;
    const handler = (e) => {
      if (playgroundRef.current?.contains(e.target)) return;
      if (e.target.closest?.("[data-playground-toggle]")) return;
      if (e.target.closest?.("[data-hitl-modal]")) return;
      setPlaygroundOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, [playgroundOpen]);

  const [variablesVersion,  setVariablesVersion]  = useState(0);

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
      let defaultData = { ...(nodeDefaults[type] || {}) };
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

  // ── Human-in-the-loop ─────────────────────────────────────────────────────
  // `present` decides where the card is shown (Run popup or Playground chat).
  const presentModal = ({ interaction, submit, cancel }) =>
    setHitlPrompt({
      request: interaction,
      submit: async (response) => {
        await submit(response);
        setHitlPrompt(null);
      },
      cancel: async () => {
        await cancel();
        setHitlPrompt(null);
      },
    });

  const completeHitl = async (first, present) => {
    let current = first;
    let display;
    while (current?.paused && current?.interaction) {
      const interaction = current.interaction;
      const outcome = await new Promise((resolve, reject) => {
        present({
          interaction,
          submit: async (response) => {
            resolve(await submitHitl(interaction.pause_id, { response }));
          },
          cancel: async () => {
            try {
              await submitHitl(interaction.pause_id, { cancelled: true });
            } catch {
              /* ignore */
            }
            reject(new Error("HITL interaction cancelled by user."));
          },
        });
      });
      if (outcome.error) throw new Error(outcome.error);
      current = outcome.result;
      display = outcome.display ?? undefined;
    }
    return { result: current, display };
  };

  const collectFiles = (extra = []) => {
    const seen = new Set();
    return [
      ...nodes.filter((n) => n.type === "start").flatMap((n) => n.data?.files || []),
      ...extra,
    ]
      .filter((f) => f?.file_id && !seen.has(f.file_id) && seen.add(f.file_id))
      .map((f) => ({ file_id: f.file_id }));
  };

  // ── Run (SSE-driven execution highlighting) ───────────────────────────────
  const handleRun = async () => {
    setError(null);
    setRunning(true);
    setOutputOpen(true);
    setSettingsOpen(false);
    setRunningNodeId(null);
    setCompletedNodeIds(new Set());
    setNodeTraces([]);
    const traces = [];
    let display;
    try {
      const result = await runGraphStream(
        { nodes, edges, input, flow_id: flowId, files: collectFiles() },
        (evt) => {
          if (evt.type === "result" && evt.display !== undefined) display = evt.display;
          if (evt.type === "node") {
            if (evt.status === "running") {
              setRunningNodeId(evt.node_id);
            } else if (evt.status === "done") {
              setRunningNodeId((prev) => (prev === evt.node_id ? null : prev));
              setCompletedNodeIds((prev) => new Set(prev).add(evt.node_id));
            } else if (evt.status === "trace" && evt.detail) {
              setNodeTraces((prev) => [...prev, evt.detail]);
              traces.push(evt.detail);
            }
          }
        }
      );
      const done = await completeHitl(result?.result ?? result, presentModal);
      setOutput(
        await buildOutputDisplay({
          nodes,
          flowId,
          result: done.result,
          traces,
          display: done.display ?? display,
        })
      );
    } catch (err) {
      setError(err?.message || "Execution failed");
    } finally {
      setRunningNodeId(null);
      setRunning(false);
    }
  };

  const handleExportFlow = async () => {
    setTransferMsg(null);
    try {
      const doc = await buildExport({ flowName, input, nodes, edges, flowId });
      const base = (flowName || "workflow").trim().replace(/[^\w.-]+/g, "_") || "workflow";
      downloadJson(`${base}_export.json`, doc);
      const n = doc.file_references.length;
      setTransferMsg({
        ok: true,
        text: n
          ? `✓ Flow exported. ${n} attached file(s) are exported as references only; file contents are not included.`
          : "✓ Flow exported",
      });
    } catch (err) {
      setTransferMsg({ ok: false, text: `Export failed: ${err?.message || err}` });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setTransferMsg(null);
    try {
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Only .json files are supported.");
      const payload = parseImport(await file.text());
      setImportDialog({ payload, fileName: file.name });
    } catch (err) {
      setTransferMsg({ ok: false, text: `Import failed: ${err?.message || err}` });
    }
  };

  const applyReplace = async (payload) => {
    const prepared = await prepareImport(payload, flowId);

    setNodes(prepared.nodes);
    setEdges(prepared.edges);
    setInput(prepared.input_value);
    setFlowName(prepared.name);
    setOutput(null);
    setError(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSettingsOpen(false);
    setRunningNodeId(null);
    setCompletedNodeIds(new Set());
    setNodeTraces([]);
    setVariablesVersion((v) => v + 1);

    let maxId = 0;
    prepared.nodes.forEach((n) => {
      const num = parseInt(String(n.id).replace("node_", ""), 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    });
    _id = maxId + 1;

    const warn = prepared.warnings.length ? ` Warnings: ${prepared.warnings.join(" ")}` : "";
    setTransferMsg({
      ok: true,
      text: `✓ Imported ${prepared.nodes.length} node(s). Click Save to keep it.${warn}`,
    });
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
  };

  const applyNew = async (payload) => {
    const created = await createFlow(payload.name);
    try {
      const prepared = await prepareImport(payload, created.flow_id);
      await saveFlow({
        flow_id: created.flow_id,
        name: prepared.name,
        nodes: prepared.nodes,
        edges: prepared.edges,
        input_value: prepared.input_value,
      });
    } catch (err) {
      await deleteFlow(created.flow_id).catch(() => {});
      throw err;
    }
    navigate(`/flow/${created.route_slug}`);
  };

  const confirmImport = async (mode) => {
    if (!importDialog || importBusy) return;
    setImportBusy(true);
    try {
      if (mode === "replace") await applyReplace(importDialog.payload);
      else await applyNew(importDialog.payload);
      setImportDialog(null);
    } catch (err) {
      setImportDialog(null);
      setTransferMsg({ ok: false, text: `Import failed: ${err?.message || err}` });
    } finally {
      setImportBusy(false);
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

  const filteredSidebarNodes = SIDEBAR_NODES.filter((n) =>
    `${n.label} ${n.desc}`.toLowerCase().includes(nodeSearch.trim().toLowerCase())
  );

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

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button style={styles.backBtn} onClick={onBack}>← Back</button>
          <span style={styles.topBarLeft}>🚀 LangGraph Workflow Builder</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
            style={{ ...styles.runTopBtn, ...(running ? styles.runBtnDisabled : {}) }}
            onClick={handleRun}
            disabled={running}
          >
            {running ? <span style={styles.spinner}>⟳</span> : "▶ Run Graph"}
          </button>

          <button
            style={{
              ...styles.playgroundTopBtn,
              borderColor: playgroundOpen ? "#6366f1" : "#334155",
              color:       playgroundOpen ? "#818cf8" : "#94a3b8",
            }}
                        data-playground-toggle="true"
            onClick={() => {
              setPlaygroundOpen(!playgroundOpen);
              if (!playgroundOpen) { setSettingsOpen(false); setOutputOpen(false); }
            }}
          >
            🧪 Playground
          </button>

          <button
            style={{ ...styles.playgroundTopBtn, borderColor: "#334155", color: "#94a3b8" }}
            onClick={() => setHistoryOpen(true)}
          >
            🕘 Run History
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            style={styles.playgroundTopBtn}
            onClick={() => importFileRef.current?.click()}
            title="Import a flow from a JSON file"
          >
            ⬆ Import
          </button>
          <button
            style={styles.playgroundTopBtn}
            onClick={handleExportFlow}
            title="Export this flow as a JSON file"
          >
            ⬇ Export
          </button>
        </div>
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
            <div style={styles.logoRow}>
              <div style={styles.logo}>
                <span style={styles.logoDot} />
                LangGraph
              </div>
            </div>
            <div style={styles.logoSub}>Visual Flow Builder</div>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            {transferMsg && (
              <div style={{ ...styles.transferMsg, ...(transferMsg.ok ? styles.transferOk : styles.transferErr) }}>
                {transferMsg.text}
                <button style={styles.transferClose} onClick={() => setTransferMsg(null)}>✕</button>
              </div>
            )}
          </div>

          <div style={styles.nodesHeaderRow}>
            <div style={{ ...styles.sectionLabel, margin: 0 }}>Nodes</div>
            <input
              value={nodeSearch}
              onChange={(e) => setNodeSearch(e.target.value)}
              placeholder="Search…"
              style={styles.nodeSearch}
            />
          </div>

          <div style={styles.nodeList}>
            {filteredSidebarNodes.map((n) => (
              <SidebarNode key={n.type} {...n} onDragStart={onDragStart} />
            ))}
            {filteredSidebarNodes.length === 0 && (
              <div style={styles.nodeEmpty}>No nodes found</div>
            )}
          </div>

          <div style={styles.divider} />

          <button style={styles.variableBtn} onClick={() => setVariableModalOpen(true)}>
            ＋  Create Variable
          </button>

          <button style={styles.clearBtn} onClick={() => setClearConfirmOpen(true)}>✕  Clear</button>

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
            flowId={flowId}
            variablesVersion={variablesVersion}
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

                        {(nodeTraces.length > 0 || error) && (
              <button style={styles.statesBtn} onClick={() => setStatesOpen(true)}>
                🔍 View Node States
              </button>
            )}

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
          <div ref={playgroundRef} style={styles.playgroundWrapper}>
            <PlaygroundPanel
              flowId={flowId}
              output={output}
              loading={running}
              onClose={() => setPlaygroundOpen(false)}
              onSend={async (message, files, present) => {
                setRunningNodeId(null);
                setCompletedNodeIds(new Set());
                const traces = [];
                let display;
                const result = await runGraphStream(
                  { nodes, edges, input: message, flow_id: flowId, files: collectFiles(files) },
                  (evt) => {
                    if (evt.type === "result" && evt.display !== undefined) display = evt.display;
                    if (evt.type === "node") {
                      if (evt.status === "running") setRunningNodeId(evt.node_id);
                      else if (evt.status === "done") {
                        setRunningNodeId((prev) => (prev === evt.node_id ? null : prev));
                        setCompletedNodeIds((prev) => new Set(prev).add(evt.node_id));
                      } else if (evt.status === "trace" && evt.detail) {
                        traces.push(evt.detail);
                      }
                    }
                  }
                );
                const done = await completeHitl(result?.result ?? result, present);
                setRunningNodeId(null);
                return buildOutputDisplay({
                  nodes,
                  flowId,
                  result: done.result,
                  traces,
                  display: done.display ?? display,
                });
              }}
            />
          </div>
        )}

      </div>

      {clearConfirmOpen && (
        <div style={styles.confirmOverlay} onClick={() => setClearConfirmOpen(false)}>
          <div style={styles.confirmPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmTitle}>Clear Canvas</div>
            <div style={styles.confirmText}>
              This will remove all nodes and edges from the canvas and clear the output.
              Click Save afterwards to make it permanent. Continue?
            </div>
            <div style={styles.confirmActions}>
              <button style={styles.confirmCancel} onClick={() => setClearConfirmOpen(false)}>
                Cancel
              </button>
              <button
                style={styles.confirmDelete}
                onClick={() => {
                  handleClear();
                  setClearConfirmOpen(false);
                }}
              >
                Yes, Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {importDialog && (
        <div style={styles.confirmOverlay} onClick={() => !importBusy && setImportDialog(null)}>
          <div style={styles.confirmPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.confirmTitle}>Import Flow</div>
            <div style={styles.confirmText}>
              “{importDialog.payload.name}” · {importDialog.payload.nodes.length} node(s) ·{" "}
              {importDialog.payload.edges.length} edge(s) ({importDialog.fileName}).
              <br /><br />
              Replace the current canvas (unsaved changes are lost), or create it as a new flow?
            </div>
            <div style={styles.confirmActions}>
              <button
                style={styles.confirmCancel}
                disabled={importBusy}
                onClick={() => setImportDialog(null)}
              >
                Cancel
              </button>
              <button
                style={styles.confirmCancel}
                disabled={importBusy}
                onClick={() => confirmImport("new")}
              >
                Create New Flow
              </button>
              <button
                style={styles.confirmDelete}
                disabled={importBusy}
                onClick={() => confirmImport("replace")}
              >
                {importBusy ? "Importing…" : "Replace Current"}
              </button>
            </div>
          </div>
        </div>
      )}

      {hitlPrompt && (
        <HitlModal
          key={hitlPrompt.request.pause_id}
          request={hitlPrompt.request}
          onSubmit={hitlPrompt.submit}
          onCancel={hitlPrompt.cancel}
        />
      )}

      {historyOpen && (
        <RunHistoryModal
          flowId={flowId}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {statesOpen && (
        <NodeStatesModal
          traces={nodeTraces}
          nodes={nodes}
          error={error}
          onClose={() => setStatesOpen(false)}
        />
      )}

      {variableModalOpen && (
        <CreateVariableModal
          flowId={flowId}
          flowName={flowName}
          onClose={() => setVariableModalOpen(false)}
          onChanged={() => setVariablesVersion((v) => v + 1)}
        />
      )}
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
    padding: "0 12px",
    zIndex: 3000,
    color: "#e2e8f0", fontSize: 13, fontWeight: 600,
    gap: 8, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden",
  },

  body: {
    marginTop: TOPBAR_HEIGHT,
    flex: 1,
    display: "flex",
    overflow: "hidden",
    position: "relative",
  },

  backBtn: {
    padding: "5px 10px", borderRadius: 8, whiteSpace: "nowrap", flexShrink: 0,
    border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontSize: 12, cursor: "pointer", fontWeight: 600,
  },
  topBarLeft:   { color: "#818cf8", letterSpacing: "0.02em", fontSize: 12, whiteSpace: "nowrap" },
  topBarCenter: { color: "#38bdf8", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 },
  topBarRight:  { color: "#94a3b8", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 },

  flowNameInput: {
    padding: "4px 10px", borderRadius: 7,
    border: "1px solid #334155", background: "#0f172a",
    color: "#e2e8f0", fontSize: 13, fontWeight: 700,
    outline: "none", width: 130, minWidth: 0, fontFamily: "inherit",
  },
  saveBtn: {
    padding: "5px 10px", borderRadius: 8, border: "none", whiteSpace: "nowrap",
    background: "linear-gradient(135deg, #059669, #065f46)",
    color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  saveBtnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  saveMsg: { fontSize: 12, color: "#34d399", fontWeight: 600 },

  playgroundTopBtn: {
    padding: "5px 10px", borderRadius: 8, whiteSpace: "nowrap",
    border: "1px solid #334155", color: "#94a3b8", background: "transparent",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    transition: "all 0.15s", letterSpacing: "0.03em",
  },

  sidebar: {
    width: 240, minWidth: 240,
    background: "#0a0f1e", borderRight: "1px solid #1e293b",
    display: "flex", flexDirection: "column",
    padding: "20px 16px", gap: 8,
    overflow: "hidden", zIndex: 100,
  },
  
  sidebarHeader: { marginBottom: 8 },
  logo: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 15, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.05em",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  optionsBtn: {
    padding: "2px 8px", borderRadius: 7, border: "1px solid #334155",
    background: "transparent", fontSize: 15, lineHeight: 1, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
  },

  
optionsMenu: {
  position: "fixed", 
  top: 40,
  left: 160,
  minWidth: 140,
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 8,
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  zIndex: 99999,
},

  optionsItem: {
    padding: "7px 10px", borderRadius: 6, border: "none", background: "transparent",
    color: "#cbd5e1", fontSize: 12, textAlign: "left", cursor: "pointer",
    whiteSpace: "nowrap", fontFamily: "inherit",
  },
  transferMsg: {
    marginTop: 8, padding: "6px 8px", borderRadius: 6, fontSize: 11, lineHeight: 1.5,
    display: "flex", justifyContent: "space-between", gap: 6, wordBreak: "break-word",
    maxHeight: 90, overflowY: "auto",
  },
  transferOk:  { background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7" },
  transferErr: { background: "rgba(239,68,68,0.1)",  border: "1px solid rgba(239,68,68,0.3)",  color: "#fca5a5" },
  transferClose: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 11, flexShrink: 0 },
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
    flexShrink: 0,
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
  statesBtn: {
    width: "100%", padding: "8px 0", borderRadius: 10,
    border: "1px solid #6366f1", background: "rgba(99,102,241,0.08)",
    color: "#818cf8", fontSize: 12, fontWeight: 600,
    cursor: "pointer", letterSpacing: "0.04em",
  },
  confirmOverlay: {
    position: "fixed", inset: 0, background: "rgba(2,6,23,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000,
  },
  confirmPanel: {
    width: 380, maxWidth: "94vw",
    background: "#0a0f1e", border: "1px solid #1e293b",
    borderRadius: 14, padding: 22, color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  },
  confirmTitle: { fontSize: 16, fontWeight: 700, color: "#818cf8", marginBottom: 10 },
  confirmText: { fontSize: 12, color: "#94a3b8", lineHeight: 1.6 },
  confirmActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  confirmCancel: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  confirmDelete: {
    padding: "8px 18px", borderRadius: 9, border: "1px solid rgba(216, 6, 6, 0.4)",
    background: "rgba(239,68,68,0.12)", color: "#fca5a5", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  variableBtn: {
    width: "100%", padding: "9px 0", borderRadius: 10,
    border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontSize: 12, cursor: "pointer", letterSpacing: "0.04em",
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

  runTopBtn: {
    padding: "5px 10px", borderRadius: 8, border: "none", whiteSpace: "nowrap",
    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer",
    letterSpacing: "0.03em", boxShadow: "0 2px 10px rgba(99,102,241,0.35)",
  },
  nodesHeaderRow: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 8,
  },
  nodeSearch: {
    flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 7,
    border: "1px solid #1e293b", background: "#0f172a",
    color: "#e2e8f0", fontSize: 11, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  },
  nodeList: {
    flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
    display: "flex", flexDirection: "column", gap: 8, paddingRight: 4,
  },
  nodeEmpty: { color: "#475569", fontSize: 11, textAlign: "center", marginTop: 12 },
};