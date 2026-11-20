const STATE_CLASS = { active: "ok", starting: "warn", unhealthy: "warn", inactive: "bad", disabled: "muted", unavailable: "muted" };
const STATE_TEXT = {
  active: "ACTIVE", starting: "STARTING", unhealthy: "UNHEALTHY", inactive: "INACTIVE",
  disabled: "DISABLED", unavailable: "UNAVAILABLE",
};
const HEALTH_CLASS = { healthy: "ok", starting: "warn", unhealthy: "warn", stopped: "bad", unknown: "muted" };

export function StatusBadge({ state }) {
  return (
    <span className={`badge badge-${STATE_CLASS[state] || "muted"}`}>
      <span className="dot" />
      {STATE_TEXT[state] || String(state || "UNKNOWN").toUpperCase()}
    </span>
  );
}

export function HealthBadge({ health }) {
  return (
    <span className={`badge badge-${HEALTH_CLASS[health] || "muted"}`}>
      <span className="dot" />
      {String(health || "unknown").toUpperCase()}
    </span>
  );
}