// components/register_nodes.ts

import StartNode from "./nodes/StartNode";
import TypeConverterNode from "./nodes/TypeConverterNode";
import OutputNode from "./nodes/OutputNode";

// NEW
import RagRetrieveNode from "./nodes/RagRetrieveNode";
import RagGenerateNode from "./nodes/RagGenerateNode";

export const nodeTypes = {
  start: StartNode,
  type_converter: TypeConverterNode,
  output: OutputNode,

  rag_retrieve: RagRetrieveNode,
  rag_generate: RagGenerateNode,
};