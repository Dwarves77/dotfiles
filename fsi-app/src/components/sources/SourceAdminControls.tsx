"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import { Pause, Play, Download, RefreshCw, Loader2, Shield, RotateCcw, Check } from "lucide-react";
import { StateNote } from "@/components/ui/StateNote";
import { ActionButton } from "@/components/ui/ActionRow";
import { band } from "@/lib/urgency/bands";
import { formatRelative, toDate } from "@/lib/relative-time";

interface ToastState { kind: "ok" | "err"; message: string }

// ── Global scrape-schedule control (top of the dashboard) ──
//
// The SINGLE source of truth for WHEN the whole system scrapes. Cadence off|weekly|monthly + a start-date
// anchor (first run + recurrence phase). 'off' = nothing scrapes (the hold). Separate EMERGENCY STOP
// (global_processing_paused) hard-halts at any time without erasing the saved cadence. Backed by
// /api/admin/sources/pause-global (GET state + computed next-scrape; POST cadence/start_date and/or paused).

interface ScheduleState {
  paused: boolean;
  cadence: "off" | "weekly" | "monthly";
  start_date: string | null;
  next_scrape: string | null;
}

export function GlobalPauseToggle() {
  const [state, setState] = useState<ScheduleState | null>(null);
  const [cadence, setCadence] = useState<"off" | "weekly" | "monthly">("off");
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // The one pause-global call shape this panel reuses (GET state, POST cadence/paused), on the
  // shared authenticated fetcher. Named off "authedFetch" so it does not shadow the import.
  async function pauseGlobalFetch(init?: RequestInit) {
    return authedFetch("/api/admin/sources/pause-global", init);
  }

  useEffect(() => {
    (async () => {
      const res = await pauseGlobalFetch();
      if (res.ok) {
        const p: ScheduleState = await res.json();
        setState(p);
        setCadence(p.cadence ?? "off");
        setStartDate(p.start_date ?? "");
      }
    })();
  }, []);

  function flash(kind: "ok" | "err", message: string) {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 5000);
  }

  async function saveSchedule() {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { cadence };
      if (cadence !== "off") body.start_date = startDate || new Date().toISOString().slice(0, 10);
      const res = await pauseGlobalFetch({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const p = await res.json();
      if (res.ok) {
        setState(p); setCadence(p.cadence); setStartDate(p.start_date ?? "");
        flash("ok", p.cadence === "off" ? "Scraping set to OFF — nothing will scrape." : `Scraping ${p.cadence} from ${p.start_date} — next run ${p.next_scrape}.`);
      } else flash("err", p.error || "Save failed");
    } catch (e: any) { flash("err", e.message); }
    finally { setSubmitting(false); }
  }

  async function toggleEmergency() {
    if (!state) return;
    setSubmitting(true);
    const next = !state.paused;
    try {
      const res = await pauseGlobalFetch({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: next }) });
      const p = await res.json();
      if (res.ok) { setState(p); flash("ok", next ? "EMERGENCY STOP engaged — saved schedule preserved." : "Emergency stop released."); }
      else flash("err", p.error || "Toggle failed");
    } catch (e: any) { flash("err", e.message); }
    finally { setSubmitting(false); }
  }

  if (!state) return null;
  const isOff = state.cadence === "off";
  const scrapingOn = !isOff && !state.paused;

  // Lane adminlayout (2026-09-08), the operator's item 4: this control used to draw a
  // full-width orange bordered box of its own above the registry. It is now the Action-band
  // state note strip at the FOOT of the source registry card, with Cadence / Save / Emergency
  // stop as its 44px action row beneath it — the shared `StateNote` (the same part the
  // regeneration strip and the provisional card's pipeline note use, never a second strip
  // component) and the shared `ActionButton`, whose own chrome is already 44px tall.
  //
  // The band is Action while nothing scrapes (cadence off, or the emergency stop engaged),
  // which is the state the strip exists to declare; when a cadence IS running the strip is
  // neutral, because a running schedule is not a state to alarm about.
  const stopped = isOff || state.paused;

  return (
    <div data-audit="registry-scrape-strip" style={{ display: "grid", gap: 10 }}>
      <StateNote band={stopped ? band("action") : null}>
        {state.paused ? (
          <>
            <b>Emergency stop engaged.</b> Nothing scrapes. Saved schedule:{" "}
            {isOff ? "off" : `${state.cadence} from ${state.start_date}`} (preserved).
          </>
        ) : isOff ? (
          <>
            <b>Scraping is OFF.</b> Nothing scrapes — not the automated worker, not manual
            fetch-now. Set a cadence to turn it on.
          </>
        ) : (
          <>
            <b>Scraping {state.cadence}</b> from {state.start_date}. Next run:{" "}
            <b>{state.next_scrape}</b>. The whole system scrapes on that schedule.
          </>
        )}
      </StateNote>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: "var(--fs-10)",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Cadence
          </span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as "off" | "weekly" | "monthly")}
            disabled={submitting}
            style={{
              fontFamily: "inherit",
              fontSize: "var(--fs-115)",
              minHeight: 44,
              padding: "0 10px",
              borderRadius: "var(--radius-control)",
              border: "1px solid rgba(0,0,0,.25)",
              background: "var(--card)",
              color: "var(--ink)",
            }}
          >
            <option value="off">Not at all (off)</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        {cadence !== "off" && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: "var(--fs-10)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              {cadence === "weekly" ? "Start (weekday)" : "Start (day of month)"}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={submitting}
              style={{
                fontFamily: "inherit",
                fontSize: "var(--fs-115)",
                minHeight: 44,
                padding: "0 10px",
                borderRadius: "var(--radius-control)",
                border: "1px solid rgba(0,0,0,.25)",
                background: "var(--card)",
                color: "var(--ink)",
              }}
            />
          </label>
        )}
        <ActionButton variant="primary" onClick={saveSchedule} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </ActionButton>
        <ActionButton
          onClick={toggleEmergency}
          disabled={submitting}
          ariaPressed={state.paused}
          title="Hard-halt all scraping now, regardless of schedule. The saved cadence is preserved and resumes when released."
        >
          {state.paused ? "Release emergency stop" : "Emergency stop"}
        </ActionButton>
        {toast && (
          <span
            role="status"
            style={{
              fontSize: "var(--fs-11)",
              color: toast.kind === "ok" ? "var(--ink-2)" : "var(--sev-critical)",
            }}
          >
            {toast.message}
          </span>
        )}
        {!scrapingOn && (
          <span style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
            Currently nothing scrapes.
          </span>
        )}
      </div>
    </div>
  );
}

// ── Per-source admin row controls (pause / fetch-now / regenerate-brief) ──

interface SourceRowControlsProps {
  sourceId: string;
  initialPaused?: boolean;
  initialAdminOnly?: boolean;
}

export function SourceRowControls({ sourceId, initialPaused = false, initialAdminOnly = false }: SourceRowControlsProps) {
  const [paused, setPaused] = useState(initialPaused);
  const [adminOnly, setAdminOnly] = useState(initialAdminOnly);
  const [pausing, setPausing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatusMsg({ kind, text });
    setTimeout(() => setStatusMsg(null), 8000);
  }

  async function togglePause() {
    setPausing(true);
    try {
      const res = await authedFetch(`/api/admin/sources/${sourceId}/pause`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ paused: !paused }),
      });
      if (res.ok) {
        setPaused(!paused);
        flash("ok", !paused ? "Source paused" : "Source resumed");
      } else {
        const payload = await res.json();
        flash("err", payload.error || "Pause toggle failed");
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setPausing(false);
    }
  }

  async function fetchNow() {
    setFetching(true);
    try {
      const res = await authedFetch(`/api/admin/sources/${sourceId}/fetch-now`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        flash("ok", `Fetched ${payload.contentLength}c via ${payload.method} in ${payload.durationMs}ms (sha ${payload.contentHash})`);
      } else {
        flash("err", payload.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setFetching(false);
    }
  }

  async function regenerateBrief() {
    setRegenerating(true);
    try {
      const res = await authedFetch(`/api/admin/sources/${sourceId}/regenerate-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      // Async contract (Wave-α A4): the route queues a durable workflow and
      // returns 202 {runId} — there is no brief length/section count to show
      // yet. Report queued/skipped honestly.
      if (res.ok && payload.success) {
        if (payload.queued) {
          flash("ok", `Regeneration queued (run ${payload.runId ?? "unknown"}). Reload after the workflow completes.`);
        } else if (payload.skipped === "already_verified") {
          flash("ok", "Item already verified — regeneration skipped.");
        } else {
          flash("ok", payload.message || "Request accepted.");
        }
      } else {
        flash("err", payload.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function toggleVisibility() {
    setTogglingVisibility(true);
    try {
      const next = !adminOnly;
      const res = await authedFetch(`/api/admin/sources/${sourceId}/visibility`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ admin_only: next }),
      });
      if (res.ok) {
        setAdminOnly(next);
        flash("ok", next ? "Hidden from workspaces (admin only)" : "Visible to workspaces");
      } else {
        const payload = await res.json();
        flash("err", payload.error || "Visibility toggle failed");
      }
    } catch (e: any) {
      flash("err", e.message);
    } finally {
      setTogglingVisibility(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={(e) => { e.stopPropagation(); togglePause(); }}
          disabled={pausing}
          aria-label={paused ? "Resume source processing" : "Pause source processing"}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{
            borderColor: paused ? "var(--color-warning)" : "var(--color-border)",
            backgroundColor: paused ? "rgba(255,165,0,0.10)" : "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        >
          {pausing ? <Loader2 size={11} className="animate-spin" /> : paused ? <Play size={11} /> : <Pause size={11} />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); fetchNow(); }}
          disabled={fetching}
          aria-label="Fetch source content now"
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
        >
          {fetching ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          {fetching ? "Fetching…" : "Fetch now"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); regenerateBrief(); }}
          disabled={regenerating}
          aria-label="Regenerate brief for this source"
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
        >
          {regenerating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {regenerating ? "Regenerating…" : "Regenerate brief"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleVisibility(); }}
          disabled={togglingVisibility}
          aria-label={adminOnly ? "Make source visible to workspaces" : "Hide source from workspaces (admin only)"}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border disabled:opacity-50"
          style={{
            borderColor: adminOnly ? "var(--color-primary)" : "var(--color-border)",
            backgroundColor: adminOnly ? "rgba(30,58,138,0.10)" : "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        >
          {togglingVisibility ? <Loader2 size={11} className="animate-spin" /> : null}
          {adminOnly ? "Admin only" : "Show in workspaces"}
        </button>
      </div>
      {statusMsg && (
        <div className="text-[11px]" style={{ color: statusMsg.kind === "ok" ? "var(--color-success)" : "var(--color-error)" }}>
          {statusMsg.text}
        </div>
      )}
    </div>
  );
}

// ── Per-source tier-override control (Phase 7 admin chrome) ──
//
// Inline UI for setting / reverting the operator tier_override per
// source-credibility-model skill Section 7 + ADR-002:
//
//   base_tier      = provenance (immutable per source family, set at
//                    classification)
//   tier_override  = operator override with mandatory reason
//   effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)
//
// The control is mounted next to the existing SourceRowControls (pause /
// fetch-now / regenerate-brief / visibility) so the operator can edit
// every related source action from one screen per DP-1 (Single-Pane
// Operator Review).
//
// Backed by /api/admin/sources/[id]/tier-override (GET for current state
// + audit; POST for set/revert). Service-role writes happen server-side
// only; the client posts the user's bearer token. Audit trail is shown
// inline so the operator can see prior overrides without leaving the row.

interface TierOverrideAuditEntry {
  event_type: "tier_override" | "tier_override_revert";
  reviewer_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

interface TierOverrideState {
  base_tier: number | null;
  tier_override: number | null;
  effective_tier: number | null;
  override_reason: string | null;
  override_date: string | null;
  audit: TierOverrideAuditEntry[];
}

interface SourceTierOverrideControlProps {
  sourceId: string;
  initialBaseTier: number;
  initialTierOverride: number | null;
  initialEffectiveTier: number | null;
}

export function SourceTierOverrideControl({
  sourceId,
  initialBaseTier,
  initialTierOverride,
  initialEffectiveTier,
}: SourceTierOverrideControlProps) {
  const [state, setState] = useState<TierOverrideState>({
    base_tier: initialBaseTier,
    tier_override: initialTierOverride,
    effective_tier: initialEffectiveTier,
    override_reason: null,
    override_date: null,
    audit: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(
    initialTierOverride ?? initialBaseTier
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 6000);
  }

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/admin/sources/${sourceId}/tier-override`);
      if (!res.ok) return;
      const payload = (await res.json()) as TierOverrideState;
      setState(payload);
      setSelectedTier(payload.tier_override ?? payload.base_tier ?? initialBaseTier);
      setLoaded(true);
    } catch {
      // Silent fail: keep the initial props-derived view rather than
      // erroring loudly. The operator can retry by toggling expanded.
    }
  }, [sourceId, initialBaseTier]);

  // Lazy-load the GET state + audit only when the operator expands the
  // panel. Avoids one fetch-per-row on dashboard render.
  useEffect(() => {
    if (expanded && !loaded) load();
  }, [expanded, loaded, load]);

  async function submitOverride() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      flash("err", "Reason required");
      return;
    }
    if (state.base_tier !== null && selectedTier === state.base_tier && state.tier_override === null) {
      flash("err", "Override matches base_tier; nothing to set. Revert instead.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authedFetch(`/api/admin/sources/${sourceId}/tier-override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tier_override: selectedTier,
          override_reason: trimmedReason,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        // Optimistic update: reflect the new override in local state and
        // immediately re-fetch so the audit list grows in place.
        setState((prev) => ({
          ...prev,
          tier_override: payload.tier_override,
          effective_tier: payload.after_tier,
          override_reason: payload.override_reason,
          override_date: payload.override_date,
        }));
        setReason("");
        flash("ok", `Override saved: T${payload.before_tier} -> T${payload.after_tier}`);
        await load();
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function revertOverride() {
    setReverting(true);
    try {
      const res = await authedFetch(`/api/admin/sources/${sourceId}/tier-override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tier_override: null,
          override_reason: reason.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        setState((prev) => ({
          ...prev,
          tier_override: null,
          effective_tier: payload.after_tier,
          override_reason: null,
          override_date: payload.override_date,
        }));
        setReason("");
        flash("ok", `Reverted to base T${payload.after_tier}`);
        await load();
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setReverting(false);
    }
  }

  const hasOverride = state.tier_override !== null;
  const displayEffective =
    state.effective_tier ?? state.tier_override ?? state.base_tier;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded border self-start"
        style={{
          borderColor: hasOverride ? "var(--color-warning)" : "var(--color-border)",
          backgroundColor: hasOverride
            ? "rgba(217, 119, 6, 0.08)"
            : "var(--color-surface)",
          color: "var(--color-text-primary)",
        }}
      >
        <Shield size={12} />
        <span>
          Base T{state.base_tier ?? "?"}
          {" | "}
          Effective T{displayEffective ?? "?"}
          {hasOverride && (
            <span
              className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{
                color: "var(--color-warning)",
                backgroundColor: "rgba(217, 119, 6, 0.12)",
              }}
            >
              OVERRIDE T{state.tier_override}
            </span>
          )}
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>
          {expanded ? "Close" : "Edit"}
        </span>
      </button>

      {expanded && (
        <div
          className="rounded-lg border p-3 space-y-3"
          onClick={(e) => e.stopPropagation()}
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface-raised)",
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div>
              <div
                className="font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Base tier
              </div>
              <div
                className="text-sm font-semibold mt-0.5"
                style={{ color: "var(--color-text-primary)" }}
              >
                T{state.base_tier ?? "?"}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                Immutable, set at classification
              </div>
            </div>
            <div>
              <div
                className="font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Effective tier
              </div>
              <div
                className="text-sm font-semibold mt-0.5"
                style={{ color: "var(--color-text-primary)" }}
              >
                T{displayEffective ?? "?"}
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                COALESCE(override, dynamic, base)
              </div>
            </div>
            <div>
              <div
                className="font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Override
              </div>
              <div
                className="text-sm font-semibold mt-0.5"
                style={{ color: hasOverride ? "var(--color-warning)" : "var(--color-text-muted)" }}
              >
                {hasOverride ? `T${state.tier_override}` : "(none)"}
              </div>
              {state.override_date && (
                <div
                  className="text-[10px] mt-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {formatRelative(toDate(state.override_date) ?? new Date())}
                </div>
              )}
            </div>
          </div>

          {state.override_reason && (
            <div
              className="text-[11px] rounded p-2"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border-subtle)",
                color: "var(--color-text-secondary)",
              }}
            >
              <span
                className="font-semibold uppercase tracking-wider text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Current reason
              </span>
              <div className="mt-1">{state.override_reason}</div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Set override
              </span>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(parseInt(e.target.value, 10))}
                className="px-2 py-1 text-xs rounded border"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((t) => (
                  <option key={t} value={t}>
                    T{t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Reason (required when setting)
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Operator domain knowledge justifying the override"
                className="px-2 py-1 text-xs rounded border"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              />
            </label>
            <button
              onClick={submitOverride}
              disabled={submitting || reverting}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded border disabled:opacity-50"
              style={{
                borderColor: "var(--color-primary)",
                backgroundColor: "var(--color-primary)",
                color: "var(--color-invert-text)",
              }}
            >
              {submitting ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {submitting ? "Saving..." : hasOverride ? "Update override" : "Set override"}
            </button>
            {hasOverride && (
              <button
                onClick={revertOverride}
                disabled={submitting || reverting}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded border disabled:opacity-50"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }}
              >
                {reverting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                {reverting ? "Reverting..." : "Revert to base"}
              </button>
            )}
          </div>

          {status && (
            <div
              className="text-[11px]"
              style={{
                color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
              }}
            >
              {status.text}
            </div>
          )}

          {/* Audit trail (recent override events for this source) */}
          {loaded && (
            <div className="space-y-1.5">
              <div
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Recent override audit
              </div>
              {state.audit.length === 0 ? (
                <div
                  className="text-[11px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No prior override events.
                </div>
              ) : (
                <ul className="space-y-1">
                  {state.audit.map((ev, idx) => {
                    const details = (ev.details || {}) as {
                      before_tier?: number | null;
                      after_tier?: number | null;
                      previous_override?: number | null;
                      reason?: string | null;
                    };
                    const when = toDate(ev.created_at);
                    return (
                      <li
                        key={`${ev.created_at}-${idx}`}
                        className="text-[11px] p-1.5 rounded"
                        style={{
                          backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border-subtle)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="font-semibold"
                            style={{
                              color:
                                ev.event_type === "tier_override"
                                  ? "var(--color-warning)"
                                  : "var(--color-text-secondary)",
                            }}
                          >
                            {ev.event_type === "tier_override"
                              ? `Set T${details.before_tier ?? "?"} -> T${details.after_tier ?? "?"}`
                              : `Revert (prior T${details.previous_override ?? "?"})`}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {when ? formatRelative(when) : ev.created_at}
                          </span>
                        </div>
                        {details.reason && (
                          <div className="mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            {details.reason}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
