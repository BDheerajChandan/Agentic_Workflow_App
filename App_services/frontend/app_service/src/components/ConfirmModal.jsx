import { useEffect } from "react";

export default function ConfirmModal({
  title, message, confirmLabel = "Confirm", danger = false, busy = false, children, onConfirm, onCancel,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="overlay" style={{ zIndex: 1500 }} onClick={() => !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
        </div>
        <div className="modal-text" style={{ whiteSpace: "pre-wrap" }}>{message}</div>
        {children}
        <div className="modal-actions">
          <button className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}