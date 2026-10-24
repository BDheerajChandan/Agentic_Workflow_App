// src/registry/settings/timeOperationSettings.jsx

import React, { useCallback, useEffect, useState } from "react";
import {
  signalTimeOperation, listTimePauses, resumeTimePause, cancelTimePause,
} from "../../services/api";
import { Field, SelectField } from "./fields";
import {
  fieldWrap, lbl, miniBtn, miniBtnDanger, rowBox, infoBox, sectionNote,
} from "./styles";

const OPERATIONS = [
  { value: "duration", label: "Wait for Duration" },
  { value: "until",    label: "Wait Until Scheduled Time" },
  { value: "hold",     label: "Hold / Pause" },
];

const UNITS = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours",   label: "Hours" },
];

const PAST = [
  { value: "error",    label: "Fail the run" },
  { value: "continue", label: "Continue immediately" },
];

const ON_TIMEOUT = [
  { value: "fail",     label: "Fail the run" },
  { value: "continue", label: "Continue" },
];

const TIMEZONES = [
  { value: "",                    label: "Server local time" },
  { value: "UTC",                 label: "UTC" },
  { value: "Asia/Kolkata",        label: "Asia/Kolkata (IST)" },
  { value: "Asia/Dubai",          label: "Asia/Dubai" },
  { value: "Asia/Singapore",      label: "Asia/Singapore" },
  { value: "Asia/Tokyo",          label: "Asia/Tokyo" },
  { value: "Europe/London",       label: "Europe/London" },
  { value: "Europe/Berlin",       label: "Europe/Berlin" },
  { value: "America/New_York",    label: "America/New_York" },
  { value: "America/Chicago",     label: "America/Chicago" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Australia/Sydney",    label: "Australia/Sydney" },
];

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

export default function TimeOperationSettings({ localData, patch, flowId, selectedNodeId }) {
  const [msg,    setMsg]    = useState({ text: "", err: false });
  const [pauses, setPauses] = useState([]);

  const op = localData.operation || "duration";
  const tz = localData.timezone || "";

  const tzOptions = TIMEZONES.some((t) => t.value === tz)
    ? TIMEZONES
    : [...TIMEZONES, { value: tz, label: tz }];

  const loadPauses = useCallback(async () => {
    if (flowId == null) return;
    try {
      const d = await listTimePauses(flowId, selectedNodeId);
      setPauses(d.pauses || []);
    } catch {
      /* ignore */
    }
  }, [flowId, selectedNodeId]);

  useEffect(() => {
    loadPauses();
    const t = setInterval(loadPauses, 5000);
    return () => clearInterval(t);
  }, [loadPauses]);

  const pastWarning =
    op === "until" && !tz && localData.scheduled_date && localData.scheduled_clock &&
    new Date(`${localData.scheduled_date}T${localData.scheduled_clock}`) < new Date()
      ? "The selected date and time is in the past." : "";

  const errors = [
    op === "duration" && (localData.duration === undefined || localData.duration === "" || Number(localData.duration) < 0)
      ? "Duration must be zero or greater." : "",
    op === "until" && !localData.scheduled_date ? "Date is required." : "",
    op === "until" && !localData.scheduled_clock ? "Time is required." : "",
    op === "hold" && localData.hold_timeout_seconds !== undefined && localData.hold_timeout_seconds !== "" &&
      Number(localData.hold_timeout_seconds) < 0
      ? "Hold timeout must be zero or greater." : "",
    Number(localData.max_wait_seconds ?? 86400) <= 0 ? "Maximum wait must be greater than 0." : "",
  ].filter(Boolean);

  const run = async (fn, okFallback) => {
    try {
      const res = await fn();
      setMsg({ text: res?.message || okFallback, err: false });
    } catch (err) {
      setMsg({ text: err?.response?.data?.detail || "Request failed.", err: true });
    }
    loadPauses();
  };

  const signalInline = (action) =>
    run(
      () => signalTimeOperation({ flow_id: flowId ?? null, node_id: selectedNodeId, action }),
      "Done."
    );

  return (
    <>
      <SelectField
        label="Operation *"
        value={op}
        onChange={(val) => patch({ operation: val })}
        options={OPERATIONS}
      />

      {op === "duration" && (
        <>
          <Field
            label="Duration *"
            type="number"
            value={localData.duration ?? 5}
            onChange={(val) => patch({ duration: val })}
          />
          <SelectField
            label="Unit"
            value={localData.unit || "seconds"}
            onChange={(val) => patch({ unit: val })}
            options={UNITS}
          />
        </>
      )}

      {op === "until" && (
        <>
          <Field
            label="Date *"
            type="date"
            value={localData.scheduled_date}
            onChange={(val) => patch({ scheduled_date: val })}
          />
          <Field
            label="Time *"
            type="time"
            value={localData.scheduled_clock}
            onChange={(val) => patch({ scheduled_clock: val })}
          />
          <SelectField
            label="Timezone"
            value={tz}
            onChange={(val) => patch({ timezone: val })}
            options={tzOptions}
          />
          <SelectField
            label="If Time Is In The Past"
            value={localData.past_behavior || "error"}
            onChange={(val) => patch({ past_behavior: val })}
            options={PAST}
          />
          {pastWarning && <div style={infoBox(true)}>⚠ {pastWarning}</div>}
        </>
      )}

      {op === "hold" && (
        <>
          <div style={sectionNote}>
            The run pauses at this node and is saved. Resume it from the list below
            (or leave the timeout empty to wait until resumed).
          </div>
          <Field
            label="Hold Timeout (seconds, optional)"
            type="number"
            value={localData.hold_timeout_seconds}
            onChange={(val) => patch({ hold_timeout_seconds: val === 0 ? "" : val })}
            placeholder="empty = no timeout"
          />
          <SelectField
            label="If Not Resumed In Time"
            value={localData.hold_on_timeout || "fail"}
            onChange={(val) => patch({ hold_on_timeout: val })}
            options={ON_TIMEOUT}
          />
        </>
      )}

      <Field
        label="Maximum Wait (seconds)"
        type="number"
        value={localData.max_wait_seconds ?? 86400}
        onChange={(val) => patch({ max_wait_seconds: val })}
      />

      <div style={fieldWrap}>
        <label style={lbl}>Paused Runs At This Node</label>
        {pauses.length === 0 && <div style={sectionNote}>No paused runs.</div>}
        {pauses.map((p) => (
          <div key={p.pause_id} style={rowBox}>
            <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 6 }}>
              #{p.pause_id} · {p.operation} ·{" "}
              {p.resume_at ? `resumes ${fmt(p.resume_at)}` : "waiting for resume"}
              {p.hold_expires_at ? ` · expires ${fmt(p.hold_expires_at)}` : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                style={miniBtn}
                onClick={() => run(() => resumeTimePause(p.pause_id), "Resume started.")}
              >
                ▶ Resume
              </button>
              <button
                type="button"
                style={miniBtnDanger}
                onClick={() => run(() => cancelTimePause(p.pause_id), "Cancelled.")}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button type="button" style={miniBtn} onClick={() => signalInline("resume")}>
            ▶ Skip Short Wait
          </button>
          <button type="button" style={miniBtnDanger} onClick={() => signalInline("cancel")}>
            ✕ Cancel Short Wait
          </button>
        </div>
        {msg.text && <div style={infoBox(msg.err)}>{msg.text}</div>}
      </div>

      <div style={sectionNote}>
        Waits over 30 s and Hold / Pause are saved in the database and resumed by the
        server scheduler (restart-safe, resumed exactly once). They require a saved workflow.
      </div>

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}