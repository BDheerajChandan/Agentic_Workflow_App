// src/components/playground/PlaygroundPanel.jsx

import React, { useEffect, useRef, useState } from "react";
import InteractionCard from "../hitl/HitlCards";
import { BASE_URL } from "../../services/api";
import { useAttachments, AttachButton, AttachmentList } from "../files/AttachmentBar";

export default function PlaygroundPanel({ output, onSend, loading, onClose, flowId }) {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const endRef = useRef(null);

  const att = useAttachments(BASE_URL, { flow_id: flowId });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatHistory, sending]);

  // Called by the run loop when a HITL node pauses: renders the shared card in the chat.
  const present = ({ interaction, submit, cancel }) => {
    setChatHistory((h) => [
      ...h,
      { role: "assistant", interaction, _submit: submit, _cancel: cancel },
    ]);
  };

  const mark = (pauseId, status) =>
    setChatHistory((h) =>
      h.map((m) =>
        m.interaction?.pause_id === pauseId
          ? { ...m, interaction: { ...m.interaction, status } }
          : m
      )
    );

  const handleSend = async () => {
    const text = message.trim();
    if (!text && att.files.length === 0) return;
    if (sendingRef.current || att.uploading) return;

    sendingRef.current = true;
    setSending(true);

    const files = att.files;
    setChatHistory((h) => [
      ...h,
      {
        role: "user",
        content: text,
        files: files.map((f) => ({ file_id: f.file_id, file_name: f.file_name })),
      },
    ]);
    setMessage("");
    att.clear();

    try {
      const result = await onSend(text, files, present);
      setChatHistory((h) => [
        ...h,
        {
          role: "assistant",
          content: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ]);
    } catch (err) {
      setChatHistory((h) => [
        ...h,
        { role: "assistant", content: err?.message || "Execution Failed" },
      ]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!loading) handleSend();
    }
  };

  const downloadChat = () => {
    const content = JSON.stringify(
      chatHistory.map(({ _submit, _cancel, ...rest }) => rest),
      null,
      2
    );
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat_history.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Playground</div>
          <div style={styles.subtitle}>Test graph execution using chat</div>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.downloadBtn} onClick={downloadChat}>Download Chat</button>
          <button style={styles.downloadBtn} onClick={onClose}>Close</button>
        </div>
      </div>

      <div style={styles.chatArea}>
        {chatHistory.length === 0 && <div style={styles.empty}>Start conversation...</div>}

        {chatHistory.map((msg, idx) => {
          if (msg.interaction) {
            const pid = msg.interaction.pause_id;
            return (
              <div key={idx} style={{ alignSelf: "stretch" }}>
                <InteractionCard
                  interaction={msg.interaction}
                  onSubmit={async (response) => {
                    await msg._submit(response);
                    mark(pid, "submitted");
                  }}
                  onCancel={async () => {
                    mark(pid, "cancelled");
                    await msg._cancel();
                  }}
                />
              </div>
            );
          }
          return (
            <div
              key={idx}
              style={{
                ...styles.message,
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "#2563eb" : "#1e293b",
              }}
            >
              <div style={styles.role}>{msg.role}</div>
              {msg.content ? <div style={styles.content}>{msg.content}</div> : null}
              {msg.files?.length > 0 && (
                <div style={{ ...styles.content, fontSize: 11, opacity: 0.85, marginTop: 4 }}>
                  {msg.files.map((f) => `📄 ${f.file_name}`).join("  ")}
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div style={styles.inputSection}>
        <AttachmentList att={att} />
        <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
          <AttachButton att={att} disabled={loading || sending} />
          <textarea
            rows={3}
            placeholder="Type message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.textarea}
          />
          <button
            onClick={handleSend}
            disabled={loading || sending || att.uploading}
            style={styles.sendBtn}
          >
            {loading || sending ? "Running..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: 380, background: "#020617", borderLeft: "1px solid #1e293b",
    display: "flex", flexDirection: "column", height: "100%", color: "white",
  },
  header: {
    padding: 12, borderBottom: "1px solid #1e293b",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: 700 },
  subtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  downloadBtn: {
    padding: "8px 12px", borderRadius: 8, border: "1px solid #334155",
    background: "transparent", color: "#cbd5e1", cursor: "pointer", fontSize: 12,
  },
  chatArea: {
    flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12,
  },
  empty: { color: "#475569", textAlign: "center", marginTop: 40 },
  message: { maxWidth: "85%", padding: 12, borderRadius: 12, border: "1px solid #334155" },
  role: { fontSize: 10, textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 },
  content: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.5 },
  inputSection: {
    padding: 16, borderTop: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: 8,
  },
  textarea: {
    flex: 1, minWidth: 0, background: "#0f172a", border: "1px solid #334155",
    borderRadius: 10, color: "white", padding: 12, resize: "none", outline: "none",
    boxSizing: "border-box",
  },
  sendBtn: {
    flexShrink: 0, padding: "12px 18px", borderRadius: 10, border: "none",
    background: "#2563eb", color: "white", fontWeight: 700, cursor: "pointer",
  },
};