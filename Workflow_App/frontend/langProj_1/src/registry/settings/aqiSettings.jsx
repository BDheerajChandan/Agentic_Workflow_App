// src/registry/settings/aqiSettings.jsx

import React, { useEffect, useRef, useState } from "react";
import { listAqiCountries, listAqiStates, listAqiCities } from "../../services/api";
import { Field, SelectField } from "./fields";
import {
  fieldWrap, lbl, checkRow, miniBtn, miniBtnDisabled, infoBox, sectionNote,
} from "./styles";

const FORMATS = [
  { key: "txt", label: "TXT" },
  { key: "json", label: "JSON" },
  { key: "csv", label: "CSV" },
  { key: "html", label: "HTML" },
];

const detail = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;
const nameOf = (list, slug) => list.find((i) => i.slug === slug)?.name || "";
const toSlug = (v) =>
  String(v || "").trim().toLowerCase().replace(/[\s_/]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");

const options = (items, placeholder, current, currentName) => {
  const list = items.map((i) => ({ value: i.slug, label: i.name }));
  if (current && !items.some((i) => i.slug === current)) {
    list.unshift({ value: current, label: currentName || current });
  }
  return [{ value: "", label: placeholder }, ...list];
};

export default function AqiSettings({ localData, patch }) {
  const country = localData.country || "";
  const state = localData.state || "";
  const city = localData.city || "";
  const enable = !!localData.enable_download;
  const formats = Array.isArray(localData.formats) ? localData.formats : [];

  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [load, setLoad] = useState({ s: false, c: false });
  const [err, setErr] = useState({ co: "", s: "", c: "" });
  const [meta, setMeta] = useState({ source: "", stale: false, warning: "" });
  const [tick, setTick] = useState(0);
  const force = useRef(false);

  useEffect(() => {
    let cancelled = false;
    listAqiCountries()
      .then((d) => { if (!cancelled) setCountries(d.countries || []); })
      .catch((e) => { if (!cancelled) setErr((p) => ({ ...p, co: detail(e, "Failed to load countries.") })); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setStates([]);
    if (!country) return undefined;
    let cancelled = false;
    setLoad((p) => ({ ...p, s: true }));
    setErr((p) => ({ ...p, s: "" }));
    listAqiStates(country)
      .then((d) => { if (!cancelled) setStates(d.items || []); })
      .catch((e) => { if (!cancelled) setErr((p) => ({ ...p, s: detail(e, "Failed to load states.") })); })
      .finally(() => { if (!cancelled) setLoad((p) => ({ ...p, s: false })); });
    return () => { cancelled = true; };
  }, [country]);

  useEffect(() => {
    setCities([]);
    setMeta({ source: "", stale: false, warning: "" });
    if (!country || !state) return undefined;
    let cancelled = false;
    const refresh = force.current;
    force.current = false;
    setLoad((p) => ({ ...p, c: true }));
    setErr((p) => ({ ...p, c: "" }));
    listAqiCities(country, state, refresh)
      .then((d) => {
        if (cancelled) return;
        setCities(d.items || []);
        setMeta({ source: d.source, stale: !!d.stale, warning: d.warning || "" });
      })
      .catch((e) => { if (!cancelled) setErr((p) => ({ ...p, c: detail(e, "Failed to load cities.") })); })
      .finally(() => { if (!cancelled) setLoad((p) => ({ ...p, c: false })); });
    return () => { cancelled = true; };
  }, [country, state, tick]);

  const onCountry = (slug) =>
    patch({
      country: slug, country_name: nameOf(countries, slug),
      state: "", state_name: "", city: "", city_name: "",
    });
  const onState = (slug) =>
    patch({ state: slug, state_name: nameOf(states, slug), city: "", city_name: "" });
  const onCity = (slug) => patch({ city: slug, city_name: nameOf(cities, slug) });

  const toggleFormat = (key) =>
    patch({ formats: formats.includes(key) ? formats.filter((f) => f !== key) : [...formats, key] });

  const manualCity = !load.c && (!!err.c || (!!state && cities.length === 0));
  const url = country && state && city
    ? `https://www.aqi.in/dashboard/${country}/${state}/${city}`
    : "";

  const errors = [
    !country ? "Select a country." : "",
    country && !state ? "Select a state." : "",
    state && !city ? "Select a city / district." : "",
    enable && formats.length === 0 ? "Select at least one download format." : "",
  ].filter(Boolean);

  return (
    <>
      <div style={sectionNote}>
        Country → State → City / District builds the AQI.in dashboard URL from AQI.in slugs.
        Input Value Mapping targets (Country / State / City) override the values below.
      </div>

      <SelectField
        label="Country *"
        value={country}
        onChange={onCountry}
        options={options(countries, "Select country", country, localData.country_name)}
      />
      {err.co && <div style={infoBox(true)}>⚠ {err.co}</div>}

      <SelectField
        label="State *"
        value={state}
        onChange={onState}
        options={options(
          states,
          !country ? "Select country first" : load.s ? "Loading…" : "Select state",
          state,
          localData.state_name
        )}
      />
      {err.s && <div style={infoBox(true)}>⚠ {err.s}</div>}

      <SelectField
        label="City / District *"
        value={city}
        onChange={onCity}
        options={options(
          cities,
          !state ? "Select state first" : load.c ? "Loading…" : "Select city / district",
          city,
          localData.city_name
        )}
      />
      {state && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: -6, marginBottom: 10 }}>
          <button
            type="button"
            style={{ ...miniBtn, ...(load.c ? miniBtnDisabled : {}) }}
            disabled={load.c}
            onClick={() => { force.current = true; setTick((t) => t + 1); }}
          >
            ⟳ Refresh Cities
          </button>
          {meta.source && (
            <span style={{ fontSize: 10, color: "#64748b" }}>
              {cities.length} found · {meta.source}{meta.stale ? " (stale)" : ""}
            </span>
          )}
        </div>
      )}
      {meta.warning && <div style={infoBox(true)}>⚠ Showing cached cities: {meta.warning}</div>}
      {err.c && <div style={infoBox(true)}>⚠ {err.c}</div>}

      {manualCity && (
        <Field
          label="City slug (manual entry)"
          value={city}
          onChange={(val) => patch({ city: toSlug(val), city_name: "" })}
          placeholder="e.g. bhubaneswar"
        />
      )}

      {url && (
        <div style={fieldWrap}>
          <label style={lbl}>Dashboard URL</label>
          <div style={{ ...sectionNote, wordBreak: "break-all", marginBottom: 6 }}>{url}</div>
          <a href={url} target="_blank" rel="noreferrer" style={{ ...miniBtn, textDecoration: "none", display: "inline-block" }}>
            ↗ Open in Browser
          </a>
        </div>
      )}

      <div style={fieldWrap}>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={enable}
            onChange={(e) => patch({ enable_download: e.target.checked })}
          />
          Enable Download
        </label>
      </div>

      {enable && (
        <>
          <div style={fieldWrap}>
            <label style={lbl}>Formats *</label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {FORMATS.map((f) => (
                <label key={f.key} style={checkRow}>
                  <input
                    type="checkbox"
                    checked={formats.includes(f.key)}
                    onChange={() => toggleFormat(f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
          <Field
            label="Output Folder (inside download/)"
            value={localData.output_folder}
            onChange={(val) => patch({ output_folder: val })}
            placeholder="empty = download/"
          />
          <div style={sectionNote}>
            Files are named india_&lt;state&gt;_&lt;city&gt;_AQI.&lt;ext&gt;, never overwritten
            (a timestamp is added on collision), and listed in the node output under "Downloaded Files".
          </div>
        </>
      )}

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}