import ServiceCard from "./ServiceCard";

export default function ServiceGrid({ services, loading, busy, onRun, onStop, onRestart, onDetails, onRegister }) {
  if (loading) {
    return (
      <div className="grid">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">⬡</div>
        <div>No services are registered yet.</div>
        <button className="btn btn-primary" onClick={onRegister}>＋ Register Service</button>
      </div>
    );
  }

  return (
    <div className="grid">
      {services.map((s) => (
        <ServiceCard
          key={s.service_id}
          service={s}
          busy={busy[s.service_id]}
          onRun={onRun}
          onStop={onStop}
          onRestart={onRestart}
          onDetails={onDetails}
        />
      ))}
    </div>
  );
}