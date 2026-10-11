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
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  input: any;
}