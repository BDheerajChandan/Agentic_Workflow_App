// src/registry/settings/geoLocationSettings.jsx

import React from "react";
import { Field } from "./fields";
import { fieldWrap, checkRow, infoBox, sectionNote } from "./styles";

export default function GeoLocationSettings({ localData, patch }) {
  const addressDetails = localData.address_details ?? true;

  const errors = [
    Number(localData.timeout ?? 15) <= 0 ? "Request timeout must be greater than 0." : "",
    Number(localData.limit ?? 1) < 1 ? "Result limit must be at least 1." : "",
  ].filter(Boolean);

  return (
    <>
      <div style={sectionNote}>
        Location is required. It comes from a connected node or Input Value Mapping;
        the value below is used only when none is supplied.
      </div>

      <Field
        label="Location Name / Address *"
        value={localData.location_name}
        onChange={(val) => patch({ location_name: val })}
        placeholder="e.g. RK Beach"
      />
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