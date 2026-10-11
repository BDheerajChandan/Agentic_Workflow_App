// src/components/playground/PlaygroundPanel.jsx`


import React, { useState } from "react";

export default function PlaygroundPanel({
  output,
  onSend,
  loading,
}) {

  const [message, setMessage] = useState("");

  const [chatHistory, setChatHistory] = useState([]);

  // =====================================
  // SEND MESSAGE
  // =====================================

  const handleSend = async () => {

    if (!message.trim()) return;

    const userMessage = {
      role: "user",
      content: message,
    };

    const updatedChat = [
      ...chatHistory,
      userMessage,
    ];

    setChatHistory(updatedChat);

    try {

      const result = await onSend(message);

      const assistantMessage = {
        role: "assistant",
        content:
          typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2),
      };

      setChatHistory([
        ...updatedChat,
        assistantMessage,
      ]);

      setMessage("");

    } catch (err) {

      setChatHistory([
        ...updatedChat,
        {
          role: "assistant",
          content: "Execution Failed",
        },
      ]);
    }
  };

  // =====================================
  // DOWNLOAD CHAT
  // =====================================

  const downloadChat = () => {

    const content = JSON.stringify(
      chatHistory,
      null,
      2
    );

    const blob = new Blob(
      [content],
      {
        type: "application/json",
      }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "chat_history.json";

    a.click();

    URL.revokeObjectURL(url);
  };

  return (

    <div style={styles.container}>

      {/* HEADER */}

      <div style={styles.header}>

        <div>
          <div style={styles.title}>
            Playground
          </div>

          <div style={styles.subtitle}>
            Test graph execution using chat
          </div>
        </div>

        <button
          style={styles.downloadBtn}
          onClick={downloadChat}
        >
          Download Chat
        </button>

      </div>

      {/* CHAT AREA */}

      <div style={styles.chatArea}>

        {chatHistory.length === 0 && (
          <div style={styles.empty}>
            Start conversation...
          </div>
        )}

        {chatHistory.map((msg, idx) => (

          <div
            key={idx}
            style={{
              ...styles.message,

              alignSelf:
                msg.role === "user"
                  ? "flex-end"
                  : "flex-start",

              background:
                msg.role === "user"
                  ? "#2563eb"
                  : "#1e293b",
            }}
          >

            <div style={styles.role}>
              {msg.role}
            </div>

            <div style={styles.content}>
              {msg.content}
            </div>

          </div>

        ))}

      </div>

      {/* INPUT */}

      <div style={styles.inputSection}>

        <textarea
          rows={3}
          placeholder="Type message..."
          value={message}
          onChange={(e) =>
            setMessage(e.target.value)
          }
          style={styles.textarea}
        />

        <button
          onClick={handleSend}
          disabled={loading}
          style={styles.sendBtn}
        >
          {loading ? "Running..." : "Send"}
        </button>

      </div>

    </div>
  );
}

// =====================================
// STYLES
// =====================================

const styles = {

  container: {
    width: 380,
    background: "#020617",
    borderLeft: "1px solid #1e293b",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    color: "white",
  },

  header: {
    padding: 12,
    borderBottom: "1px solid #1e293b",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  title: {
    fontSize: 16,
    fontWeight: 700,
  },

  subtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },

  downloadBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
    fontSize: 12,
  },

  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  empty: {
    color: "#475569",
    textAlign: "center",
    marginTop: 40,
  },

  message: {
    maxWidth: "85%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #334155",
  },

  role: {
    fontSize: 10,
    textTransform: "uppercase",
    color: "#94a3b8",
    marginBottom: 6,
  },

  content: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 13,
    lineHeight: 1.5,
  },

  inputSection: {
    padding: 16,
    borderTop: "1px solid #1e293b",
  },

  textarea: {
    width: "100%",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 10,
    color: "white",
    padding: 12,
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
  },

  sendBtn: {
    marginTop: 10,
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
};