// src/hooks/useChatStore.js

import { useEffect, useState } from "react";
import { loadState, saveState } from "../services/storage";
import { newId } from "../utils/ids";

const DEFAULT_TITLE = "New chat";

function makeSession(bot) {
  return {
    id: newId(),
    botId: bot.id,
    flowUrl: bot.flowUrl,
    title: DEFAULT_TITLE,
    createdAt: Date.now(),
    messages: [],
  };
}

export function useChatStore() {
  const [state, setState] = useState(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const { bots, sessions, activeBotId, activeSessionId } = state;

  const activeBot = bots.find((b) => b.id === activeBotId) || null;
  const botSessions = sessions
    .filter((s) => s.botId === activeBotId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  // ── Bots ──────────────────────────────────────────────────────────────────
  const addBot = (name, flowUrl) => {
    const bot = { id: newId(), name, flowUrl, createdAt: Date.now() };
    const session = makeSession(bot);
    setState((s) => ({
      ...s,
      bots: [...s.bots, bot],
      sessions: [...s.sessions, session],
      activeBotId: bot.id,
      activeSessionId: session.id,
    }));
  };

  const selectBot = (botId) => {
    const bot = bots.find((b) => b.id === botId);
    if (!bot) return;
    const existing = sessions
      .filter((s) => s.botId === botId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (existing) {
      setState((s) => ({ ...s, activeBotId: botId, activeSessionId: existing.id }));
    } else {
      const session = makeSession(bot);
      setState((s) => ({
        ...s,
        sessions: [...s.sessions, session],
        activeBotId: botId,
        activeSessionId: session.id,
      }));
    }
  };

  const deleteBot = (botId) => {
    setState((s) => {
      const isActive = s.activeBotId === botId;
      return {
        ...s,
        bots: s.bots.filter((b) => b.id !== botId),
        sessions: s.sessions.filter((x) => x.botId !== botId),
        activeBotId: isActive ? null : s.activeBotId,
        activeSessionId: isActive ? null : s.activeSessionId,
      };
    });
  };

  // ── Sessions ──────────────────────────────────────────────────────────────
  const newChat = () => {
    if (!activeBot) return;
    const session = makeSession(activeBot);
    setState((s) => ({
      ...s,
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
    }));
  };

  const selectSession = (sessionId) => {
    setState((s) => ({ ...s, activeSessionId: sessionId }));
  };

  const appendMessage = (sessionId, message) => {
    setState((s) => ({
      ...s,
      sessions: s.sessions.map((x) => {
        if (x.id !== sessionId) return x;
        const title =
          x.title === DEFAULT_TITLE && message.role === "user"
            ? message.content.slice(0, 40)
            : x.title;
        return { ...x, title, messages: [...x.messages, message] };
      }),
    }));
  };

  return {
    bots,
    activeBot,
    activeBotId,
    botSessions,
    activeSession,
    activeSessionId,
    addBot,
    selectBot,
    deleteBot,
    newChat,
    selectSession,
    appendMessage,
  };
}