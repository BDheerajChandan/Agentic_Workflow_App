// src/services/storage.js
// Client-side persistence only. Replace with API calls when a backend DB is added.

const KEY = "dj_chatbot_state_v1";

const EMPTY = { bots: [], sessions: [], activeBotId: null, activeSessionId: null };

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}