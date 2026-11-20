// src/hooks/useServices.js
// Live service list (polling), per-service actions and Start All / Stop All jobs.

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../services/serviceApi";
import { formatError } from "../utils/formatters";

const FAST_MS = 2000;
const SLOW_MS = 5000;
const JOB_LABEL = { start_all: "Start All", stop_all: "Stop All", reconcile: "Auto-start" };

export default function useServices({ notify }) {
  const [services, setServices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [docker, setDocker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [busy, setBusy] = useState({});
  const [job, setJob] = useState(null);

  const busyRef = useRef(busy);
  busyRef.current = busy;
  const jobRef = useRef(job);
  jobRef.current = job;
  const servicesRef = useRef(services);
  servicesRef.current = services;
  const inFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await api.listServices(force);
      setServices(res.data || []);
      setSummary(res.summary || null);
      setDocker(res.docker || null);
      setRefreshedAt(res.refreshed_at || new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // Adaptive polling: 5 s normally, 2 s while something is starting / an action or job is running.
  useEffect(() => {
    let stopped = false;
    let timer;
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) await load(false);
      const active =
        Object.keys(busyRef.current).length > 0 ||
        jobRef.current?.state === "running" ||
        servicesRef.current.some((s) => s.state === "starting");
      timer = setTimeout(tick, active ? FAST_MS : SLOW_MS);
    };
    tick();
    const onVisible = () => { if (!document.hidden) load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const act = useCallback(
    async (service, action) => {
      const id = service.service_id;
      if (busyRef.current[id]) return;
      setBusy((b) => ({ ...b, [id]: action }));
      try {
        const fn = { start: api.startService, stop: api.stopService, restart: api.restartService }[action];
        const res = await fn(id);
        setServices((list) => list.map((s) => (s.service_id === id ? res.data : s)));
        notify(res.in_progress ? "info" : "success", res.message);
      } catch (err) {
        notify("error", formatError(`Unable to ${action} ${service.service_name}.`, err));
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[id];
          return next;
        });
        load(true);
      }
    },
    [load, notify]
  );

  const startJob = useCallback(
    async (kind) => {
      if (jobRef.current?.state === "running") return;
      try {
        const res = kind === "start" ? await api.startAll() : await api.stopAll();
        setJob(res.data);
      } catch (err) {
        notify("error", err.message);
      }
    },
    [notify]
  );

  const jobId = job?.job_id;
  const jobRunning = job?.state === "running";
  useEffect(() => {
    if (!jobId || !jobRunning) return undefined;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await api.getJob(jobId);
        if (stopped) return;
        setJob(res.data);
        if (res.data.state !== "running") {
          notify(res.data.state === "done" ? "success" : "error", `${JOB_LABEL[res.data.action] || "Job"}: ${res.data.message}`);
          load(true);
        }
      } catch {
        /* transient: next tick retries */
      }
    }, FAST_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId, jobRunning, load, notify]);

  return {
    services, summary, docker, loading, refreshing, error, refreshedAt, busy, job,
    authRequired: error?.code === "unauthorized",
    jobLabel: job ? JOB_LABEL[job.action] || "Job" : "",
    refresh, reload: () => load(true), act,
    startAll: () => startJob("start"), stopAll: () => startJob("stop"),
    dismissJob: () => setJob(null),
  };
}