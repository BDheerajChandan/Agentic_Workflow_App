// src/App.jsx

import React from "react";
import { Routes, Route, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import BotSetup from "./components/BotSetup";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import TopBar from "./components/TopBar";
import { useBot } from "./hooks/useChatStore";

export default function App() {
  return (
    <div className="app-root">
      <TopBar />
      <div className="app-main">
        <Routes>
          <Route path="/" element={<BotSetup />} />
          <Route path="/bots/:botId" element={<BotPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function BotPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sessionParam = params.get("session");

  const setSession = (id, replace = false) =>
    setParams({ session: id }, { replace });

  const store = useBot(botId, sessionParam, setSession);

  if (store.status === "loading") {
    return (
      <div className="setup-root">
        <div className="muted">Loading bot…</div>
      </div>
    );
  }

  if (store.status !== "ready" || !store.bot) {
    return (
      <div className="setup-root">
        <div className="setup-card">
          <h1 className="setup-title">
            {store.status === "notfound" ? "Bot not found" : "Could not load bot"}
          </h1>
          <div className="form-error">{store.error}</div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate("/")}
          >
            ← All Bots
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        bot={store.bot}
        sessions={store.sessions}
        activeSessionId={sessionParam}
        onNewChat={store.newChat}
        onSelectSession={store.selectSession}
        onSwitchBot={() => navigate("/")}
        onRename={store.rename}
      />
      <ChatWindow
        bot={store.bot}
        session={store.activeSession}
        messages={store.messages}
        loading={store.loading}
        onSend={store.send}
      />
    </div>
  );
}