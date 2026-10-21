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

import StartSettings from "./settings/startSettings.jsx";
import TypeConverterSettings from "./settings/typeConverterSettings.jsx";
import OutputSettings from "./settings/outputSettings.jsx";
import RagRetrieveSettings from "./settings/ragRetrieveSettings.jsx";
import RagGenerateSettings from "./settings/ragGenerateSettings.jsx";
import Base64Settings from "./settings/base64Settings.jsx";
import GeoTemperatureSettings from "./settings/geoTemperatureSettings.jsx";
import GeoLocationSettings from "./settings/geoLocationSettings.jsx";

export const nodeTypes = {
  start: StartNode,
  type_converter: TypeConverterNode,
  output: OutputNode,

  rag_retrieve: RagRetrieveNode,
  rag_generate: RagGenerateNode,

  base64: Base64Node,
  geo_temperature: GeoTemperatureNode,
  geo_location: GeoLocationNode,
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
]);

// Default node.data applied when a node is dropped on the canvas.
export const nodeDefaults: Record<string, Record<string, any>> = {
  base64: { operation: "encode", input_value: "" },
  geo_temperature: {
    latitude: "",
    longitude: "",
    forecast_hours: 5,
    timeout: 10,
    repeat_updates: false,
    update_interval: 1,
    update_cycles: 3,
  },
  geo_location: { location_name: "", timeout: 15, limit: 1, address_details: true },
};

// Extra sidebar entries (appended to the canvas sidebar list).
export const extraSidebarNodes = [
  { type: "base64",          label: "Base64 E/D",      icon: "🔐", color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.3)", desc: "Encode / decode text" },
  { type: "geo_temperature", label: "Geo Temperature", icon: "🌡", color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.3)", desc: "Weather by lat/long" },
  { type: "geo_location",    label: "Geo Location",    icon: "📍", color: "#2dd4bf", bg: "rgba(45,212,191,0.08)", border: "rgba(45,212,191,0.3)", desc: "Address to coordinates" },
];