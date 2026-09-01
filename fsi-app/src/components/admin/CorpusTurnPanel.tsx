"use client";

/**
 * CorpusTurnPanel — lane EV, 2026-09-01.
 *
 * Two operator controls the flywheel-completion dispatch named as missing a UI caller entirely:
 *
 *   1. "Run intake now" — POSTs /api/admin/run-intake (already wired end-to-end server-side; had NO
 *      caller anywhere in the admin UI before this panel). That route needs at least one candidate
 *      { title, source_url, item_type } and runs it through the machine-gated intake cycle — plan (free,
 *      read-only verdict) or apply (paid, fires the cycle). This panel is the minimal form that satisfies
 *      that contract; it does not change the route's shape.
 *   2. "Request corpus turn" — POSTs /api/admin/corpus-turn-requests (new, same commit) to manually
 *      enqueue a reason='manual' row for one item id, or backfill one for every live item lacking an open
 *      request. Surfaces the open-request count and the last-consumed timestamp so the operator can see
 *      whether the queue migration 277's trigger fills is actually being drained.
 *
 * Self-contained (own auth/fetch, no props) — same shape IngestRejectionsView/ResearchPipelineQueueView
 * already establish for a standalone admin section body.
 */

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { PlayCircle, ListPlus, RefreshCw } from "lucide-react";
import { formatRelative, toDate } from "@/lib/relative-time";

interface OpenRequest {
  id: string;
  intelligence_item_id: string;
  reason: string;
  requested_at: string;
  item: { id: string; title: string; legacy_id: string | null } | null;
}

interface RequestsResponse {
  open: OpenRequest[];
  open_count: number;
  last_consumed_at: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token || ""}`,
  };
}

function fieldStyle(): React.CSSProperties {
  return {
    fontFamily: "inherit",
    fontSize: 12.5,
    padding: "9px 12px",
    borderRadius: 6,
    border: "1px solid var(--color-border-medium)",
    background: "var(--color-background)",
    color: "var(--text)",
    outline: "none",
  };
}

export function CorpusTurnPanel() {
  // ── queue visibility ──────────────────────────────────────────────────────────────────────────────
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setQueueError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/corpus-turn-requests", { headers });
      const payload = await res.json();
      if (!res.ok) {
        setQueueError(payload?.error || `HTTP ${res.status}`);
      } else {
        setData(payload as RequestsResponse);
      }
    } catch (e: any) {
      setQueueError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // ── "Request corpus turn" ─────────────────────────────────────────────────────────────────────────
  const [turnItemId, setTurnItemId] = useState("");
  const [turnBusy, setTurnBusy] = useState<"item" | "all" | null>(null);
  const [turnResult, setTurnResult] = useState<any>(null);

  async function requestTurn(body: { itemId: string } | { all: true }) {
    setTurnBusy("itemId" in body ? "item" : "all");
    setTurnResult(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/corpus-turn-requests", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      setTurnResult({ ok: res.ok, ...payload });
      if (res.ok) {
        if ("itemId" in body) setTurnItemId("");
        loadQueue();
      }
    } catch (e: any) {
      setTurnResult({ ok: false, error: e.message || "Network error" });
    } finally {
      setTurnBusy(null);
    }
  }

  // ── "Run intake now" ──────────────────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [itemType, setItemType] = useState("");
  const [mode, setMode] = useState<"plan" | "apply">("plan");
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeResult, setIntakeResult] = useState<any>(null);

  async function runIntake() {
    if (!title.trim() || !sourceUrl.trim() || !itemType.trim()) return;
    setIntakeBusy(true);
    setIntakeResult(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/run-intake", {
        method: "POST",
        headers,
        body: JSON.stringify({
          candidates: [{ title: title.trim(), source_url: sourceUrl.trim(), item_type: itemType.trim() }],
          mode,
        }),
      });
      const payload = await res.json();
      setIntakeResult({ ok: res.ok, ...payload });
    } catch (e: any) {
      setIntakeResult({ ok: false, error: e.message || "Network error" });
    } finally {
      setIntakeBusy(false);
    }
  }

  const lastConsumedDate = data?.last_consumed_at ? toDate(data.last_consumed_at) : null;
  const lastConsumedLabel = lastConsumedDate ? formatRelative(lastConsumedDate) : "never";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ── Corpus-turn queue ── */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            background: "var(--raised)",
            borderBottom: "1px solid var(--color-border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text)",
            }}
          >
            Corpus turn queue
          </span>
          <Button variant="ghost" size="sm" onClick={loadQueue} disabled={loading}>
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
            Migration 277&rsquo;s trigger enqueues a request every time an item&rsquo;s verification, archive, or tag
            state changes outside the in-app mint/update flywheel hooks. A GitHub Actions corpus-turn
            workflow (or an operator run of{" "}
            <code style={{ fontFamily: "monospace" }}>scripts/turns/consume-turn-requests.mjs</code>)
            drains this queue.
          </p>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Open requests
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: (data?.open_count ?? 0) > 0 ? "var(--sev-high, var(--text))" : "var(--text)" }}>
                {loading ? "…" : (data?.open_count ?? 0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Last consumed
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                {loading ? "…" : lastConsumedLabel}
              </div>
            </div>
          </div>

          {queueError && (
            <p style={{ fontSize: 12, color: "var(--color-error)", margin: 0 }}>{queueError}</p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Item id (uuid)"
              value={turnItemId}
              onChange={(e) => setTurnItemId(e.target.value)}
              style={{ ...fieldStyle(), flex: 1, minWidth: 220 }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => requestTurn({ itemId: turnItemId.trim() })}
              disabled={!turnItemId.trim() || turnBusy !== null}
            >
              <ListPlus size={14} />
              {turnBusy === "item" ? "Requesting…" : "Request corpus turn"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => requestTurn({ all: true })}
              disabled={turnBusy !== null}
            >
              {turnBusy === "all" ? "Backfilling…" : "Request for all live items"}
            </Button>
          </div>

          {turnResult && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${turnResult.ok ? "var(--color-success)" : "var(--color-error)"}`,
                background: "var(--surface)",
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              {turnResult.ok
                ? turnResult.already_open !== undefined && turnResult.total_live !== undefined
                  ? `Backfill: ${turnResult.inserted} new request(s) inserted, ${turnResult.already_open} item(s) already had an open request (${turnResult.total_live} live items total).`
                  : turnResult.already_open
                    ? "That item already has an open corpus turn request."
                    : "Corpus turn request created."
                : turnResult.error}
            </div>
          )}
        </div>
      </div>

      {/* ── Run intake now ── */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            background: "var(--raised)",
            borderBottom: "1px solid var(--color-border-subtle)",
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text)",
            }}
          >
            Run intake now
          </span>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
            Fires one intake cycle (POST /api/admin/run-intake) over a single named candidate — no loop,
            no schedule. <strong>Plan</strong> is free and read-only (the gate verdict, nothing staged or
            spent); <strong>Apply</strong> fires the cycle for real (paid generation). The machine gates
            ARE the approval — there is no separate human approve step after Apply.
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...fieldStyle(), flex: 2, minWidth: 180 }}
            />
            <input
              type="text"
              placeholder="Source URL"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              style={{ ...fieldStyle(), flex: 2, minWidth: 180 }}
            />
            <input
              type="text"
              placeholder="Item type (e.g. regulation)"
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              style={{ ...fieldStyle(), flex: 1, minWidth: 160 }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "plan" | "apply")}
              style={fieldStyle()}
            >
              <option value="plan">Plan (free, read-only)</option>
              <option value="apply">Apply (fires the cycle)</option>
            </select>
            <Button
              variant="primary"
              onClick={runIntake}
              disabled={intakeBusy || !title.trim() || !sourceUrl.trim() || !itemType.trim()}
            >
              <PlayCircle size={14} />
              {intakeBusy ? "Running…" : "Run intake now"}
            </Button>
          </div>

          {intakeResult && (
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${intakeResult.ok ? "var(--color-success)" : "var(--color-error)"}`,
                background: "var(--color-background)",
                fontSize: 11,
                color: "var(--text)",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(intakeResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
