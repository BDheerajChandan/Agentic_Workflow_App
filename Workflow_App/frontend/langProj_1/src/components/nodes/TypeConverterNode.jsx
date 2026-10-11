// TypeConverterNode.jsx

import React, { useState } from "react";

import {
  Handle,
  Position,
  useReactFlow,
} from "reactflow";

const OPERATIONS = [

  {
    value: "upper",
    label: "Uppercase",
  },

  {
    value: "lower",
    label: "Lowercase",
  },

  {
    value: "str",
    label: "To String",
  },

  {
    value: "len",
    label: "Length",
  },

  {
    value: "split",
    label: "Split Words",
  },

  {
    value: "strip",
    label: "Strip Whitespace",
  },
];

export default function TypeConverterNode({
  id,
  data,
}) {

  const { setNodes } = useReactFlow();

  const [operation, setOperation] =
    useState(data.operation || "upper");

  const [splitParam, setSplitParam] =
    useState(data.split_param || " ");

  // ==========================================
  // UPDATE NODE DATA
  // ==========================================

  const updateNodeData = (
    updates
  ) => {

    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                ...updates,
              },
            }
          : n
      )
    );
  };

  // ==========================================
  // OPERATION CHANGE
  // ==========================================

  const onOperationChange = (
    e
  ) => {

    const val = e.target.value;

    setOperation(val);

    updateNodeData({
      operation: val,
    });
  };

  // ==========================================
  // SPLIT PARAM CHANGE
  // ==========================================

  const onSplitParamChange = (
    e
  ) => {

    const val = e.target.value;

    setSplitParam(val);

    updateNodeData({
      split_param: val,
    });
  };

  const opLabel =
    OPERATIONS.find(
      (o) =>
        o.value === operation
    )?.label || operation;

  return (

    <div style={box}>

      <Handle
        type="target"
        position={Position.Left}
        style={handleStyle(
          "#a78bfa"
        )}
      />

      {/* HEADER */}

      <div style={header}>

        <span style={icon}>
          ⚙
        </span>

        <span style={title}>
          Type Converter
        </span>

      </div>

      {/* BADGE */}

      <div style={badge}>
        {opLabel}
      </div>

      {/* SELECT */}

      <select
        value={operation}
        onChange={
          onOperationChange
        }
        style={select}
      >

        {OPERATIONS.map((op) => (

          <option
            key={op.value}
            value={op.value}
          >
            {op.label}
          </option>

        ))}

      </select>

      {/* ========================================= */}
      {/* CONDITIONAL PARAM FIELD */}
      {/* ========================================= */}

      {operation === "split" && (

        <div
          style={{
            marginTop: 10,
          }}
        >

          <label
            style={label}
          >
            Split Parameter
          </label>

          <input
            value={splitParam}
            onChange={
              onSplitParamChange
            }
            placeholder="Enter split char"
            style={input}
          />

        </div>

      )}

      <Handle
        type="source"
        position={Position.Right}
        style={handleStyle(
          "#a78bfa"
        )}
      />

    </div>
  );
}

// ==========================================
// STYLES
// ==========================================

const handleStyle = (
  color
) => ({
  width: 12,
  height: 12,
  background: color,
  border:
    "2px solid #1e1b4b",
});

const box = {
  padding: "14px 16px",
  borderRadius: 14,
  background:
    "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
  color: "white",
  border:
    "1.5px solid #4c1d95",
  minWidth: 220,
  boxShadow:
    "0 4px 24px rgba(139,92,246,0.25)",
};

const header = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

const icon = {
  fontSize: 16,
};

const title = {
  fontWeight: 700,
  fontSize: 13,
  color: "#c4b5fd",
  letterSpacing: "0.04em",
  textTransform:
    "uppercase",
};

const badge = {
  fontSize: 11,
  color: "#a78bfa",
  background:
    "rgba(139,92,246,0.15)",
  border:
    "1px solid rgba(139,92,246,0.3)",
  borderRadius: 6,
  padding: "2px 8px",
  display: "inline-block",
  marginBottom: 10,
};

const select = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  background: "#1e1b4b",
  color: "#e9d5ff",
  border:
    "1px solid #4c1d95",
  fontSize: 13,
  cursor: "pointer",
  outline: "none",
};

const label = {
  display: "block",
  fontSize: 11,
  marginBottom: 5,
  color: "#c4b5fd",
};

const input = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#1e1b4b",
  color: "white",
  border:
    "1px solid #4c1d95",
  outline: "none",
};