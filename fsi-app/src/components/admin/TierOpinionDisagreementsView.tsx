"use client";

/**
 * TierOpinionDisagreementsView — Phase 7 admin chrome.
 *
 * Surfaces sources where the brief-generation agent's tier opinions
 * disagree with the source's currently-stored base_tier (5+ disagreeing
 * opinions in the last 90 days, per migration 091 +
 * get_tier_opinion_disagreements). The operator can:
 *
 *   - ACCEPT the analyst tier: sets sources.tier_override to the
 *     modal analyst tier with a reason citing the disagreement, then
 *     dismisses the underlying opinions so the row leaves the queue.
 *     (Uses /api/admin/sources/[id]/tier-override for the override
 *     write and the audit-trail entry in source_trust_events.)
 *
 *   - REJECT the analyst opinion: marks all non-dismissed opinions for
 *     the source as reviewed-dismissed without touching tier_override.
 *
 *   - DEFER: leaves the row alone (no action). Re-surfaces on next
 *     dashboard load.
 *
 * Backed by /api/admin/sources/tier-opinions (GET to load, POST for
 * dismiss; the accept path also hits /api/admin/sources/[id]/tier-override).
 *
 * Per DP-1: every related decision on a single source (view, override,
 * dismiss, audit) is reachable from this row without tab-switching.
 */

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import {
  RefreshCw,
  ExternalLink,
  Check,
  X,
  Clock,
} from "lucide-react";

interface DisagreementItem {
  source_id: string;
  source_name: string;
  source_url: string | null;
  base_tier: number | null;
  effective_tier: number | null;
  tier_override: number | null;
  override_reason: string | null;
  analyst_tier: number | null;
  opined_tiers: number[];
  opinion_count: number;
  distinct_disagreeing_tiers: number;
  delta: number | null;
}

interface DisagreementsResponse {
  items: DisagreementItem[];
}

export function TierOpinionDisagreementsView() {
  const supabase = createSupabaseBrowserClient();
  const [items, setItems] = useState<DisagreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reasonByRow, setReasonByRow] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 6000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/sources/tier-opinions", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = (await res.json()) as DisagreementsResponse | { error?: string };
      if (!res.ok) {
        setError((payload as { error?: string }).error || `HTTP ${res.status}`);
        setItems([]);
      } else {
        setItems((payload as DisagreementsResponse).items);
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

  async function acceptAnalyst(row: DisagreementItem) {
    if (row.analyst_tier === null) return;
    const reason =
      (reasonByRow[row.source_id] || "").trim() ||
      `Disagreement review: ${row.opinion_count} analyst opinions, modal T${row.analyst_tier} vs base T${row.base_tier}`;
    setPendingId(row.source_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const overrideRes = await fetch(
        `/api/admin/sources/${row.source_id}/tier-override`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            tier_override: row.analyst_tier,
            override_reason: reason,
          }),
        }
      );
      if (!overrideRes.ok) {
        const payload = await overrideRes.json();
        flash("err", payload?.error || `Override failed: HTTP ${overrideRes.status}`);
        return;
      }

      // Now dismiss the underlying opinions so the row leaves the queue.
      const dismissRes = await fetch("/api/admin/sources/tier-opinions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          source_id: row.source_id,
          action: "dismiss",
          reason: `accepted analyst tier T${row.analyst_tier}: ${reason}`,
        }),
      });
      if (!dismissRes.ok) {
        const payload = await dismissRes.json();
        flash("err", `Override applied but dismiss failed: ${payload?.error || dismissRes.status}`);
      } else {
        flash("ok", `Accepted: T${row.base_tier} -> T${row.analyst_tier}`);
        setItems((prev) => prev.filter((r) => r.source_id !== row.source_id));
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function reject(row: DisagreementItem) {
    const reason = (reasonByRow[row.source_id] || "").trim() || null;
    setPendingId(row.source_id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/sources/tier-opinions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          source_id: row.source_id,
          action: "dismiss",
          reason,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        flash("ok", `Dismissed ${payload.dismissed_count} opinion(s)`);
        setItems((prev) => prev.filter((r) => r.source_id !== row.source_id));
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setPendingId(null);
    }
  }

  function defer(row: DisagreementItem) {
    // No server call. Defer is local-only acknowledgement; re-surfaces
    // on next dashboard load. Hide the row from the current view so the
    // operator can keep working.
    setItems((prev) => prev.filter((r) => r.source_id !== row.source_id));
    flash("ok", `Deferred: ${row.source_name} will re-surface on next load`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Tier-opinion disagreements
          </h2>
          <p
            className="text-sm mt-1 max-w-3xl"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Sources where the brief-generation agent has produced 5+ tier
            opinions in the last 90 days that disagree with the source&apos;s
            current base tier. Accept overrides the effective tier using the
            modal analyst opinion (writes to tier_override per ADR-002, leaves
            base_tier untouched). Reject dismisses the opinions without
            changing the tier. Defer hides the row until the next refresh.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} />
          Refresh
        </Button>
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

      {!loading && !error && items.length === 0 && (
        <div
          className="p-8 rounded-lg text-center"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-secondary)",
          }}
        >
          <p className="text-sm">No active tier-opinion disagreements.</p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Sources surface here when 5+ non-dismissed opinions in the last 90
            days disagree with the source&apos;s base tier.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--color-border)" }}
        >
          <table className="w-full text-[12.5px] border-collapse">
            <thead style={{ background: "var(--color-surface-raised)" }}>
              <tr>
                <Th>Source</Th>
                <Th>Base</Th>
                <Th>Effective</Th>
                <Th>Analyst (modal)</Th>
                <Th>Delta</Th>
                <Th>Opinion count</Th>
                <Th>Reviewer reason</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const isPending = pendingId === row.source_id;
                const reasonVal = reasonByRow[row.source_id] || "";
                return (
                  <tr
                    key={row.source_id}
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <Td>
                      <div className="flex flex-col gap-0.5 max-w-[260px]">
                        <span
                          className="font-semibold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {row.source_name}
                        </span>
                        {row.source_url && (
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] truncate hover:underline inline-flex items-center gap-1"
                            style={{ color: "var(--color-primary)" }}
                          >
                            <ExternalLink size={10} />
                            {row.source_url}
                          </a>
                        )}
                        {row.tier_override !== null && (
                          <span
                            className="text-[10px] mt-0.5 inline-flex items-center gap-1"
                            style={{ color: "var(--color-warning)" }}
                          >
                            Existing override T{row.tier_override}
                            {row.override_reason ? `: ${row.override_reason}` : ""}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <TierChip tier={row.base_tier} kind="base" />
                    </Td>
                    <Td>
                      <TierChip tier={row.effective_tier} kind="effective" />
                    </Td>
                    <Td>
                      <TierChip tier={row.analyst_tier} kind="analyst" />
                      <div
                        className="text-[10px] mt-0.5 tabular-nums"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {row.opined_tiers.join(", ")}
                      </div>
                    </Td>
                    <Td>
                      <DeltaBadge delta={row.delta} />
                    </Td>
                    <Td>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {row.opinion_count}
                      </span>
                      <div
                        className="text-[10px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {row.distinct_disagreeing_tiers} distinct disagreeing
                      </div>
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={reasonVal}
                        onChange={(e) =>
                          setReasonByRow((s) => ({
                            ...s,
                            [row.source_id]: e.target.value,
                          }))
                        }
                        placeholder="Optional reason"
                        disabled={isPending}
                        className="text-[11px] px-2 py-1 rounded border w-full max-w-[220px]"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-background)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                    </Td>
                    <Td align="right">
                      <div className="flex flex-col gap-1.5 items-end">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isPending || row.analyst_tier === null}
                          onClick={() => acceptAnalyst(row)}
                        >
                          <Check size={12} />
                          {`Accept T${row.analyst_tier ?? "?"}`}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => reject(row)}
                        >
                          <X size={12} />
                          Reject
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => defer(row)}
                        >
                          <Clock size={12} />
                          Defer
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading disagreements...
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-3 py-2 align-top"
      style={{ textAlign: align ?? "left" }}
    >
      {children}
    </td>
  );
}

function TierChip({
  tier,
  kind,
}: {
  tier: number | null;
  kind: "base" | "effective" | "analyst";
}) {
  if (tier === null) {
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold"
        style={{
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-surface-raised)",
        }}
      >
        ?
      </span>
    );
  }
  const color =
    kind === "analyst"
      ? "var(--color-primary)"
      : kind === "effective"
        ? "var(--color-text-primary)"
        : "var(--color-text-secondary)";
  const bg =
    kind === "analyst"
      ? "var(--color-active-bg)"
      : "var(--color-surface-raised)";
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums"
      style={{ color, backgroundColor: bg }}
    >
      T{tier}
    </span>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        n/a
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold"
        style={{
          color: "var(--color-text-secondary)",
          backgroundColor: "var(--color-surface-raised)",
        }}
      >
        0
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums"
      style={{
        color: positive ? "var(--color-warning)" : "var(--color-success)",
        backgroundColor: positive
          ? "rgba(217,119,6,0.08)"
          : "rgba(22,163,74,0.08)",
      }}
    >
      {positive ? `+${delta}` : `${delta}`}
    </span>
  );
}
