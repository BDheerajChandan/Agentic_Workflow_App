// src/registry/useNodeData.js

import { useStore } from "reactflow";

export default function useNodeData(id) {
  return useStore((s) => s.nodeInternals.get(id)?.data);
}