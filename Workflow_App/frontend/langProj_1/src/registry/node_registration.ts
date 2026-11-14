// src/registry/node_registration.ts
// Single place to register a new node: its canvas component + its settings component.

import StartNode from "../nodes/start/StartNode";
import TypeConverterNode from "../nodes/type_converter/TypeConverterNode.jsx";
import OutputNode from "../nodes/output/OutputNode";
import RagRetrieveNode from "../nodes/rag_retrieve/RagRetrieveNode.jsx";
import RagGenerateNode from "../nodes/rag_generate/RagGenerateNode";
import Base64Node from "../nodes/base64/Base64Node.jsx";
import GeoTemperatureNode from "../nodes/geo_temperature/GeoTemperatureNode.jsx";
import GeoLocationNode from "../nodes/geo_location/GeoLocationNode.jsx";
import PythonFunctionsNode from "../nodes/python_functions/PythonFunctionsNode.jsx";
import TimeOperationNode from "../nodes/time_operation/TimeOperationNode.jsx";
import HitlNode from "../nodes/hitl/HitlNode.jsx";
import FileReaderNode from "../nodes/file_reader/FileReaderNode.jsx";
import IfElseNode from "../nodes/if_else/IfElseNode.jsx";
import SwitchNode from "../nodes/switch/SwitchNode.jsx";
import AqiNode from "../nodes/aqi/AqiNode.jsx";
import NlpNode from "../nodes/nlp/NlpNode.jsx";
import SearchUrlsNode from "../nodes/search_urls/SearchUrlsNode.jsx";

import StartSettings from "./settings/startSettings.jsx";
import TypeConverterSettings from "./settings/typeConverterSettings.jsx";
import OutputSettings from "./settings/outputSettings.jsx";
import RagRetrieveSettings from "./settings/ragRetrieveSettings.jsx";
import RagGenerateSettings from "./settings/ragGenerateSettings.jsx";
import Base64Settings from "./settings/base64Settings.jsx";
import GeoTemperatureSettings from "./settings/geoTemperatureSettings.jsx";
import GeoLocationSettings from "./settings/geoLocationSettings.jsx";
import PythonFunctionsSettings from "./settings/pythonFunctionsSettings.jsx";
import TimeOperationSettings from "./settings/timeOperationSettings.jsx";
import HitlSettings from "./settings/hitlSettings.jsx";
import FileReaderSettings from "./settings/fileReaderSettings.jsx";
import IfElseSettings from "./settings/ifElseSettings.jsx";
import SwitchSettings from "./settings/switchSettings.jsx";
import AqiSettings from "./settings/aqiSettings.jsx";
import NlpSettings from "./settings/nlpSettings.jsx";
import SearchUrlsSettings from "./settings/searchUrlsSettings.jsx";

export const nodeTypes = {
  start: StartNode,
  type_converter: TypeConverterNode,
  output: OutputNode,

  rag_retrieve: RagRetrieveNode,
  rag_generate: RagGenerateNode,

  base64: Base64Node,
  geo_temperature: GeoTemperatureNode,
  geo_location: GeoLocationNode,
  python_functions: PythonFunctionsNode,
  time_operation: TimeOperationNode,
  hitl: HitlNode,
  file_reader: FileReaderNode,
  if_else: IfElseNode,
  switch: SwitchNode,
  aqi: AqiNode,
  nlp: NlpNode,
  search_urls: SearchUrlsNode,
};

export const settingsRegistry: Record<string, any> = {
  start: StartSettings,
  type_converter: TypeConverterSettings,
  output: OutputSettings,

  rag_retrieve: RagRetrieveSettings,
  rag_generate: RagGenerateSettings,

  base64: Base64Settings,
  geo_temperature: GeoTemperatureSettings,
  geo_location: GeoLocationSettings,
  python_functions: PythonFunctionsSettings,
  time_operation: TimeOperationSettings,
  hitl: HitlSettings,
  file_reader: FileReaderSettings,
  if_else: IfElseSettings,
  switch: SwitchSettings,
  aqi: AqiSettings,
  nlp: NlpSettings,
  search_urls: SearchUrlsSettings,
};

// Nodes whose Settings Panel shows the Variable (Assign / Read) section.
// Add a node type here to enable variables for it — no other change required.
export const variableCapableNodes = new Set<string>([
  "start",
  "type_converter",
  "output",
  "rag_retrieve",
  "rag_generate",
  "base64",
  "geo_temperature",
  "geo_location",
  "python_functions",
  "time_operation",
  "hitl",
  "file_reader",
  "if_else",
  "switch",
  "aqi",
  "nlp",
  "search_urls",
]);

// Default node.data applied when a node is dropped on the canvas.
export const nodeDefaults: Record<string, Record<string, any>> = {
  base64: { config_mode: "static", operation: "encode", input_value: "" },
  geo_temperature: {
    config_mode: "static",
    latitude: "",
    longitude: "",
    forecast_hours: 5,
    timeout: 10,
    repeat_updates: false,
    update_interval: 1,
    update_cycles: 3,
  },
  geo_location: {
    config_mode: "static",
    location_name: "",
    timeout: 15,
    limit: 1,
    address_details: true,
  },
  python_functions: {
    source_mode: "static",
    code: "def main(inputs, context):\n    result = inputs\n    return result\n",
    file_name: "",
    file_code: "",
    input_source: "current_value",
    timeout: 10,
    memory_mb: 256,
  },
  time_operation: {
    operation: "duration",
    duration: 5,
    unit: "seconds",
    scheduled_date: "",
    scheduled_clock: "",
    timezone: "",
    past_behavior: "error",
    hold_timeout_seconds: "",
    hold_on_timeout: "fail",
    max_wait_seconds: 86400,
  },
  file_reader: { include_results: true },
  if_else: {
    description: "",
    true_label: "True",
    false_label: "False",
    conditions: [{ id: "c1", description: "", left: "", operator: "==", right: "", expression: "", logic: "AND" }],
  },
  search_urls: {
    provider: "duckduckgo",
    count: 5,
    url_regex: "",
    safesearch: "moderate",
    region: "us-en",
    timeout: 30,
  },
  nlp: { features: [], options: {}, allow_model_download: false },
  aqi: {
    country: "india",
    country_name: "India",
    state: "",
    state_name: "",
    city: "",
    city_name: "",
    enable_download: false,
    formats: [],
    output_folder: "",
  },
  switch: {
    input: "",
    cases: [{ id: "c1", value: "", type: "auto", label: "" }],
    default: { label: "Default" },
  },
  hitl: {
    feature: "approval",
    approval: { instructions: "" },
    suggestion: { instructions: "", required: false },
    questions: { source: "static", questions: [], file_name: "", file_questions: [] },
  },
};

// Extra sidebar entries (appended to the canvas sidebar list).
export const extraSidebarNodes = [
  { type: "base64",          label: "Base64 E/D",      icon: "🔐", color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.3)", desc: "Encode / decode text" },
  { type: "geo_temperature", label: "Geo Temperature", icon: "🌡", color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.3)", desc: "Weather by lat/long" },
  { type: "geo_location",    label: "Geo Location",    icon: "📍", color: "#2dd4bf", bg: "rgba(45,212,191,0.08)", border: "rgba(45,212,191,0.3)", desc: "Address to coordinates" },
  { type: "python_functions", label: "Python Functions", icon: "🐍", color: "#4ade80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.3)", desc: "Run sandboxed Python" },
  { type: "time_operation",   label: "Time Operation",   icon: "⏱", color: "#f472b6", bg: "rgba(244,114,182,0.08)", border: "rgba(244,114,182,0.3)", desc: "Wait / schedule / hold" },
  { type: "file_reader",      label: "File Reader",      icon: "📄", color: "#22d3ee", bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.3)",  desc: "Extract file content" },
  { type: "hitl",             label: "HITL",             icon: "🙋", color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.3)",  desc: "Approval / suggestion / questions" },
  { type: "if_else",          label: "If-Else",          icon: "⑂",  color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.3)",  desc: "Multi-condition branch" },
  { type: "switch",           label: "Switch",           icon: "⇶",  color: "#e879f9", bg: "rgba(232,121,249,0.08)", border: "rgba(232,121,249,0.3)", desc: "Multi-case routing" },
  { type: "aqi",              label: "AQI",              icon: "🌫", color: "#a3e635", bg: "rgba(163,230,53,0.08)",  border: "rgba(163,230,53,0.3)",  desc: "City air quality + download" },
  { type: "nlp",              label: "NLP",              icon: "🧬", color: "#fb7185", bg: "rgba(251,113,133,0.08)", border: "rgba(251,113,133,0.3)", desc: "19 selectable NLP features" },
  { type: "search_urls",      label: "Search_URLs",      icon: "🔎", color: "#38bdf8", bg: "rgba(56,189,248,0.08)",  border: "rgba(56,189,248,0.3)",  desc: "DuckDuckGo / Google → URLs" },
];