// src/registry/settings/geoLocationSettings.jsx

import React from "react";
import { Field, ModeToggle } from "./fields";
import { fieldWrap, checkRow, infoBox, sectionNote } from "./styles";

export default function GeoLocationSettings({ localData, patch }) {
  const mode = localData.config_mode || "static";
  const addressDetails = localData.address_details ?? true;

  const errors = [
    mode === "static" && !(localData.location_name || "").trim()
      ? "Location name / address is required." : "",
    Number(localData.timeout ?? 15) <= 0 ? "Request timeout must be greater than 0." : "",
    Number(localData.limit ?? 1) < 1 ? "Result limit must be at least 1." : "",
  ].filter(Boolean);

  return (
    <>
      <ModeToggle mode={mode} onChange={(val) => patch({ config_mode: val })} />

      {mode === "static" ? (
        <>
          <div style={sectionNote}>
            Static: the location below is used. Mappings and connected values are ignored.
          </div>
          <Field
            label="Location Name / Address *"
            value={localData.location_name}
            onChange={(val) => patch({ location_name: val })}
            placeholder="e.g. RK Beach"
          />
        </>
      ) : (
        <div style={sectionNote}>
          Dynamic: the location is resolved at run time from Input Value Mapping
          (target "Location Name / Address") or a connected node output. The saved
          static value is kept but not used.
        </div>
      )}

      <Field
        label="Request Timeout (seconds)"
        type="number"
        value={localData.timeout ?? 15}
        onChange={(val) => patch({ timeout: val })}
      />
      <Field
        label="Result Limit"
        type="number"
        value={localData.limit ?? 1}
        onChange={(val) => patch({ limit: val })}
      />

      <div style={fieldWrap}>
        <label style={checkRow}>
          <input
            type="checkbox"
            checked={!!addressDetails}
            onChange={(e) => patch({ address_details: e.target.checked })}
          />
          Address Details
        </label>
      </div>

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}