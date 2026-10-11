// canvas/FlowCanvas.jsx
import React, { useCallback, useRef, useState } from "react";
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
import { runGraph } from "../../services/api";
import PlaygroundPanel from "../playground/PlaygroundPanel";

let id = 1;
const getNodeId = () => `node_${id++}`;

// ─── Sidebar node definitions ─────────────────────────────────────────────────
const SIDEBAR_NODES = [
    {
        type: "start",
        label: "Start",
        icon: "◉",
        color: "#34d399",
        bg: "rgba(16,185,129,0.08)",
        border: "rgba(52,211,153,0.3)",
        desc: "Entry point",
    },
    {
        type: "type_converter",
        label: "Type Converter",
        icon: "⚙",
        color: "#a78bfa",
        bg: "rgba(139,92,246,0.08)",
        border: "rgba(167,139,250,0.3)",
        desc: "Transform values",
    },
    {
        type: "output",
        label: "Output",
        icon: "◎",
        color: "#f87171",
        bg: "rgba(239,68,68,0.08)",
        border: "rgba(248,113,113,0.3)",
        desc: "Terminal node",
    },
    {
        type: "rag_retrieve",
        label: "RAG Retrieve",
        icon: "📚",
        color: "#38bdf8",
        bg: "rgba(56,189,248,0.08)",
        border: "rgba(56,189,248,0.3)",
        desc: "Fetch documents",
    },
    {
        type: "rag_generate",
        label: "RAG Generate",
        icon: "🧠",
        color: "#a78bfa",
        bg: "rgba(167,139,250,0.08)",
        border: "rgba(167,139,250,0.3)",
        desc: "LLM answer",
    }
];

// ─── Wrapper ──────────────────────────────────────────────────────────────────
export default function FlowCanvasWrapper() {
    return (
        <ReactFlowProvider>
            <FlowCanvas />
        </ReactFlowProvider>
    );
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────
function FlowCanvas() {
    const reactFlowWrapper = useRef(null);
    const { screenToFlowPosition, fitView } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [input, setInput] = useState("");
    const [output, setOutput] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [playgroundOpen, setPlaygroundOpen] = useState(false);

    const [currentTime, setCurrentTime] = useState(
        new Date().toLocaleTimeString()
    );

    React.useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const onNodeClick = (_, node) => {
        setSelectedNodeId(node.id);
    };
    const onEdgeClick = (_, edge) => {
        setSelectedEdgeId(edge.id);
    };

    // ─── Connect ────────────────────────────────────────────────────────────────
    const onConnect = useCallback(
        (params) =>
            setEdges((eds) =>
                addEdge(
                    {
                        ...params,
                        // animated: true,
                        // style: { stroke: "#6366f1", strokeWidth: 2 },
                        animated: false,

                        style: {
                            stroke: "#64748b",
                            strokeWidth: 2,
                        },
                    },
                    eds
                )
            ),
        [setEdges]
    );

    // ─── Drag ───────────────────────────────────────────────────────────────────
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

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            let defaultData = {};
            if (type === "type_converter") defaultData = { operation: "upper" };

            const newNode = { id: getNodeId(), type, position, data: defaultData };
            setNodes((nds) => [...nds, newNode]);

            setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
        },
        [screenToFlowPosition, setNodes, fitView]
    );

    // ─── Run ────────────────────────────────────────────────────────────────────
    const handleRun = async () => {
        setError(null);
        setRunning(true);
        try {
            const res = await runGraph({ nodes, edges, input });
            setOutput(res.result);
        } catch (err) {
            setError(err?.response?.data?.detail || err.message || "Execution failed");
        } finally {
            setRunning(false);
        }
    };

    const handleClear = () => {
        setNodes([]);
        setEdges([]);
        setOutput(null);
        setError(null);
        setInput("");
        id = 1;
    };

    const styledNodes = nodes.map((node) => ({
        ...node,

        style: {
            border:
                selectedNodeId === node.id
                    ? "2px solid #6366f1"
                    : "1px solid #334155",

            boxShadow:
                selectedNodeId === node.id
                    ? "0 0 20px rgba(99,102,241,0.7)"
                    : "0 0 0px transparent",

            transition: "all 0.2s ease",

            borderRadius: 14,
        },
    }));

    const styledEdges = edges.map((edge) => ({
        ...edge,

        animated: false,

        type: "smoothstep",

        style: {
            stroke:
                selectedEdgeId === edge.id
                    ? "#6366f1"
                    : "#64748b",

            strokeWidth:
                selectedEdgeId === edge.id
                    ? 4
                    : 2,

            filter:
                selectedEdgeId === edge.id
                    ? "drop-shadow(0px 0px 6px rgba(99,102,241,0.8))"
                    : "none",

            transition: "all 0.2s ease",
        },
    }));

    return (
        <div style={styles.root}>
            <div style={styles.topBar}>
                <div style={styles.topBarLeft}>
                    🚀 LangGraph Workflow Builder
                </div>

                <div style={styles.topBarCenter}>
                    {new Date().toLocaleDateString()} 
                    {"  ||  "}{" "}
                    {currentTime}
                </div>

                <div style={styles.topBarRight}>
                    <span style={{ color: "#e9e9f3", fontWeight: 600}}>
                        Developed by Dheeraj
                    </span>
                </div>

            
            </div>

            {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
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

                <div style={styles.sectionLabel}>Input</div>
                {/* <textarea
                    style={styles.textarea}
                    placeholder="Enter your input text…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={4}
                /> */}

                <textarea
                    style={{
                        ...styles.textarea,
                        minHeight: "40px",
                    }}
                    placeholder="Enter your input text…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />

                <button
                    style={styles.playgroundBtn}
                    onClick={() =>
                        setPlaygroundOpen(!playgroundOpen)
                    }
                >
                    Playground
                </button>

                <button
                    style={{
                        ...styles.runBtn,
                        ...(running ? styles.runBtnDisabled : {}),
                    }}
                    onClick={handleRun}
                    disabled={running}
                >
                    {running ? (
                        <span style={styles.spinner}>⟳</span>
                    ) : (
                        "▶  Run Graph"
                    )}
                </button>

                <button style={styles.clearBtn} onClick={handleClear}>
                    ✕  Clear
                </button>

                {/* <div style={styles.hint}>
                    Drag nodes onto the canvas, connect them, then run.
                </div> */}
            </aside>

            {/* ── Canvas ──────────────────────────────────────────────────────────── */}
            <div ref={reactFlowWrapper} style={styles.canvas}>
                <ReactFlow
                    //   nodes={nodes}
                    nodes={styledNodes}
                    onNodeClick={onNodeClick}
                    // edges={edges}
                    edges={styledEdges}
                    onEdgeClick={onEdgeClick}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
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

            {/* ── Output Panel ────────────────────────────────────────────────────── */}
            <aside style={styles.outputPanel}>
                <div style={styles.outputHeader}>
                    <span style={styles.outputTitle}>Output</span>
                    {output && (
                        <button
                            style={styles.copyBtn}
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(output, null, 2))}
                        >
                            Copy
                        </button>
                    )}
                </div>

                {error && (
                    <div style={styles.errorBox}>
                        <span style={styles.errorIcon}>⚠</span>
                        {error}
                    </div>
                )}

                {!output && !error && (
                    <div style={styles.outputEmpty}>
                        Run the graph to see results here.
                    </div>
                )}

                {output && <OutputDisplay data={output} />}
            </aside>
            {playgroundOpen && (
                <div style={styles.playgroundWrapper}>
                    <PlaygroundPanel
                        output={output}
                        loading={running}
                        onSend={async (message) => {

                            const payload = {
                                nodes,
                                edges,
                                input: message,
                            };

                            const res = await runGraph(payload);

                            return res.result;
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// ─── OutputDisplay ────────────────────────────────────────────────────────────
function OutputDisplay({ data }) {
    if (!data || typeof data !== "object") {
        return <pre style={styles.outputPre}>{String(data)}</pre>;
    }

    // Highlight the most useful keys first
    const keyOrder = ["input", "data", "final_output"];
    const allKeys = Object.keys(data);
    const sorted = [
        ...keyOrder.filter((k) => k in data),
        ...allKeys.filter((k) => !keyOrder.includes(k)),
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sorted.map((key) => (
                <OutputField key={key} fieldKey={key} value={data[key]} />
            ))}
        </div>
    );
}

function OutputField({ fieldKey, value }) {
    const isObject = value !== null && typeof value === "object";
    const displayValue = isObject ? value : String(value);

    const highlight = fieldKey === "final_output" || fieldKey === "data";

    return (
        <div
            style={{
                ...styles.outputField,
                ...(highlight ? styles.outputFieldHighlight : {}),
            }}
        >
            <div style={styles.outputFieldKey}>{fieldKey}</div>
            {isObject ? (
                <NestedOutput data={displayValue} />
            ) : (
                <div style={styles.outputFieldValue}>{String(displayValue)}</div>
            )}
        </div>
    );
}

function NestedOutput({ data }) {
    if (typeof data !== "object" || data === null) {
        return <div style={styles.outputFieldValue}>{String(data)}</div>;
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {Object.entries(data).map(([k, v]) => (
                <div key={k} style={styles.nestedRow}>
                    <span style={styles.nestedKey}>{k}</span>
                    <span style={styles.nestedValue}>
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </span>
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
                background: hovered ? bg : "transparent",
                borderColor: hovered ? color : border,
                transform: hovered ? "translateX(3px)" : "none",
            }}
        >
            <span style={{ ...styles.nodeIcon, color }}>{icon}</span>
            <div>
                <div style={{ ...styles.nodeLabel, color: hovered ? "#fff" : "#cbd5e1" }}>
                    {label}
                </div>
                <div style={styles.nodeDesc}>{desc}</div>
            </div>
            <span style={{ ...styles.nodeDrag, color }}>⠿</span>
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
    root: {
        width: "100vw",
        height: "100vh",
        paddingTop: "32px",
        display: "flex",
        overflow: "hidden",
        background: "#020617",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    },

    // Sidebar
    sidebar: {
        width: 240,
        minWidth: 240,
        background: "#0a0f1e",
        borderRight: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px",
        gap: 8,
        overflowY: "auto",
        overflowX: "hidden",
    },
    sidebarHeader: { marginBottom: 8 },
    logo: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 15,
        fontWeight: 700,
        color: "#e2e8f0",
        letterSpacing: "0.05em",
    },
    logoDot: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#6366f1",
        boxShadow: "0 0 8px #6366f1",
        display: "inline-block",
    },
    logoSub: {
        fontSize: 10,
        color: "#475569",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginTop: 2,
    },
    sectionLabel: {
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#475569",
        marginTop: 4,
        marginBottom: 2,
    },
    sidebarNode: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid",
        cursor: "grab",
        transition: "all 0.18s ease",
        userSelect: "none",
    },
    nodeIcon: { fontSize: 16, flexShrink: 0 },
    nodeLabel: { fontSize: 13, fontWeight: 600, transition: "color 0.15s" },
    nodeDesc: { fontSize: 10, color: "#475569", marginTop: 1 },
    nodeDrag: { marginLeft: "auto", fontSize: 16, opacity: 0.4 },
    divider: { height: 1, background: "#1e293b", margin: "8px 0" },
    textarea: {
        width: "100%",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #1e293b",
        background: "#0f172a",
        color: "#e2e8f0",
        fontSize: 12,
        resize: "none",
        outline: "none",
        fontFamily: "inherit",
        lineHeight: 1.5,
        boxSizing: "border-box",
    },
    runBtn: {
        width: "100%",
        padding: "12px 0",
        borderRadius: 10,
        border: "none",
        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        color: "white",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        letterSpacing: "0.05em",
        transition: "opacity 0.2s",
        boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
    },
    runBtnDisabled: { opacity: 0.6, cursor: "not-allowed" },
    clearBtn: {
        width: "100%",
        padding: "9px 0",
        borderRadius: 10,
        border: "1px solid #1e293b",
        background: "transparent",
        color: "#64748b",
        fontSize: 12,
        cursor: "pointer",
        letterSpacing: "0.04em",
        transition: "all 0.15s",
    },
    hint: {
        fontSize: 10,
        color: "#334155",
        lineHeight: 1.5,
        textAlign: "center",
        marginTop: "auto",
        paddingTop: 8,
    },
    spinner: {
        display: "inline-block",
        animation: "spin 0.8s linear infinite",
        fontSize: 16,
    },

    // Canvas
    canvas: { flex: 1, position: "relative" },
    controls: {
        background: "#0a0f1e",
        border: "1px solid #1e293b",
        borderRadius: 10,
    },
    emptyState: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
        pointerEvents: "none",
    },
    emptyIcon: { fontSize: 48, color: "#1e293b", marginBottom: 12 },
    emptyText: { color: "#334155", fontSize: 13, letterSpacing: "0.04em" },

    // Output panel
    outputPanel: {
        width: 280,
        minWidth: 280,

        background: "#0a0f1e",
        borderLeft: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px",
        gap: 12,
        overflowY: "auto",
        overflowX: "hidden",
    },
    outputHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
    },
    outputTitle: {
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#475569",
        fontWeight: 600,
    },
    copyBtn: {
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 6,
        border: "1px solid #1e293b",
        background: "transparent",
        color: "#64748b",
        cursor: "pointer",
        letterSpacing: "0.04em",
    },
    outputEmpty: {
        color: "#334155",
        fontSize: 12,
        textAlign: "center",
        marginTop: 40,
        lineHeight: 1.6,
    },
    errorBox: {
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: 10,
        padding: "10px 12px",
        color: "#fca5a5",
        fontSize: 12,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
    },
    errorIcon: { flexShrink: 0 },
    outputPre: {
        color: "#94a3b8",
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
        lineHeight: 1.6,
    },
    outputField: {
        borderRadius: 10,
        border: "1px solid #1e293b",
        padding: "10px 12px",
        background: "transparent",
    },
    outputFieldHighlight: {
        border: "1px solid rgba(99,102,241,0.3)",
        background: "rgba(99,102,241,0.05)",
    },
    outputFieldKey: {
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "#6366f1",
        marginBottom: 6,
        fontWeight: 600,
    },
    outputFieldValue: {
        color: "#e2e8f0",
        fontSize: 13,
        wordBreak: "break-word",
        lineHeight: 1.5,
    },
    nestedRow: {
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        fontSize: 12,
    },
    nestedKey: {
        color: "#64748b",
        minWidth: 60,
        flexShrink: 0,
        paddingTop: 1,
    },
    nestedValue: {
        color: "#cbd5e1",
        wordBreak: "break-word",
        lineHeight: 1.5,
    },
    playgroundBtn: {
        width: "100%",
        padding: "12px 0",
        borderRadius: 10,
        border: "1px solid #334155",
        background: "#0f172a",
        color: "#cbd5e1",
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 10,
    },
    playgroundWrapper: {
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 1000,
        height: "100vh",
    },
    topBar: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 42,
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",

        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",

        padding: "0 0px",

        zIndex: 2000,

        color: "#e2e8f0",

        fontSize: 13,
        fontWeight: 600,
    },

    topBarLeft: {
        color: "#818cf8",
        letterSpacing: "0.04em",
    },

    topBarCenter: {
        color: "#38bdf8",
        fontSize: 14,
    },

    topBarRight: {
        color: "#94a3b8",
        fontSize: 12,
    },
};
