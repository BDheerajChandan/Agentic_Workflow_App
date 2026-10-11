// src/registry/node_registration.ts
// Single place to register a new node: its canvas component + its settings component.

import StartNode from "../nodes/start/StartNode";
import TypeConverterNode from "../nodes/type_converter/TypeConverterNode.jsx";
import OutputNode from "../nodes/output/OutputNode";
import RagRetrieveNode from "../nodes/rag_retrieve/RagRetrieveNode.jsx";
import RagGenerateNode from "../nodes/rag_generate/RagGenerateNode";

import StartSettings from "./settings/startSettings.jsx";
import TypeConverterSettings from "./settings/typeConverterSettings.jsx";
import OutputSettings from "./settings/outputSettings.jsx";
import RagRetrieveSettings from "./settings/ragRetrieveSettings.jsx";
import RagGenerateSettings from "./settings/ragGenerateSettings.jsx";

export const nodeTypes = {
  start: StartNode,
  type_converter: TypeConverterNode,
  output: OutputNode,

  rag_retrieve: RagRetrieveNode,
  rag_generate: RagGenerateNode,
};

export const settingsRegistry: Record<string, any> = {
  start: StartSettings,
  type_converter: TypeConverterSettings,
  output: OutputSettings,

  rag_retrieve: RagRetrieveSettings,
  rag_generate: RagGenerateSettings,
};