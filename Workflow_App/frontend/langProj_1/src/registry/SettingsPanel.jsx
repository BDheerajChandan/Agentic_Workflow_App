// src/registry/SettingsPanel.jsx

import React, { useEffect, useRef, useState } from "react";
import { useReactFlow } from "reactflow";
import { settingsRegistry } from "./node_registration";
import {
  panel, panelHeader, panelTitle, panelSub, closeBtn, panelBody, infoStyle,
} from "./settings/styles";

export default function SettingsPanel({
  selectedNodeId,
  onClose,
  globalInput,
  onGlobalInputChange,
}) {
  const { getNode, setNodes } = useReactFlow();

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
          <NodeSettings
            key={selectedNodeId}
            localData={localData}
            patch={patch}
            selectedNodeId={selectedNodeId}
            globalInput={globalInput}
            onGlobalInputChange={onGlobalInputChange}
          />
        ) : (
          <div style={infoStyle}>
            No settings defined for node type: <strong>{node.type}</strong>
          </div>
        )}
      </div>
    </div>
  );
}