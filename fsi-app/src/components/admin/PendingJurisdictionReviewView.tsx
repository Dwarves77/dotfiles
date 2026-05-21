"use client";

/**
 * PendingJurisdictionReviewView — Phase 7 admin chrome triage queue.
 *
 * Surfaces public.pending_jurisdiction_review rows (migration 082) that
 * have not been resolved yet. Each row is a flagged jurisdiction token
 * on an intelligence_items row that needs operator reclassification:
 * continents (ASIA, EUROPE), region buckets (LATAM, MEAF, APAC),
 * undefined groups (DEVELOPING_COUNTRIES, G7, BRICS).
 *
 * Actions per row (matching the dispatch brief):
 *   - confirm: operator says the token is canonical for this item; mark
 *     resolved with resolution_value = original value, no edit to the
 *     intelligence_items array.
 *   - manually-classify: operator supplies a canonical replacement; the
 *     intelligence_items array swaps current_value -> resolution_value.
 *   - dismiss: drop the flagged value from the intelligence_items array
 *     entirely; resolution_value = NULL.
 *
 * Per DP-1: every related decision on this item-token tuple (current
 * array context, action, canonical picker, notes) is reachable inline
 * without a tab switch.
 */

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import { RefreshCw, CheckCircle, Edit3, Trash2 } from "lucide-react";
import { formatRelative, toDate } from "@/lib/relative-time";

interface PjrItem {
  id: string;
  intelligence_item_id: string;
  current_value: string;
  flagged_reason: string;
  source_column: "jurisdictions" | "jurisdiction_iso";
  flagged_at: string;
  item?: {
    id?: string;
    title?: string | null;
    jurisdictions?: string[] | null;
    jurisdiction_iso?: string[] | null;
  } | null;
}

interface PjrResponse {
  items: PjrItem[];
  total_unresolved: number | null;
  list_capped: boolean;
}

export function PendingJurisdictionReviewView() {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<PjrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resolutionByRow, setResolutionByRow] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 5000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/triage/pending-jurisdiction-review", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(payload as PjrResponse);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function triage(
    row: PjrItem,
    action: "confirm" | "manually-classify" | "dismiss",
    resolutionValue?: string
  ) {
    setPendingId(row.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/triage/pending-jurisdiction-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          id: row.id,
          action,
          resolution_value: resolutionValue ?? null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        flash("ok", `Marked ${action}`);
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((i) => i.id !== row.id),
                total_unresolved:
                  typeof prev.total_unresolved === "number"
                    ? Math.max(0, prev.total_unresolved - 1)
                    : prev.total_unresolved,
              }
            : prev
        );
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Pending jurisdiction review
          </h2>
          <p
            className="text-sm mt-1 max-w-3xl"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Flagged jurisdiction tokens on intelligence_items rows that need
            operator reclassification: continents, region buckets, undefined
            groups. Confirm keeps the value as-is, manually-classify swaps
            in a canonical replacement, dismiss drops the value from the
            item&apos;s array.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat
          label="Unresolved total"
          value={
            loading
              ? "..."
              : data?.total_unresolved !== null && data?.total_unresolved !== undefined
                ? String(data.total_unresolved)
                : "0"
          }
          critical={(data?.total_unresolved ?? 0) > 0}
        />
        <Stat
          label="Showing"
          value={loading ? "..." : String(data?.items.length ?? 0)}
          meta={data?.list_capped ? "List capped at 200" : undefined}
        />
      </div>

      {status && (
        <div
          className="text-xs p-2 rounded"
          style={{
            color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
            backgroundColor:
              status.kind === "ok"
                ? "rgba(22,163,74,0.04)"
                : "rgba(220,38,38,0.04)",
            border:
              status.kind === "ok"
                ? "1px solid rgba(22,163,74,0.2)"
                : "1px solid rgba(220,38,38,0.2)",
          }}
        >
          {status.text}
        </div>
      )}

      {error && (
        <div
          className="p-3 rounded-md text-sm"
          style={{
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
            backgroundColor: "rgba(220,38,38,0.04)",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (data?.items ?? []).length === 0 && (
        <EmptyState />
      )}

      {!loading && (data?.items ?? []).length > 0 && (
        <div className="space-y-3">
          {(data?.items ?? []).map((row) => {
            const isPending = pendingId === row.id;
            const when = toDate(row.flagged_at);
            const resolutionVal = resolutionByRow[row.id] || "";
            const arr =
              (row.source_column === "jurisdictions"
                ? row.item?.jurisdictions
                : row.item?.jurisdiction_iso) || [];
            // Suggested canonical alternatives from the current array
            // (peers next to the flagged token). Lets the operator click
            // a sibling token if they want to consolidate.
            const peers = arr.filter((v) => v !== row.current_value);
            return (
              <div
                key={row.id}
                className="rounded-lg border p-3 space-y-2.5"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {row.item?.title || "(untitled item)"}
                      </span>
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          color: "var(--color-warning)",
                          background: "rgba(217,119,6,0.08)",
                          border: "1px solid rgba(217,119,6,0.2)",
                        }}
                      >
                        {row.flagged_reason}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        col {row.source_column}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                      <span style={{ color: "var(--color-text-muted)" }}>
                        Flagged token:
                      </span>
                      <code
                        className="px-1.5 py-0.5 rounded font-bold"
                        style={{
                          color: "var(--color-text-primary)",
                          background: "var(--color-surface-raised)",
                          border: "1px solid var(--color-border-subtle)",
                        }}
                      >
                        {row.current_value}
                      </code>
                    </div>
                    {peers.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span style={{ color: "var(--color-text-muted)" }}>
                          Sibling tokens on item:
                        </span>
                        {peers.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              setResolutionByRow((s) => ({ ...s, [row.id]: p }))
                            }
                            className="px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:opacity-80"
                            style={{
                              color: "var(--color-text-secondary)",
                              background: "var(--color-surface-raised)",
                              border: "1px solid var(--color-border-subtle)",
                            }}
                            title="Click to use as canonical replacement"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span
                    className="tabular-nums text-[11px] whitespace-nowrap"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {when ? formatRelative(when) : row.flagged_at}
                  </span>
                </div>

                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Canonical replacement (manually-classify only)
                    </span>
                    <input
                      type="text"
                      value={resolutionVal}
                      onChange={(e) =>
                        setResolutionByRow((s) => ({ ...s, [row.id]: e.target.value }))
                      }
                      placeholder="e.g. DE, US-CA, EUR"
                      disabled={isPending}
                      className="text-xs px-2 py-1 rounded border"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-background)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => triage(row, "confirm")}
                  >
                    <CheckCircle size={12} />
                    Confirm
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isPending || !resolutionVal.trim()}
                    onClick={() => triage(row, "manually-classify", resolutionVal.trim())}
                  >
                    <Edit3 size={12} />
                    Manually classify
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => triage(row, "dismiss")}
                  >
                    <Trash2 size={12} />
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading...
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  meta,
  critical,
}: {
  label: string;
  value: string;
  meta?: string;
  critical?: boolean;
}) {
  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        borderColor: critical ? "var(--color-warning)" : "var(--color-border)",
        backgroundColor: critical
          ? "rgba(217,119,6,0.04)"
          : "var(--color-surface)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums mt-1"
        style={{
          color: critical ? "var(--color-warning)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
      {meta && (
        <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          {meta}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="p-8 rounded-lg text-center"
      style={{
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-secondary)",
      }}
    >
      <p className="text-sm">No pending jurisdiction-review rows.</p>
      <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
        Rows accumulate as the BEFORE INSERT trigger on intelligence_items
        flags continents, region buckets, and undefined groups for operator
        reclassification.
      </p>
    </div>
  );
}
