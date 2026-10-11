// src/components/ChatWindow.jsx

import React, { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { shortId } from "../utils/ids";

export default function ChatWindow({ bot, session, loading, onSend }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages?.length, loading, session?.id]);

  return (
    <main className="chat">
      <div className="chat-header">
        <div>
          <div className="chat-title">🤖 {bot.name}</div>
          <div className="muted">
            {session ? `Session: ${shortId(session.id)}` : "No active session"}
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {session && session.messages.length === 0 && (
          <div className="chat-empty">Send a message to start the conversation.</div>
        )}
        {session?.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
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