"use client";

/**
 * IntegrityFlagsView — admin sub-tab listing intelligence_items rows
 * whose agent-emitted full_brief contains an integrity-concern phrase.
 *
 * Backed by:
 *   GET  /api/admin/integrity-flags                 — list + stats
 *   POST /api/admin/integrity-flags/[id]/resolve    — replace_url / mark_resolved
 *   POST /api/admin/integrity-flags/[id]/regenerate — re-run agent + auto-resolve
 *
 * Renders:
 *   1. Stat strip — total flagged (all-time), unresolved, oldest age in days
 *   2. Table of unresolved flagged items with per-row action buttons
 *   3. Empty state when zero unresolved flags
 *
 * Mirrors the visual idiom of SourceHealthDashboard (cl-card surfaces, navy
 * accent, var(--color-*) tokens) so the sub-tab feels native to the existing
 * admin shell rather than bolted on.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Link as LinkIcon,
  Eye,
} from "lucide-react";

interface FlaggedItem {
  id: string;
  legacyId: string | null;
  title: string;
  sourceUrl: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceTier: number | null;
  phrase: string | null;
  flaggedAt: string | null;
  updatedAt: string | null;
}

interface FlagsResponse {
  items: FlaggedItem[];
  stats: {
    totalUnresolved: number;
    totalFlagged: number;
    oldestAgeDays: number | null;
  };
}

export function IntegrityFlagsView() {
  const [data, setData] = useState<FlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [replaceUrlState, setReplaceUrlState] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");

  const supabase = createSupabaseBrowserClient();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/admin/integrity-flags", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const payload = await resp.json();
      if (!resp.ok) {
        setError(payload?.error || `Failed to load (${resp.status})`);
        setData(null);
      } else {
        setData(payload);
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

  async function callResolve(
    id: string,
    action: "replace_url" | "regenerate" | "mark_resolved",
    extra: { newSourceUrl?: string; note?: string } = {}
  ) {
    setPendingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const path =
        action === "regenerate"
          ? `/api/admin/integrity-flags/${encodeURIComponent(id)}/regenerate`
          : `/api/admin/integrity-flags/${encodeURIComponent(id)}/resolve`;

      const resp = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify(action === "regenerate" ? {} : { action, ...extra }),
      });
      const payload = await resp.json();

      if (!resp.ok) {
        showToast(`Error: ${payload?.error || `Status ${resp.status}`}`);
        return;
      }

      if (action === "regenerate") {
        if (payload.autoResolved) {
          showToast("Brief regenerated — flag auto-resolved.");
        } else if (payload.stillFlagged) {
          showToast(
            "Brief regenerated, but the new content still trips the integrity rule."
          );
        } else {
          showToast("Brief regenerated.");
        }
      } else if (action === "replace_url") {
        showToast("Source URL replaced — flag resolved.");
      } else {
        showToast("Flag marked resolved.");
      }
      await load();
    } catch (e: any) {
      showToast(`Error: ${e.message || "Network error"}`);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Agent integrity flags
          </h2>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Briefs where the agent self-reported it could not verify the source
            URL or the source content didn&apos;t match the request. Each row
            needs a human decision.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCell
          label="Unresolved"
          value={
            loading
              ? "…"
              : data
                ? String(data.stats.totalUnresolved)
                : "—"
          }
          critical={!!data && data.stats.totalUnresolved > 0}
        />
        <StatCell
          label="All-time flagged"
          value={
            loading ? "…" : data ? String(data.stats.totalFlagged) : "—"
          }
        />
        <StatCell
          label="Oldest unresolved"
          value={
            loading
              ? "…"
              : data && data.stats.oldestAgeDays !== null
                ? `${data.stats.oldestAgeDays}d`
                : "—"
          }
          critical={!!data && (data.stats.oldestAgeDays ?? 0) >= 7}
        />
      </div>

      {/* Error */}
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

      {/* Table */}
      {!loading && data && data.items.length === 0 && !error && (
        <EmptyState />
      )}

      {!loading && data && data.items.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--color-border)" }}
        >
          <table className="w-full text-[12.5px] border-collapse">
            <thead style={{ background: "var(--color-surface-raised)" }}>
              <tr>
                <Th>Item</Th>
                <Th>Source</Th>
                <Th>Flagged</Th>
                <Th>Phrase</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => {
                const detailHref = row.legacyId
                  ? `/regulations/${encodeURIComponent(row.legacyId)}`
                  : `/regulations/${encodeURIComponent(row.id)}`;
                const flaggedLabel = row.flaggedAt
                  ? new Date(row.flaggedAt).toLocaleDateString()
                  : "—";
                const isPending = pendingId === row.id;
                const replaceVal = replaceUrlState[row.id] || "";

                return (
                  <tr
                    key={row.id}
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="font-semibold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {row.title || "(untitled)"}
                        </span>
                        <span
                          className="text-[11px] tabular-nums"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {(row.legacyId || row.id).slice(0, 12)}…
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5 max-w-[260px]">
                        <span style={{ color: "var(--color-text-primary)" }}>
                          {row.sourceName || "(no registry source)"}
                        </span>
                        {row.sourceUrl && (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] truncate hover:underline inline-flex items-center gap-1"
                            style={{ color: "var(--color-primary)" }}
                          >
                            <ExternalLink size={10} />
                            {row.sourceUrl}
                          </a>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {flaggedLabel}
                      </span>
                    </Td>
                    <Td>
                      <code
                        className="text-[11px] px-1.5 py-0.5 rounded"
                        style={{
                          color: "var(--color-warning)",
                          background: "rgba(217, 119, 6, 0.08)",
                          border: "1px solid rgba(217, 119, 6, 0.2)",
                        }}
                      >
                        {row.phrase || "—"}
                      </code>
                    </Td>
                    <Td align="right">
                      <div className="flex flex-col items-stretch gap-1.5">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          <Link href={detailHref} target="_blank">
                            <Button variant="secondary" size="sm">
                              <Eye size={12} />
                              View brief
                            </Button>
                          </Link>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isPending}
                            onClick={() => callResolve(row.id, "regenerate")}
                          >
                            <RotateCcw size={12} />
                            Regenerate
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              callResolve(row.id, "mark_resolved", {
                                note: "marked resolved from admin UI",
                              })
                            }
                          >
                            <CheckCircle size={12} />
                            Mark resolved
                          </Button>
                        </div>

                        {/* Inline replace-URL row — kept compact so the table
                            doesn't grow a second row per item. The input is
                            disabled until the row isn't pending another call. */}
                        <div className="flex gap-1.5 justify-end">
                          <input
                            type="url"
                            placeholder="Replacement source URL"
                            value={replaceVal}
                            onChange={(e) =>
                              setReplaceUrlState((s) => ({
                                ...s,
                                [row.id]: e.target.value,
                              }))
                            }
                            disabled={isPending}
                            className="text-[11px] px-2 py-1 rounded border max-w-[240px]"
                            style={{
                              borderColor: "var(--color-border)",
                              backgroundColor: "var(--color-background)",
                              color: "var(--color-text-primary)",
                            }}
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              isPending ||
                              !replaceVal.startsWith("http")
                            }
                            onClick={() =>
                              callResolve(row.id, "replace_url", {
                                newSourceUrl: replaceVal,
                              })
                            }
                          >
                            <LinkIcon size={12} />
                            Replace URL
                          </Button>
                        </div>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm font-medium shadow-lg"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-primary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  critical,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{
        border: critical
          ? "1px solid var(--color-warning)"
          : "1px solid var(--color-border)",
        backgroundColor: critical
          ? "rgba(217, 119, 6, 0.05)"
          : "var(--color-surface)",
      }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{
          color: critical ? "var(--color-warning)" : "var(--color-text-muted)",
        }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-semibold tabular-nums"
        style={{
          color: critical
            ? "var(--color-warning)"
            : "var(--color-text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left px-3 py-2.5 font-bold text-[10.5px] uppercase tracking-wide"
      style={{
        color: "var(--color-text-secondary)",
        letterSpacing: "0.06em",
      }}
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
  align?: "right";
}) {
  return (
    <td
      className="px-3 py-3 align-top"
      style={{
        textAlign: align === "right" ? "right" : "left",
        color: "var(--color-text-primary)",
      }}
    >
      {children}
    </td>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center rounded-lg"
      style={{
        border: "1px dashed var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <CheckCircle size={28} style={{ color: "var(--color-success)" }} />
      <h3
        className="mt-3 text-sm font-medium"
        style={{ color: "var(--color-text-primary)" }}
      >
        No unresolved integrity flags
      </h3>
      <p
        className="mt-1 text-xs max-w-md"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Every brief whose agent emitted an integrity concern phrase has been
        resolved. New flags appear here automatically when the integrity rule
        trigger fires.
      </p>
      <p
        className="mt-3 text-[11px] inline-flex items-center gap-1.5"
        style={{ color: "var(--color-text-muted)" }}
      >
        <AlertTriangle size={11} />
        Powered by migration 035 — agent_integrity_flag column.
      </p>
    </div>
  );
}
