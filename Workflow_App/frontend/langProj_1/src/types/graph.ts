// types\graph.ts

export type NodeType =
  | "start"
  | "prompt"
  | "llm"
  | "type_converter"
  | "output"
  | "rag_retrieve"
  | "rag_generate";

export interface GraphNode {
  id: string;
  type: NodeType;
  data: Record<string, any>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  source: string;
  target: string;
  id?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  input: any;
  flow_id?: number | null;
}

export type SourceLocality = "local" | "nonlocal";
export type SourceType = "pdf" | "docx" | "pptx" | "txt" | "html" | "url" | "";

export interface RagRetrieveConfig {
  source_locality: SourceLocality;
  // local
  local_path: string;
  // nonlocal
  source: string;
  source_type: SourceType;
  // shared
  chunk_size: number;
  chunk_overlap: number;
  k: number;
}