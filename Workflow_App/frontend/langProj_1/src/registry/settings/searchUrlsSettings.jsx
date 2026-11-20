// src/registry/settings/searchUrlsSettings.jsx
// No Search Query input. Query = mapped "Search Query" (when Variables ▸ Enable is on),
// otherwise the connected previous node's output. Mapping is optional.

import React, { useEffect, useState } from "react";
import { getSearchProviders, validateSearchRegex } from "../../services/api";
import { Field, SelectField } from "./fields";
import { infoBox, sectionNote } from "./styles";

const SAFE = [
  { value: "on", label: "On" },
  { value: "moderate", label: "Moderate" },
  { value: "off", label: "Off" },
];

const FALLBACK = [
  { value: "duckduckgo", label: "DuckDuckGo", available: true },
  { value: "google", label: "Google", available: true },
  { value: "both", label: "Both (merged, de-duplicated)", available: true },
];

export default function SearchUrlsSettings({ localData, patch }) {
  const [providers, setProviders] = useState(FALLBACK);
  const [regexState, setRegexState] = useState({ valid: true, error: "" });

  const provider = localData.provider || "duckduckgo";
  const count = localData.count ?? 5;
  const regex = localData.url_regex ?? "";
  const info = providers.find((p) => p.value === provider);

  useEffect(() => {
    let cancelled = false;
    getSearchProviders()
      .then((d) => { if (!cancelled) setProviders(d.providers || FALLBACK); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!regex.trim()) { setRegexState({ valid: true, error: "" }); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      validateSearchRegex(regex)
        .then((d) => { if (!cancelled) setRegexState({ valid: d.valid, error: d.error || "" }); })
        .catch(() => {});
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [regex]);

  const n = Number(count);
  const errors = [
    !Number.isInteger(n) || n < 1 || n > 50 ? "Number of URLs must be a whole number between 1 and 50." : "",
    !regexState.valid ? regexState.error : "",
    Number(localData.timeout ?? 30) < 1 || Number(localData.timeout ?? 30) > 60
      ? "Timeout must be between 1 and 60 seconds." : "",
    !Number.isInteger(Number(localData.retries ?? 2)) || Number(localData.retries ?? 2) < 0 || Number(localData.retries ?? 2) > 5
      ? "Retries must be a whole number between 0 and 5." : "",
  ].filter(Boolean);

  return (
    <>
      <div style={sectionNote}>
        Search query: the output of the connected previous node (e.g. the Start input) is used.
        Optionally tick Variables ▸ Enable ▸ Input Value Mapping and map a variable to "Search Query" to override it.
        Returns up to N unique http(s) URLs; the regex is applied to the URL only.
      </div>

      <SelectField
        label="Search Provider"
        value={provider}
        onChange={(val) => patch({ provider: val })}
        options={providers.map((p) => ({
          value: p.value,
          label: p.available ? p.label : `${p.label} (not installed)`,
        }))}
      />
      {info && info.available === false && (
        <div style={infoBox(true)}>⚠ Not installed on the backend. Run: {info.install}</div>
      )}

      <Field
        label="Number of URLs (1–50)"
        type="number"
        value={count}
        onChange={(val) => patch({ count: val })}
      />

      <Field
        label="URL Regex Pattern (optional)"
        value={regex}
        onChange={(val) => patch({ url_regex: val })}
        placeholder={"^https?://(www\\.)?example\\.com/"}
      />
      {regex.trim() && regexState.valid && <div style={infoBox(false)}>✓ Valid regex</div>}

      <SelectField
        label="Safe Search"
        value={localData.safesearch || "moderate"}
        onChange={(val) => patch({ safesearch: val })}
        options={SAFE}
      />
      <Field
        label="Region (e.g. us-en, in-en)"
        value={localData.region ?? "us-en"}
        onChange={(val) => patch({ region: val })}
      />
      <Field
        label="Timeout per attempt (seconds, 1–60)"
        type="number"
        value={localData.timeout ?? 30}
        onChange={(val) => patch({ timeout: val })}
      />
      <Field
        label="Retries on network failure (0–5)"
        type="number"
        value={localData.retries ?? 2}
        onChange={(val) => patch({ retries: val })}
      />

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}