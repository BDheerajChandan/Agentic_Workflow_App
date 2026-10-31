// src/components/FlowListPage.jsx

import React, { useEffect, useState } from "react";
import {
  listFlows, deleteFlow, listGroups, createGroup, renameGroup, deleteGroup,
  moveFlow, duplicateFlow,
} from "../services/api";
import CreateBotModal from "./CreateBotModal";
import OpenBotModal from "./OpenBotModal";
import { flowPath, groupPath } from "../utils/routes";
import { useAppInfo, formatAppTitle } from "../utils/appInfo";

const TOPBAR_HEIGHT = 42;

function LinkIcon({ size = 16 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function OpenLink({ href, label, onActivate }) {
  return (
    <a
      className="open-link"
      href={href}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onActivate();
      }}
    >
      <LinkIcon />
    </a>
  );
}

export default function FlowListPage({ groupId, onOpen, onNew, onOpenGroup, onHome }) {
  const [flows,   setFlows]   = useState([]);
  const [groups,  setGroups]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [query,   setQuery]   = useState("");
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  const [botTarget,  setBotTarget]  = useState(null);
  const [createdBot, setCreatedBot] = useState(null);
  const [openTarget, setOpenTarget] = useState(null);

  const [groupModal,   setGroupModal]   = useState(null); // { mode: "create" | "rename", group? }
  const [actionTarget, setActionTarget] = useState(null); // { mode: "move" | "copy", flow }
  const [notice,       setNotice]       = useState(null);

  const appTitle = formatAppTitle("DJ Workflow Builder", useAppInfo());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, g] = await Promise.all([listFlows(), listGroups()]);
      setFlows(f.flows);
      setGroups(g.groups);
    } catch {
      setError("Failed to load flows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const apiError = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this flow? Bots tagged to it will also be deleted.")) return;
    await deleteFlow(id);
    load();
  };

  const currentGroup = groupId ? groups.find((g) => g.group_id === groupId) : null;

  const removeGroup = async (g, e) => {
    e?.stopPropagation();
    if (!window.confirm(
      `Delete group "${g.name}"? Its ${g.flow_count} flow(s) will be moved to ungrouped, not deleted.`
    )) return;
    try {
      const res = await deleteGroup(g.group_id);
      if (groupId === g.group_id) return onHome();
      setNotice({ ok: true, text: `✓ Group deleted. ${res.moved_flows} flow(s) moved to ungrouped.` });
      load();
    } catch (err) {
      setNotice({ ok: false, text: apiError(err, "Failed to delete group.") });
    }
  };

  const submitGroup = async (name) => {
    if (groupModal.mode === "rename") await renameGroup(groupModal.group.group_id, name);
    else await createGroup(name);
    await load();
  };

  const submitAction = async (dest) => {
    const { mode, flow } = actionTarget;
    if (mode === "move") await moveFlow(flow.id, dest || null);
    else await duplicateFlow(flow.id, { same_group: false, group_id: dest || null });
    setNotice({
      ok: true,
      text: mode === "move" ? `✓ “${flow.name}” moved.` : `✓ Copy of “${flow.name}” created.`,
    });
    await load();
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

  const q = query.trim().toLowerCase();
  const scoped = flows.filter((f) => (groupId ? f.group_id === groupId : !f.group_id));
  const filteredFlows = q
    ? scoped.filter((f) =>
        [
          f.name, f.route_slug, f.id, f.execution_count,
          fmt(f.last_executed_at), fmt(f.created_at), fmt(f.updated_at),
        ].join(" ").toLowerCase().includes(q)
      )
    : scoped;
  const filteredGroups = !groupId
    ? (q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups)
    : [];

  const groupMissing = groupId && !loading && !error && !currentGroup;

  return (
    <div style={styles.root}>

      <div style={styles.topBar}>
        <span style={styles.brand} title={appTitle}>🚀 {appTitle}</span>

        <div style={styles.topBarCenter}>
          {new Date().toLocaleDateString()} {"  ||  "} {currentTime}
        </div>

        <div>
          <span style={{ color: "#e9e9f3", fontWeight: 600, fontSize: 12 }}>
            Developed by Dheeraj
          </span>
        </div>
      </div>

      <div style={styles.content}>
        {groupId && (
          <button style={styles.backLink} onClick={onHome}>← All Flows</button>
        )}

        <div style={styles.headingRow}>
          <div style={styles.heading}>
            {groupId ? `📁 ${currentGroup?.name ?? "Group"}` : "My Flows"}
          </div>
          <div style={styles.headingActions}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={groupId ? "Search flows…" : "Search flows & groups…"}
              style={styles.searchInput}
            />
            <a
              style={styles.chatbotBtn}
              href="http://localhost:5174/"
              target="_blank"
              rel="noreferrer"
            >
              🤖 Open Chatbot App
            </a>
            {groupId && currentGroup && (
              <>
                <button
                  style={styles.chatbotBtn}
                  onClick={() => setGroupModal({ mode: "rename", group: currentGroup })}
                >
                  ✎ Rename Group
                </button>
                <button style={styles.dangerBtn} onClick={() => removeGroup(currentGroup)}>
                  ✕ Delete Group
                </button>
              </>
            )}
            {!groupId && (
              <button style={styles.chatbotBtn} onClick={() => setGroupModal({ mode: "create" })}>
                📁 Create Group
              </button>
            )}
            {!groupMissing && (
              <button style={styles.newBtn} onClick={onNew}>＋ Create New Flow</button>
            )}
          </div>
        </div>

        {notice && (
          <div style={notice.ok ? styles.successBox : styles.errorBox}>
            <span>{notice.text}</span>
            <button style={styles.successClose} onClick={() => setNotice(null)}>✕</button>
          </div>
        )}

        {createdBot && (
          <div style={styles.successBox}>
            <span>
              ✓ Bot “{createdBot.name}” created and tagged to “{createdBot.workflow_name}”.
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <a
                href={createdBot.bot_url}
                target="_blank"
                rel="noreferrer"
                style={styles.successOpenBtn}
              >
                Open Bot →
              </a>
              <button style={styles.successClose} onClick={() => setCreatedBot(null)}>✕</button>
            </div>
          </div>
        )}

        {loading && <div style={styles.muted}>Loading…</div>}
        {error   && <div style={styles.errStyle}>{error}</div>}

        {groupMissing && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyIcon}>⬡</div>
            <div style={styles.muted}>Group not found.</div>
            <button style={styles.newBtn} onClick={onHome}>← All Flows</button>
          </div>
        )}

        {!loading && !groupId && filteredGroups.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Groups</div>
            <div style={{ ...styles.grid, marginBottom: 28 }}>
              {filteredGroups.map((g) => (
                <div
                  key={g.group_id}
                  style={styles.groupCard}
                  onClick={() => onOpenGroup(g.group_id)}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e293b")}
                >
                  <div style={styles.cardHeader}>
                    <div style={styles.cardName}>📁 {g.name}</div>
                    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                      <button
                        style={styles.delBtn}
                        title="Rename group"
                        onClick={(e) => { e.stopPropagation(); setGroupModal({ mode: "rename", group: g }); }}
                      >✎</button>
                      <button style={styles.delBtn} title="Delete group" onClick={(e) => removeGroup(g, e)}>✕</button>
                    </div>
                  </div>
                  <div style={styles.cardFooter}>
                    <span style={{ fontSize: 11, color: "#1e293b" }}>{g.flow_count} flow(s)</span>
                    <OpenLink
                      href={groupPath(g.group_id)}
                      label="Open group"
                      onActivate={() => onOpenGroup(g.group_id)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.sectionLabel}>Ungrouped Flows</div>
          </>
        )}

        {!loading && !error && !groupMissing && scoped.length === 0 && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyIcon}>⬡</div>
            <div style={styles.muted}>
              {groupId ? "No flows in this group yet." : "No flows yet. Create your first flow."}
            </div>
            <button style={styles.newBtn} onClick={onNew}>＋ Create New Flow</button>
          </div>
        )}

        {!loading && scoped.length > 0 && filteredFlows.length === 0 && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyIcon}>⬡</div>
            <div style={styles.muted}>No flows found</div>
          </div>
        )}

        <div style={styles.grid}>
          {filteredFlows.map((f) => (
            <div
              key={f.id}
              style={styles.card}
              onClick={() => onOpen(f.route_slug, f.group_id)}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e293b")}
            >
              <div style={styles.cardHeader}>
                <div style={styles.cardName}>{f.name}</div>
                <button
                  style={styles.delBtn}
                  onClick={(e) => handleDelete(f.id, e)}
                  title="Delete flow"
                >✕</button>
              </div>

              <div style={styles.meta}>
                <MetaRow label="Executions" value={f.execution_count} />
                <MetaRow label="Last run"   value={fmt(f.last_executed_at)} />
                <MetaRow label="Created"    value={fmt(f.created_at)} />
                <MetaRow label="Updated"    value={fmt(f.updated_at)} />
              </div>

              <div style={styles.cardFooter}>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    style={styles.botBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setBotTarget({ id: f.id, name: f.name });
                    }}
                    title="Create a Bot tagged to this workflow"
                  >
                    🤖 Create Bot
                  </button>
                  <button
                    style={styles.openBotBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenTarget({ id: f.id, name: f.name });
                    }}
                    title="Open a Bot tagged to this workflow"
                  >
                    📂 Open Bot
                  </button>
                </div>
                <OpenLink
                  href={flowPath(f.route_slug, f.group_id)}
                  label="Open flow"
                  onActivate={() => onOpen(f.route_slug, f.group_id)}
                />
              </div>

              <div style={styles.cardActions}>
                <button
                  style={styles.openBotBtn}
                  onClick={(e) => { e.stopPropagation(); setActionTarget({ mode: "move", flow: f }); }}
                  title="Move this flow to a group or to ungrouped"
                >
                  ⇄ Move
                </button>
                <button
                  style={styles.openBotBtn}
                  onClick={(e) => { e.stopPropagation(); setActionTarget({ mode: "copy", flow: f }); }}
                  title="Create a COPY_n_OF copy"
                >
                  ⧉ Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {openTarget && (
        <OpenBotModal
          flowId={openTarget.id}
          flowName={openTarget.name}
          onClose={() => setOpenTarget(null)}
          onCreate={() => {
            setBotTarget({ id: openTarget.id, name: openTarget.name });
            setOpenTarget(null);
          }}
        />
      )}

      {botTarget && (
        <CreateBotModal
          flowId={botTarget.id}
          flowName={botTarget.name}
          onClose={() => setBotTarget(null)}
          onCreated={(bot) => {
            setBotTarget(null);
            setCreatedBot(bot);
          }}
        />
      )}

      {groupModal && (
        <GroupNameModal
          title={groupModal.mode === "rename" ? "Rename Group" : "Create Group"}
          initial={groupModal.group?.name || ""}
          submitLabel={groupModal.mode === "rename" ? "Save" : "Create Group"}
          onClose={() => setGroupModal(null)}
          onSubmit={submitGroup}
          apiError={apiError}
        />
      )}

      {actionTarget && (
        <DestinationModal
          mode={actionTarget.mode}
          flow={actionTarget.flow}
          groups={groups}
          onClose={() => setActionTarget(null)}
          onSubmit={submitAction}
          apiError={apiError}
        />
      )}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
      <span style={{ color: "#475569", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#94a3b8", fontSize: 11 }}>{String(value)}</span>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function GroupNameModal({ title, initial, submitLabel, onClose, onSubmit, apiError }) {
  const [name,  setName]  = useState(initial);
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    if (!n) return setError("Enter a group name.");
    setBusy(true);
    setError("");
    try {
      await onSubmit(n);
      onClose();
    } catch (err) {
      setError(apiError(err, "Failed to save group."));
      setBusy(false);
    }
  };

  return (
    <div style={m.overlay} onClick={onClose}>
      <form style={m.panel} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={m.header}>
          <div style={m.title}>{title}</div>
          <button type="button" style={m.closeBtn} onClick={onClose}>✕</button>
        </div>
        <label style={m.lbl}>Group Name</label>
        <input
          style={m.inp}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Customer Support"
          maxLength={100}
          autoFocus
        />
        {error && <div style={m.error}>{error}</div>}
        <div style={m.actions}>
          <button type="button" style={m.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={{ ...m.saveBtn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function DestinationModal({ mode, flow, groups, onClose, onSubmit, apiError }) {
  const [dest,  setDest]  = useState(flow.group_id || "");
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const isMove = mode === "move";

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (isMove && (dest || null) === (flow.group_id || null)) {
      return setError("The flow is already there.");
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(dest);
      onClose();
    } catch (err) {
      setError(apiError(err, isMove ? "Failed to move flow." : "Failed to copy flow."));
      setBusy(false);
    }
  };

  return (
    <div style={m.overlay} onClick={onClose}>
      <form style={m.panel} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={m.header}>
          <div style={m.title}>{isMove ? "Move Flow" : "Copy Flow"}</div>
          <button type="button" style={m.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, wordBreak: "break-word" }}>
          {flow.name}
        </div>
        <label style={m.lbl}>{isMove ? "Move to" : "Create copy in"}</label>
        <div style={{ position: "relative" }}>
          <select
            style={{ ...m.inp, appearance: "none", WebkitAppearance: "none", paddingRight: 30, cursor: "pointer" }}
            value={dest}
            onChange={(e) => setDest(e.target.value)}
          >
            <option value="">Ungrouped</option>
            {groups.map((g) => (
              <option key={g.group_id} value={g.group_id}>{g.name}</option>
            ))}
          </select>
          <span style={m.arrow}>▼</span>
        </div>
        {error && <div style={m.error}>{error}</div>}
        <div style={m.actions}>
          <button type="button" style={m.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={{ ...m.saveBtn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy ? "Working…" : isMove ? "Move" : "Create Copy"}
          </button>
        </div>
      </form>
    </div>
  );
}

const m = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(2,6,23,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4000,
  },
  panel: {
    width: 400, maxWidth: "94vw", background: "#0a0f1e", border: "1px solid #1e293b",
    borderRadius: 14, padding: 22, color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: 700, color: "#818cf8" },
  closeBtn: { background: "transparent", border: "none", color: "#475569", fontSize: 14, cursor: "pointer" },
  lbl: {
    display: "block", fontSize: 10, color: "#94a3b8", margin: "12px 0 5px",
    textTransform: "uppercase", letterSpacing: "0.08em",
  },
  inp: {
    width: "100%", padding: "9px 11px", borderRadius: 8, background: "#0f172a",
    color: "#e2e8f0", border: "1px solid #1e293b", fontSize: 13, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  },
  arrow: {
    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
    color: "#475569", fontSize: 10, pointerEvents: "none",
  },
  error: {
    marginTop: 10, padding: "8px 10px", borderRadius: 8, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5",
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  cancelBtn: {
    padding: "8px 16px", borderRadius: 9, border: "1px solid #334155",
    background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
};

const styles = {
  root: {
    width: "100%",
    height: "100%",
    background: "#020617",
    color: "#e2e8f0",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  topBar: {
    position: "fixed",
    top: 0, left: 0, right: 0,
    height: TOPBAR_HEIGHT,
    background: "#0f172a",
    borderBottom: "1px solid #1e293b",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "0 16px",
    zIndex: 3000,
    flexShrink: 0,
  },

  brand: {
    color: "#818cf8", fontWeight: 700, fontSize: 14,
    minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  topBarCenter: { color: "#38bdf8", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 },

  content: {
    marginTop: TOPBAR_HEIGHT,
    flex: 1,
    minHeight: 0,
    padding: "40px",
    overflowY: "auto",
  },

  backLink: {
    background: "transparent", border: "none", color: "#818cf8",
    fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 12,
    fontFamily: "inherit",
  },

  sectionLabel: {
    fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
    color: "#475569", marginBottom: 12, fontWeight: 600,
  },

  headingRow: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12,
    justifyContent: "space-between", marginBottom: 28,
  },

  heading: { fontSize: 22, fontWeight: 700, color: "#e2e8f0", wordBreak: "break-word" },

  headingActions: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10,
  },

  searchInput: {
    width: 240, maxWidth: "100%", padding: "8px 12px", borderRadius: 9,
    border: "1px solid #1e293b", background: "#0f172a",
    color: "#e2e8f0", fontSize: 13, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  },

  chatbotBtn: {
    padding: "8px 18px", borderRadius: 9,
    border: "1px solid #334155", background: "transparent",
    color: "#94a3b8", fontWeight: 700, fontSize: 13,
    cursor: "pointer", letterSpacing: "0.04em",
    textDecoration: "none", display: "inline-block", fontFamily: "inherit",
  },

  dangerBtn: {
    padding: "8px 18px", borderRadius: 9,
    border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)",
    color: "#fca5a5", fontWeight: 700, fontSize: 13,
    cursor: "pointer", letterSpacing: "0.04em", fontFamily: "inherit",
  },

  newBtn: {
    padding: "8px 18px", borderRadius: 9, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontWeight: 700, fontSize: 13,
    cursor: "pointer", letterSpacing: "0.04em", fontFamily: "inherit",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 20,
  },

  card: {
    background: "#c7da7e",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: "18px 20px",
    cursor: "pointer",
    transition: "border-color 0.2s",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },

  groupCard: {
    background: "#a9c1f0",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: "18px 20px",
    cursor: "pointer",
    transition: "border-color 0.2s",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },

  cardHeader: {
    display: "flex", alignItems: "flex-start",
    justifyContent: "space-between", marginBottom: 14,
  },

  cardName: { fontSize: 15, fontWeight: 700, color: "#060707", wordBreak: "break-word" },

  delBtn: {
    background: "transparent", border: "none",
    color: "#475569", fontSize: 13, cursor: "pointer",
    padding: "2px 4px", flexShrink: 0,
  },

  meta: {
    marginBottom: 14, padding: "12px",
    background: "#020617", borderRadius: 8, border: "1px solid #1e293b",
  },

  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
    paddingTop: 10,
    borderTop: "1px solid rgba(2,6,23,0.15)",
  },

  cardActions: { display: "flex", gap: 6, marginTop: 8 },

  botBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white",
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    letterSpacing: "0.03em",
    flexShrink: 0,
  },

  openBotBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #4f46e5",
    background: "#020617",
    color: "#a5b4fc",
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    letterSpacing: "0.03em",
    flexShrink: 0,
  },

  successBox: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    marginBottom: 20, padding: "10px 14px", borderRadius: 10, fontSize: 12,
    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
    color: "#6ee7b7",
  },
  errorBox: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    marginBottom: 20, padding: "10px 14px", borderRadius: 10, fontSize: 12,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
    color: "#fca5a5",
  },
  successOpenBtn: {
    padding: "6px 14px", borderRadius: 8, border: "none",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    color: "white", fontWeight: 700, fontSize: 11,
    cursor: "pointer", letterSpacing: "0.03em", textDecoration: "none",
    flexShrink: 0,
  },
  successClose: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 13 },

  emptyBox: {
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 16, marginTop: 60,
  },

  emptyIcon: { fontSize: 48, color: "#1e293b" },
  muted:     { color: "#475569", fontSize: 13 },
  errStyle:  { color: "#fca5a5", fontSize: 13 },
};