import { useCallback, useEffect, useRef, useState } from "react";
import { getLogs } from "../services/serviceApi";
import { copyToClipboard, logLevel } from "../utils/formatters";

export default function ServiceLogs({ serviceId }) {
  const [lines, setLines] = useState([]);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [tail, setTail] = useState(200);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef(null);
  const stick = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogs(serviceId, tail);
      setLines(res.data.lines || []);
      setInfo(res.data.message || (res.data.container_status ? `Container: ${res.data.container_status}` : ""));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [serviceId, tail]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [auto, load]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const copy = async () => {
    if (await copyToClipboard(lines.join("\n"))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div>
      <div className="log-toolbar">
        <select className="select" value={tail} onChange={(e) => setTail(Number(e.target.value))} aria-label="Lines">
          {[100, 200, 500, 1000, 2000].map((n) => <option key={n} value={n}>Last {n} lines</option>)}
        </select>
        <button className="btn btn-sm" disabled={loading} onClick={load}>{loading ? "…" : "⟳ Refresh"}</button>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh
        </label>
        <button className="btn btn-sm" disabled={!lines.length} onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        {info && <span className="hint">{info}</span>}
      </div>
      {error && <div className="note note-error" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="log-box" ref={boxRef} onScroll={onScroll}>
        {lines.length === 0 && <div className="hint">No log output.</div>}
        {lines.map((line, i) => (
          <div key={i} className={`log-line log-${logLevel(line)}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}