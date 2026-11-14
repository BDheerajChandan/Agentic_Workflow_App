// src/hooks/useChatStore.js
// Backend-driven state for one Bot. Live-streams replies; falls back to the blocking endpoint.

import { useEffect, useRef, useState } from "react";
import * as api from "../services/botApi";

export function useBot(botId, sessionParam, onSessionChange) {
  const [bot, setBot] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | notfound | error
  const [error, setError] = useState("");
  const [pending, setPending] = useState(() => new Set());
  const [streamSid, setStreamSid] = useState(null);

  const activeRef = useRef(sessionParam);
  activeRef.current = sessionParam;
  const abortRef = useRef(null);

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

  const stop = () => abortRef.current?.abort();

  const send = async (text, files = [], opts = {}) => {
    const sid = sessionParam;
    if (!sid || pending.has(sid)) return;

    const stamp = Date.now();
    const iso = () => new Date().toISOString();
    const tmpId = `tmp-${stamp}`;
    const phId = `stream-${stamp}`;
    const tmp = {
      id: tmpId,
      role: "user",
      content: text || files.map((f) => f.file_name).join(", "),
      meta: files.length
        ? { files: files.map((f) => ({ file_id: f.file_id, file_name: f.file_name, size_bytes: f.size_bytes })) }
        : null,
      created_at: iso(),
    };
    const placeholder = { id: phId, role: "bot", content: "", streaming: true, created_at: iso() };

    setMessages((m) => [
      ...(opts.retry ? m.filter((x) => !x.retryable) : m),
      ...(opts.retry ? [] : [tmp]),
      placeholder,
    ]);
    setPending((p) => new Set(p).add(sid));
    setStreamSid(sid);

    const controller = new AbortController();
    abortRef.current = controller;

    let buffer = "";
    let raf = null;
    let finished = false;
    let sawEvent = false;

    const patch = (fn) => {
      if (activeRef.current === sid) setMessages(fn);
    };
    const flush = () => {
      raf = null;
      if (!buffer) return;
      const chunk = buffer;
      buffer = "";
      patch((m) => m.map((x) => (x.id === phId ? { ...x, content: x.content + chunk } : x)));
    };
    const drain = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      flush();
    };
    const settle = (msg) =>
      patch((m) =>
        m.some((x) => x.id === phId)
          ? m.map((x) => (x.id === phId ? msg : x))
          : m.some((x) => x.id === msg.id)
          ? m
          : [...m, msg]
      );
    const fail = (detail) => {
      finished = true;
      settle({
        id: `err-${Date.now()}`,
        role: "bot",
        error: true,
        content: detail || "Something went wrong. Please try again.",
        retryable: true,
        retry: { text, files },
        created_at: iso(),
      });
    };

    const onEvent = (evt) => {
      sawEvent = true;
      if (evt.type === "user_saved") {
        patch((m) => {
          if (m.some((x) => x.id === tmpId)) return m.map((x) => (x.id === tmpId ? evt.message : x));
          const i = m.findIndex((x) => x.id === phId);
          const copy = [...m];
          copy.splice(i < 0 ? copy.length : i, 0, evt.message);
          return copy;
        });
      } else if (evt.type === "token") {
        buffer += evt.delta || "";
        if (!raf) raf = requestAnimationFrame(flush);
      } else if (evt.type === "done" || evt.type === "interaction") {
        drain();
        finished = true;
        settle(evt.message);
      } else if (evt.type === "error") {
        drain();
        fail(evt.detail);
      }
    };

    try {
      await api.streamChat(botId, sid, text, files, {
        onEvent,
        signal: controller.signal,
        retry: !!opts.retry,
      });
      if (!finished) {
        drain();
        fail("The response ended unexpectedly.");
      }
    } catch (err) {
      drain();
      if (err?.kind === "aborted") {
        patch((m) =>
          m.flatMap((x) => {
            if (x.id !== phId) return [x];
            return x.content ? [{ ...x, streaming: false, stopped: true }] : [];
          })
        );
      } else if (err?.kind === "unsupported" && !sawEvent) {
        try {
          const res = await api.sendChat(botId, sid, text, files);
          patch((m) => [...m.filter((x) => x.id !== tmpId && x.id !== phId), ...res.messages]);
        } catch (e2) {
          fail(e2?.userMessage);
        }
      } else if (!finished) {
        fail(err?.userMessage);
      }
    } finally {
      drain();
      abortRef.current = null;
      setStreamSid(null);
      setPending((p) => {
        const next = new Set(p);
        next.delete(sid);
        return next;
      });
      refreshSessions();
    }
  };

  // Submit / cancel a pending HITL card. Throws on validation errors so the card can show them.
  const respond = async (pauseId, payload) => {
    const sid = sessionParam;
    if (!sid) return;
    setPending((p) => new Set(p).add(sid));
    try {
      const res = await api.submitInteraction(botId, sid, pauseId, payload);
      if (activeRef.current === sid) {
        setMessages((m) => [
          ...m.map((x) =>
            x.meta?.interaction?.pause_id === pauseId
              ? { ...x, meta: { ...x.meta, interaction: { ...x.meta.interaction, status: res.status } } }
              : x
          ),
          ...res.messages,
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

  const afterDelete = async (deletedIds) => {
    const { sessions: list } = await api.listSessions(botId);
    setSessions(list);
    if (deletedIds === "all" || deletedIds.includes(sessionParam)) {
      setMessages([]);
      if (list.length) {
        onSessionChange(list[0].session_id);
      } else {
        const created = await api.createSession(botId);
        setSessions([created]);
        onSessionChange(created.session_id);
      }
    }
  };

  const removeSession = async (sessionId) => {
    await api.deleteSession(botId, sessionId);
    await afterDelete([sessionId]);
  };

  const removeSessions = async (sessionIds) => {
    await api.deleteSessions(botId, sessionIds);
    await afterDelete(sessionIds);
  };

  const removeAllSessions = async () => {
    await api.deleteAllSessions(botId);
    await afterDelete("all");
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
    streaming: !!sessionParam && streamSid === sessionParam,
    newChat,
    selectSession,
    rename,
    send,
    stop,
    respond,
    removeSession,
    removeSessions,
    removeAllSessions,
  };
}