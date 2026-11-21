import { getTimePauseOutcome } from "../../services/api";

const POLL_MS = 3000;

export function watchTimePause(pauseId, { onWaiting, onFinished, onError } = {}) {
  let stopped = false;
  let timer = null;
  let current = pauseId;

  const tick = async () => {
    if (stopped) return;
    let o;
    try {
      o = await getTimePauseOutcome(current);
    } catch {
      schedule();
      return;
    }
    if (stopped) return;

    if (o.status === "pending" || o.status === "resuming") {
      onWaiting?.({ ...o, pause_id: current });
      schedule();
      return;
    }

    if (o.status === "cancelled") {
      onError?.(`Paused run #${current} was cancelled.`);
      return;
    }

    const out = o.outcome;
    if (out?.error || o.status === "failed") {
      onError?.(out?.error || o.error || `Paused run #${current} failed after resuming.`);
      return;
    }
    if (!out) {
      onError?.(`Paused run #${current} finished. Open Run History to see its result.`);
      return;
    }

    if (out.paused && out.result?.pause_id != null) {
      onWaiting?.({ status: "pending", resume_at: out.result.resume_at, pause_id: out.result.pause_id });
      current = out.result.pause_id;
      schedule();
      return;
    }

    onFinished?.({
      result: out.result,
      display: out.display ?? undefined,
      error: null,
      status: o.status,
      pause_id: current,
    });
  };

  const schedule = () => {
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  };

  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}