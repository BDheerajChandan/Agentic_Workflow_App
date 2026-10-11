// src/App.jsx

import React, { useState } from "react";
import BotSetup from "./components/BotSetup";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { useChatStore } from "./hooks/useChatStore";
import { sendToFlow } from "./services/flowApi";
import { newId } from "./utils/ids";

export default function App() {
  const store = useChatStore();
  const [view, setView] = useState(store.activeBot ? "chat" : "bots");
  const [pending, setPending] = useState(() => new Set());

  const handleCreateBot = (name, flowUrl) => {
    store.addBot(name, flowUrl);
    setView("chat");
  };

  const handleSelectBot = (botId) => {
    store.selectBot(botId);
    setView("chat");
  };

  const handleSend = async (text) => {
    const session = store.activeSession;
    if (!session || pending.has(session.id)) return;

    const sessionId = session.id;
    store.appendMessage(sessionId, {
      id: newId(),
      role: "user",
      content: text,
      ts: Date.now(),
    });
    setPending((p) => new Set(p).add(sessionId));

    try {
      const reply = await sendToFlow({
        flowUrl: session.flowUrl,
        message: text,
        sessionId,
      });
      store.appendMessage(sessionId, {
        id: newId(),
        role: "bot",
        content: reply,
        ts: Date.now(),
      });
    } catch (err) {
      store.appendMessage(sessionId, {
        id: newId(),
        role: "bot",
        error: true,
        content: err?.userMessage || "Something went wrong. Please try again.",
        ts: Date.now(),
      });
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(sessionId);
        return next;
      });
    }
  };

  if (view === "bots" || !store.activeBot) {
    return (
      <BotSetup
        bots={store.bots}
        activeBotId={store.activeBotId}
        onCreate={handleCreateBot}
        onSelect={handleSelectBot}
        onDelete={store.deleteBot}
        onCancel={store.activeBot ? () => setView("chat") : null}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        bot={store.activeBot}
        sessions={store.botSessions}
        activeSessionId={store.activeSessionId}
        onNewChat={store.newChat}
        onSelectSession={store.selectSession}
        onSwitchBot={() => setView("bots")}
      />
      <ChatWindow
        bot={store.activeBot}
        session={store.activeSession}
        loading={store.activeSession ? pending.has(store.activeSession.id) : false}
        onSend={handleSend}
      />
    </div>
  );
}