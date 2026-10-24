// src/registry/settings/geoTemperatureSettings.jsx

import React from "react";
import { Field, ModeToggle } from "./fields";
import { fieldWrap, checkRow, infoBox, sectionNote } from "./styles";

const rangeError = (value, lo, hi, label) => {
  if (value === undefined || value === null || String(value).trim() === "") return `${label} is required.`;
  const n = Number(value);
  if (Number.isNaN(n)) return `${label} must be a number.`;
  if (n < lo || n > hi) return `${label} must be between ${lo} and ${hi}.`;
  return "";
};

const positiveError = (value, label) =>
  value !== undefined && value !== null && Number(value) <= 0
    ? `${label} must be greater than 0.`
    : "";

export default function GeoTemperatureSettings({ localData, patch }) {
  const mode   = localData.config_mode || "static";
  const repeat = !!localData.repeat_updates;

  const errors = [
    mode === "static" ? rangeError(localData.latitude,  -90,  90,  "Latitude")  : "",
    mode === "static" ? rangeError(localData.longitude, -180, 180, "Longitude") : "",
    positiveError(localData.forecast_hours ?? 5, "Forecast hours"),
    positiveError(localData.timeout ?? 10, "Timeout"),
    repeat ? positiveError(localData.update_interval ?? 1, "Update interval") : "",
    repeat ? positiveError(localData.update_cycles ?? 3, "Update cycles") : "",
  ].filter(Boolean);

  return (
    <>
      <ModeToggle mode={mode} onChange={(val) => patch({ config_mode: val })} />

      {mode === "static" ? (
        <>
          <div style={sectionNote}>
            Static: the Latitude and Longitude below are used. Mappings and connected
            values are ignored for these fields.
          </div>
          <Field
            label="Latitude * (-90 to 90)"
            value={localData.latitude}
            onChange={(val) => patch({ latitude: val })}
            placeholder="e.g. 20.2656"
          />
          <Field
            label="Longitude * (-180 to 180)"
            value={localData.longitude}
            onChange={(val) => patch({ longitude: val })}
            placeholder="e.g. 85.8431"
          />
        </>
      ) : (
        <div style={sectionNote}>
          Dynamic: Latitude and Longitude are resolved at run time from Input Value
          Mapping (targets "Latitude" / "Longitude") or a connected node output.
          Saved static values are kept but not used.
        </div>
      )}

      <Field
        label="Forecast Hours *"
        type="number"
        value={localData.forecast_hours ?? 5}
        onChange={(val) => patch({ forecast_hours: val })}
      />
      <Field
        label="Timeout (seconds)"
        type="number"
        value={localData.timeout ?? 10}
        onChange={(val) => patch({ timeout: val })}
      />

      <div style={fieldWrap}>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => patch({ repeat_updates: e.target.checked })}
          />
          Repeated Updates
        </label>
      </div>

      {repeat && (
        <>
          <Field
            label="Update Interval (Minutes)"
            type="number"
            value={localData.update_interval ?? 1}
            onChange={(val) => patch({ update_interval: val })}
          />
          <Field
            label="Update Cycles"
            type="number"
            value={localData.update_cycles ?? 3}
            onChange={(val) => patch({ update_cycles: val })}
          />
        </>
      )}

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}