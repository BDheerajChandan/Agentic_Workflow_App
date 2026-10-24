// src/registry/SettingsPanel.jsx

import React, { useEffect, useRef, useState } from "react";
import { useReactFlow } from "reactflow";
import { settingsRegistry, variableCapableNodes } from "./node_registration";
import VariableSection from "./settings/VariableSection";
import {
  panel, panelHeader, panelTitle, panelSub, closeBtn, panelBody, infoStyle, infoBox,
} from "./settings/styles";

class SettingsBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={infoBox(true)}>
          ⚠ {this.props.label} failed to render: {String(this.state.error?.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SettingsPanel({
  selectedNodeId,
  onClose,
  globalInput,
  onGlobalInputChange,
  flowId,
  variablesVersion,
}) {
    const { getNode, getNodes, setNodes } = useReactFlow();

  const [localData, setLocalData] = useState({});

  const initialisedForRef = useRef(null);

  useEffect(() => {
    if (selectedNodeId === initialisedForRef.current) return;
    initialisedForRef.current = selectedNodeId;

    if (selectedNodeId) {
      const n = getNode(selectedNodeId);
      setLocalData(n ? { ...(n.data || {}) } : {});
    } else {
      setLocalData({});
    }
  }, [selectedNodeId, getNode]);

  const node = selectedNodeId ? getNode(selectedNodeId) : null;
  if (!node) return null;

  const patch = (updates) => {
    setLocalData((prev) => {
      const next = { ...prev, ...updates };
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, ...updates } }
            : n
        )
      );
      return next;
    });
  };

  const NodeSettings = settingsRegistry[node.type];

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <div>
          <div style={panelTitle}>Node Settings</div>
          <div style={panelSub}>
            {node.type} · {selectedNodeId}
          </div>
        </div>
        <button style={closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>
      <div style={panelBody}>
        {NodeSettings ? (
          <SettingsBoundary label="Node settings" resetKey={selectedNodeId}>
            <NodeSettings
              key={selectedNodeId}
              localData={localData}
              patch={patch}
              selectedNodeId={selectedNodeId}
              globalInput={globalInput}
              onGlobalInputChange={onGlobalInputChange}
              flowId={flowId}
              variablesVersion={variablesVersion}
              workflowNodes={getNodes()}
            />
          </SettingsBoundary>
        ) : (
          <div style={infoStyle}>
            No settings defined for node type: <strong>{node.type}</strong>
          </div>
        )}

        {variableCapableNodes.has(node.type) && (
          <SettingsBoundary label="Variable mapping" resetKey={selectedNodeId}>
            <VariableSection
              key={`${selectedNodeId}-var`}
              nodeType={node.type}
              localData={localData}
              patch={patch}
              flowId={flowId}
              variablesVersion={variablesVersion}
            />
          </SettingsBoundary>
        )}
      </div>
    </div>
  );
}