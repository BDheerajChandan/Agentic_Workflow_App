// src/components/ChatWindow.jsx

import React, { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { shortId } from "../utils/ids";

export default function ChatWindow({ bot, session, messages, loading, onSend }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading, session?.session_id]);

  let lastDate = "";

  return (
    <main className="chat">
      <div className="chat-header">
        <div>
          <div className="chat-title">🤖 {bot.name}</div>
          <div className="muted">
            {session
              ? `Session: ${shortId(session.session_id)} · Thread: ${shortId(session.thread_id)}`
              : "No active session"}
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {session && messages.length === 0 && (
          <div className="chat-empty">Send a message to start the conversation.</div>
        )}
        {messages.map((m) => {
          const d = m.created_at ? new Date(m.created_at).toLocaleDateString() : "";
          const showDate = d && d !== lastDate;
          if (showDate) lastDate = d;
          return (
            <React.Fragment key={m.id}>
              {showDate && <div className="date-sep">{d}</div>}
              <MessageBubble message={m} />
            </React.Fragment>
          );
        })}
        {loading && (
          <div className="bubble-row bubble-row-bot">
            <div className="bubble bubble-bot bubble-loading">Running workflow…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <MessageInput onSend={onSend} disabled={loading || !session} loading={loading} />
    </main>
  );
}