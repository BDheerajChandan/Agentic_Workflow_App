// src/components/files/AttachmentBar.jsx
// Shared attachment hook + button + list (Playground, Start node, Chatbot).

import React, { useEffect, useRef, useState } from "react";
import { uploadFiles } from "../../utils/uploadFiles";

let formatsPromise = null;
const loadFormats = (apiBase) => {
  if (!formatsPromise) {
    formatsPromise = fetch(`${apiBase}/files/formats`)
      .then((r) => r.json())
      .catch(() => { formatsPromise = null; return null; });
  }
  return formatsPromise;
};

const fmtSize = (n) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`;

// value/onChange are optional (controlled mode, e.g. Start node settings).
export function useAttachments(apiBase, context = {}, value, onChange) {
  const [own, setOwn] = useState([]);
  const files = value ?? own;
  const setFiles = onChange ?? setOwn;

  const filesRef = useRef(files);
  filesRef.current = files;
  const ctxRef = useRef(context);
  ctxRef.current = context;
  const inputRef = useRef(null);

  const [fmt, setFmt] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadFormats(apiBase).then((f) => { if (!cancelled) setFmt(f); });
    return () => { cancelled = true; };
  }, [apiBase]);

  const onPick = async (e) => {
    const list = [...(e.target.files || [])];
    e.target.value = "";
    if (!list.length) return;
    setError("");

    const problems = [];
    const ok = [];
    list.forEach((f) => {
      const ext = `.${f.name.split(".").pop().toLowerCase()}`;
      if (fmt?.extensions && !fmt.extensions.includes(ext)) problems.push(`${f.name}: unsupported type`);
      else if (fmt?.max_bytes && f.size > fmt.max_bytes) problems.push(`${f.name}: file too large`);
      else ok.push(f);
    });
    if (fmt?.max_files && filesRef.current.length + ok.length > fmt.max_files) {
      setError(`At most ${fmt.max_files} files can be attached.`);
      return;
    }
    if (problems.length) setError(problems.join("; "));
    if (!ok.length) return;

    setProgress(0);
    try {
      const res = await uploadFiles(apiBase, ok, ctxRef.current, setProgress);
      setFiles([...filesRef.current, ...res.files]);
      if (res.errors?.length) {
        setError(res.errors.map((x) => `${x.file_name}: ${x.detail}`).join("; "));
      }
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setProgress(null);
    }
  };

  const remove = (id) => {
    setFiles(filesRef.current.filter((f) => f.file_id !== id));
    fetch(`${apiBase}/files/${id}`, { method: "DELETE" }).catch(() => {});
  };

  return {
    files,
    progress,
    uploading: progress !== null,
    error,
    setError,
    inputRef,
    onPick,
    remove,
    clear: () => setFiles([]),
    accept: fmt?.extensions?.join(","),
  };
}

export function AttachButton({ att, disabled, style }) {
  return (
    <>
      <input
        ref={att.inputRef}
        type="file"
        multiple
        accept={att.accept}
        style={{ display: "none" }}
        onChange={att.onPick}
      />
      <button
        type="button"
        title="Attach files"
        disabled={disabled || att.uploading}
        onClick={() => att.inputRef.current?.click()}
        style={{
          padding: "8px 12px", borderRadius: 10, border: "1px solid #334155",
          background: "transparent", color: "#94a3b8", fontSize: 14,
          cursor: disabled || att.uploading ? "not-allowed" : "pointer", flexShrink: 0,
          ...style,
        }}
      >
        {att.uploading ? `${att.progress}%` : "📎"}
      </button>
    </>
  );
}

export function AttachmentList({ att, style }) {
  if (!att.files.length && !att.error && !att.uploading) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", ...style }}>
      {att.files.map((f) => (
        <span
          key={f.file_id}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px",
            borderRadius: 999, border: "1px solid #334155", background: "#0f172a",
            color: "#cbd5e1", fontSize: 11, maxWidth: 240,
          }}
          title={f.file_name}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📄 {f.file_name}
          </span>
          <span style={{ color: "#64748b" }}>{fmtSize(f.size_bytes)}</span>
          <button
            type="button"
            onClick={() => att.remove(f.file_id)}
            style={{ background: "transparent", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: 11 }}
            title="Remove"
          >
            ✕
          </button>
        </span>
      ))}
      {att.uploading && <span style={{ color: "#94a3b8", fontSize: 11 }}>Uploading… {att.progress}%</span>}
      {att.error && (
        <span style={{ color: "#fca5a5", fontSize: 11, flexBasis: "100%" }}>⚠ {att.error}</span>
      )}
    </div>
  );
}