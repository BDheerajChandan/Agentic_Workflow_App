// src/registry/settings/ragGenerateSettings.jsx

import React from "react";
import {
  TextAreaField, ModeToggle, ApiKeyField, ProviderField, ModelField, ENV_KEY_NAMES,
} from "./fields";
import { infoStyle } from "./styles";

const DEFAULT_MODELS = { openai: "gpt-4o-mini", gemini: "gemini-2.5-flash" };

export default function RagGenerateSettings({ localData, patch, selectedNodeId }) {
  const configMode = localData.config_mode || "static";
  const provider   = localData.provider || "openai";

  return (
    <>
      <ModeToggle
        mode={configMode}
        onChange={(val) => patch({ config_mode: val })}
      />

      <ProviderField
        value={provider}
        onChange={(val) => patch({ provider: val, model_name: "", api_key: "" })}
      />

      {configMode === "static" && (
        <div style={infoStyle}>
          Static: {ENV_KEY_NAMES[provider]} from the backend .env file is used.
        </div>
      )}

      {configMode === "dynamic" && (
        <ApiKeyField
          key={`${selectedNodeId}-api`}
          value={localData.api_key}
          onChange={(val) => patch({ api_key: val })}
        />
      )}

      <ModelField
        label="Model Name"
        mode={configMode}
        provider={provider}
        apiKey={localData.api_key}
        purpose="chat"
        value={localData.model_name}
        onChange={(val) => patch({ model_name: val })}
        defaultValue={DEFAULT_MODELS[provider]}
      />

      {configMode === "dynamic" && (
        <>
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