// src/registry/settings/useProviderModels.js

import { useEffect, useState } from "react";
import { listProviderModels } from "../../services/api";

export default function useProviderModels({ mode, provider, apiKey, purpose }) {
  const [state, setState] = useState({ models: [], loading: false, error: "" });

  const dynamic  = mode === "dynamic";
  const key      = dynamic ? (apiKey || "").trim() : "";
  const needsKey = dynamic && !key;

  useEffect(() => {
    setState({ models: [], loading: false, error: "" });
    if (needsKey) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await listProviderModels({
          provider,
          mode: dynamic ? "dynamic" : "static",
          purpose,
          api_key: dynamic ? key : undefined,
        });
        if (!cancelled) setState({ models: res.models || [], loading: false, error: "" });
      } catch (err) {
        if (!cancelled) {
          setState({
            models: [],
            loading: false,
            error: err?.response?.data?.detail || "Failed to load models.",
          });
        }
      }
    }, dynamic ? 600 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dynamic, provider, key, purpose, needsKey]);

  return { ...state, needsKey };
}