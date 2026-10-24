// src/registry/settings/hitlSettings.jsx

import React, { useRef, useState } from "react";
import { validateQuestionsFile, normalizeHitlQuestion } from "../../services/api";
import { downloadJson } from "../../utils/download";
import { Field, SelectField, TextAreaField } from "./fields";
import {
  fieldWrap, lbl, miniBtn, miniBtnDanger, miniBtnDisabled,
  infoBox, sectionNote, checkRow, rowBox, rowHead,
} from "./styles";

const FEATURES = [
  { value: "approval",   label: "Approval" },
  { value: "suggestion", label: "Suggestion" },
  { value: "questions",  label: "Questions" },
];

const SOURCES = [
  { value: "static",  label: "Static — Create Questions Manually" },
  { value: "dynamic", label: "Dynamic — Upload JSON File" },
];

const QTYPES = [
  { value: "Radio",    label: "Radio" },
  { value: "Checkbox", label: "Checkbox" },
  { value: "Text",     label: "Text" },
];

const BLANK = { question: "", type: "Radio", required: false, optionsText: "", solution: [] };

const parseOptions = (text) => {
  const out = [];
  (text || "").split("\n").forEach((l) => {
    const s = l.trim();
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
};

// ─── Static questionnaire builder ─────────────────────────────────────────────
function QuestionBuilder({ questions, onChange }) {
  const [form,    setForm]    = useState(BLANK);
  const [editIdx, setEditIdx] = useState(null);
  const [error,   setError]   = useState("");
  const [busy,    setBusy]    = useState(false);

  const isText  = form.type === "Text";
  const options = parseOptions(form.optionsText);
  const upd     = (u) => setForm((f) => ({ ...f, ...u }));

  const toggleSolution = (opt) => {
    if (form.type === "Radio") return upd({ solution: [opt] });
    upd({
      solution: form.solution.includes(opt)
        ? form.solution.filter((s) => s !== opt)
        : [...form.solution, opt],
    });
  };

  const reset = () => {
    setForm(BLANK);
    setEditIdx(null);
    setError("");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { question } = await normalizeHitlQuestion({
        question: form.question,
        type: form.type,
        required: form.required,
        options: isText ? [] : options,
        solution: isText ? [] : form.solution.filter((s) => options.includes(s)),
      });
      onChange(
        editIdx == null
          ? [...questions, question]
          : questions.map((q, i) => (i === editIdx ? question : q))
      );
      reset();
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid question.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (i) => {
    const q = questions[i];
    setEditIdx(i);
    setError("");
    setForm({
      question: q.question,
      type: q.type,
      required: !!q.required,
      optionsText: (q.options || []).join("\n"),
      solution: q.solution || [],
    });
  };

  const remove = (i) => {
    onChange(questions.filter((_, idx) => idx !== i));
    reset();
  };

  return (
    <>
      <div style={rowBox}>
        <div style={rowHead}>
          <span style={{ ...lbl, marginBottom: 0 }}>
            {editIdx == null ? "New Question" : `Edit Question ${editIdx + 1}`}
          </span>
          {editIdx != null && (
            <button type="button" style={miniBtn} onClick={reset}>Cancel Edit</button>
          )}
        </div>

        <TextAreaField
          label="Question *"
          value={form.question}
          onChange={(val) => upd({ question: val })}
          placeholder="Enter question text…"
          rows={2}
        />
        <SelectField
          label="Type"
          value={form.type}
          onChange={(val) => upd({ type: val, solution: [] })}
          options={QTYPES}
        />
        <div style={fieldWrap}>
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => upd({ required: e.target.checked })}
            />
            Required
          </label>
        </div>

        {!isText && (
          <>
            <TextAreaField
              label="Options (one per line) *"
              value={form.optionsText}
              onChange={(val) => upd({ optionsText: val })}
              placeholder={"Option A\nOption B"}
              rows={4}
            />
            <div style={fieldWrap}>
              <label style={lbl}>
                Verified Solution{form.type === "Checkbox" ? "s" : ""} *
              </label>
              {options.length === 0 && (
                <div style={sectionNote}>Add options to choose the expected solution.</div>
              )}
              {options.map((opt) => (
                <label key={opt} style={{ ...checkRow, marginBottom: 4 }}>
                  <input
                    type={form.type === "Radio" ? "radio" : "checkbox"}
                    checked={form.solution.includes(opt)}
                    onChange={() => toggleSolution(opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </>
        )}

        {isText && (
          <div style={sectionNote}>
            Text answers are free-form and are marked for manual review.
          </div>
        )}

        {error && <div style={infoBox(true)}>⚠ {error}</div>}

        <button
          type="button"
          style={{ ...miniBtn, ...(busy ? miniBtnDisabled : {}) }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Checking…" : editIdx == null ? "＋ Add Question" : "✓ Save Question"}
        </button>
      </div>

      <div style={fieldWrap}>
        <label style={{ ...lbl, marginTop: 12 }}>Configured Questions ({questions.length})</label>
        {questions.length === 0 && <div style={sectionNote}>No questions added yet.</div>}
        {questions.map((q, i) => (
          <div key={i} style={rowBox}>
            <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 6, wordBreak: "break-word" }}>
              {i + 1}. {q.question}
              <span style={{ color: "#64748b" }}>
                {" "}· {q.type} · {q.required ? "Required" : "Optional"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={miniBtn} onClick={() => startEdit(i)}>Edit</button>
              <button type="button" style={miniBtnDanger} onClick={() => remove(i)}>✕ Remove</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Dynamic JSON upload ──────────────────────────────────────────────────────
function QuestionUpload({ fileName, fileQuestions, onLoaded }) {
  const fileRef = useRef(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Only .json files are supported.");
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      const info = await validateQuestionsFile(file.name, content);
      onLoaded({ file_name: info.file_name, file_questions: info.questions });
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to read the file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={fieldWrap}>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      <button
        type="button"
        style={{ ...miniBtn, ...(busy ? miniBtnDisabled : {}) }}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Validating…" : fileName ? "⟳ Replace JSON File" : "⬆ Upload JSON File"}
      </button>

      {fileName && (
        <div style={infoBox(false)}>
          📄 {fileName} · {fileQuestions.length} question(s) · stored with this workflow
        </div>
      )}
      {error && <div style={infoBox(true)}>⚠ {error}</div>}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export default function HitlSettings({ localData, patch }) {
  const feature = localData.feature || "approval";

  const sub    = (key) => localData[key] || {};
  const setSub = (key, updates) => patch({ [key]: { ...sub(key), ...updates } });

  const approval   = sub("approval");
  const suggestion = sub("suggestion");
  const questions  = sub("questions");
  const source     = questions.source || "static";

  const staticList  = questions.questions || [];
  const fileList    = questions.file_questions || [];

  const activeList = source === "dynamic" ? fileList : staticList;

  const exportQuestions = () =>
    downloadJson("questions.json", {
      questions: activeList.map((q) => ({
        question: q.question,
        type: q.type,
        required: !!q.required,
        options: q.options || [],
        solution: q.solution || [],
      })),
    });

  const errors = [
    feature === "questions" && source === "static" && staticList.length === 0
      ? "Add at least one question." : "",
    feature === "questions" && source === "dynamic" && fileList.length === 0
      ? "Upload a valid JSON file." : "",
  ].filter(Boolean);

  return (
    <>
      <SelectField
        label="Feature *"
        value={feature}
        onChange={(val) => patch({ feature: val })}
        options={FEATURES}
      />

      <div style={sectionNote}>
        The workflow pauses at this node and opens a popup. It continues after the
        response is submitted. The input comes from the connected node or Input Value Mapping.
      </div>

      {feature === "approval" && (
        <TextAreaField
          label="Instructions (optional)"
          value={approval.instructions}
          onChange={(val) => setSub("approval", { instructions: val })}
          placeholder="Shown above the input in the approval popup…"
          rows={3}
        />
      )}

      {feature === "suggestion" && (
        <>
          <TextAreaField
            label="Instructions (optional)"
            value={suggestion.instructions}
            onChange={(val) => setSub("suggestion", { instructions: val })}
            placeholder="Shown above the input in the suggestion popup…"
            rows={3}
          />
          <div style={fieldWrap}>
            <label style={checkRow}>
              <input
                type="checkbox"
                checked={!!suggestion.required}
                onChange={(e) => setSub("suggestion", { required: e.target.checked })}
              />
              Require at least one suggestion
            </label>
          </div>
        </>
      )}

      {feature === "questions" && (
        <>
          <SelectField
            label="Questions Source"
            value={source}
            onChange={(val) => setSub("questions", { source: val })}
            options={SOURCES}
          />

          {source === "static" ? (
            <QuestionBuilder
              questions={staticList}
              onChange={(list) => setSub("questions", { questions: list })}
            />
          ) : (
            <>
              <div style={sectionNote}>
                JSON: a list of questions, or an object with a "questions" list. Each item:
                question, type (Radio / Checkbox / Text), required, options, solution.
              </div>
              <QuestionUpload
                fileName={questions.file_name}
                fileQuestions={fileList}
                onLoaded={(u) => setSub("questions", u)}
              />
            </>
          )}

          <div style={fieldWrap}>
            <button
              type="button"
              style={{ ...miniBtn, ...(activeList.length ? {} : miniBtnDisabled) }}
              disabled={!activeList.length}
              title={activeList.length ? "Download the current questions as JSON" : "Configure at least one question first"}
              onClick={exportQuestions}
            >
              ⬇ Download Questions
            </button>
            {!activeList.length && (
              <div style={infoBox(true)}>⚠ No valid questions to download.</div>
            )}
          </div>
        </>
      )}

      {errors.map((e) => (
        <div key={e} style={infoBox(true)}>⚠ {e}</div>
      ))}
    </>
  );
}