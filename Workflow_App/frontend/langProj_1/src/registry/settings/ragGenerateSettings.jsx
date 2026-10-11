// src/registry/settings/ragGenerateSettings.jsx

import React from "react";
import { SelectField, TextAreaField, ModeToggle, ApiKeyField } from "./fields";
import { infoStyle } from "./styles";

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini",   label: "gpt-4o-mini" },
  { value: "gpt-4o",        label: "gpt-4o" },
  { value: "gpt-4.1",       label: "gpt-4.1" },
  { value: "gpt-4.1-mini",  label: "gpt-4.1-mini" },
  { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo" },
];

export default function RagGenerateSettings({ localData, patch, selectedNodeId }) {
  const configMode = localData.config_mode || "static";

  return (
    <>
      <ModeToggle
        mode={configMode}
        onChange={(val) => patch({ config_mode: val })}
      />

      {configMode === "static" && (
        <div style={infoStyle}>
          RAG Generate uses the LLM configured in the backend.
        </div>
      )}

      {configMode === "dynamic" && (
        <>
          <ApiKeyField
            key={`${selectedNodeId}-api`}
            value={localData.api_key}
            onChange={(val) => patch({ api_key: val })}
          />
          <SelectField
            label="Model Name"
            value={localData.model_name || MODEL_OPTIONS[0].value}
            onChange={(val) => patch({ model_name: val })}
            options={MODEL_OPTIONS}
          />
          <TextAreaField
            label="System Prompt"
            value={localData.system_prompt}
            onChange={(val) => patch({ system_prompt: val })}
            placeholder="Enter system prompt…"
            rows={4}
          />
          <TextAreaField
            label="User Prompt"
            value={localData.user_prompt}
            onChange={(val) => patch({ user_prompt: val })}
            placeholder="Enter user prompt… (use {question} to insert the question)"
            rows={4}
          />
        </>
      )}
    </>
  );
}