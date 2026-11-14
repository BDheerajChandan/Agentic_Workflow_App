// src/components/ChatWindow.jsx

import React, { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { shortId } from "../utils/ids";

export default function ChatWindow({
  bot, session, messages, loading, streaming, onSend, onStop, onRespond,
}) {
  const endRef = useRef(null);
  const stickRef = useRef(true);

  const last = messages[messages.length - 1];
  const lastLen = last?.content?.length || 0;

  useEffect(() => {
    if (!stickRef.current) return;
    endRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth", block: "end" });
  }, [messages.length, lastLen, loading, streaming, session?.session_id]);

  useEffect(() => {
    stickRef.current = true;
  }, [session?.session_id]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

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

      <div className="chat-messages" onScroll={onScroll}>
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
              <MessageBubble
                message={m}
                onRespond={onRespond}
                onRetry={(r) => onSend(r.text, r.files, { retry: true })}
              />
            </React.Fragment>
          );
        })}
        {loading && !streaming && (
          <div className="bubble-row bubble-row-bot">
            <div className="bubble bubble-bot bubble-loading">Running workflow…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <MessageInput
        onSend={onSend}
        onStop={onStop}
        disabled={loading || !session}
        loading={loading}
        streaming={streaming}
        botId={bot.bot_id}
        sessionId={session?.session_id}
      />
    </main>
  );
}