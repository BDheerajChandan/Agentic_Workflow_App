// src/utils/appInfo.js
// Release metadata comes from the backend (/app-info). Nothing is hardcoded here.

import { useEffect, useState } from "react";
import { BASE_URL } from "../services/api";

let promise = null;
const load = () => {
  if (!promise) {
    promise = fetch(`${BASE_URL}/app-info`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => {
        promise = null;
        return null;
      });
  }
  return promise;
};

export function useAppInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    load().then((i) => { if (!cancelled) setInfo(i); });
    return () => { cancelled = true; };
  }, []);
  return info;
}

export function formatAppTitle(base, info) {
  if (!info) return base;
  const released = [info.release_date, info.release_time].filter(Boolean).join(" ");
  const parts = [
    info.version ? `V-${info.version}` : "",
    released ? `Released-${released}` : "",
  ].filter(Boolean);
  return parts.length ? `${base} (${parts.join(", ")})` : base;
}