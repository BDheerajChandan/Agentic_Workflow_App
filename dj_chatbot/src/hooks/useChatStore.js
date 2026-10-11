// src/hooks/useChatStore.js
// Backend-driven state for one Bot. No local persistence.

import { useEffect, useRef, useState } from "react";
import * as api from "../services/botApi";

export function useBot(botId, sessionParam, onSessionChange) {
  const [bot, setBot] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | notfound | error
  const [error, setError] = useState("");
  const [pending, setPending] = useState(() => new Set());

  const activeRef = useRef(sessionParam);
  activeRef.current = sessionParam;

  // ── Load bot + sessions ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setMessages([]);

    (async () => {
      try {
        const b = await api.getBot(botId);
        const { sessions: list } = await api.listSessions(botId);
        if (cancelled) return;

        let all = list;
        let chosen = list.find((s) => s.session_id === sessionParam)?.session_id;
        if (!chosen) {
          if (list.length) {
            chosen = list[0].session_id;
          } else {
            const created = await api.createSession(botId);
            if (cancelled) return;
            all = [created];
            chosen = created.session_id;
          }
          onSessionChange(chosen, true);
        }

        setBot(b);
        setSessions(all);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e?.userMessage || "Failed to load bot.");
        setStatus(e?.kind === "not_found" ? "notfound" : "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [botId]); // eslint-disable-line

  // ── Load messages for active session ──────────────────────────────────────
  useEffect(() => {
    if (status !== "ready" || !sessionParam) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getMessages(botId, sessionParam);
        if (!cancelled) setMessages(data.messages);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [botId, sessionParam, status]);

  const refreshSessions = async () => {
    try {
      const { sessions: list } = await api.listSessions(botId);
      setSessions(list);
    } catch {
      /* ignore */
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const newChat = async () => {
    const created = await api.createSession(botId);
    setSessions((s) => [created, ...s]);
    setMessages([]);
    onSessionChange(created.session_id);
  };

  const selectSession = (sessionId) => {
    if (sessionId === sessionParam) return;
    setMessages([]);
    onSessionChange(sessionId);
  };

  const rename = async (name) => {
    const updated = await api.renameBot(botId, name);
    setBot(updated);
  };

  const send = async (text) => {
    const sid = sessionParam;
    if (!sid || pending.has(sid)) return;

    const tmp = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, tmp]);
    setPending((p) => new Set(p).add(sid));

    try {
      const res = await api.sendChat(botId, sid, text);
      if (activeRef.current === sid) {
        setMessages((m) => [...m.filter((x) => x.id !== tmp.id), ...res.messages]);
      }
    } catch (err) {
      if (activeRef.current === sid) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: "bot",
            error: true,
            content: err?.userMessage || "Something went wrong. Please try again.",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(sid);
        return next;
      });
      refreshSessions();
    }
  };

  const activeSession = sessions.find((s) => s.session_id === sessionParam) || null;

  return {
    bot,
    sessions,
    messages,
    status,
    error,
    activeSession,
    loading: sessionParam ? pending.has(sessionParam) : false,
    newChat,
    selectSession,
    rename,
    send,
  };
}