"use client";

/**
 * IntegrityFlagsView — admin sub-tab listing intelligence_items rows
 * whose agent-emitted full_brief contains an integrity-concern phrase.
 *
 * Backed by:
 *   GET  /api/admin/integrity-flags                 — list + stats
 *   POST /api/admin/integrity-flags/[id]/resolve    — replace_url / mark_resolved
 *   POST /api/admin/integrity-flags/[id]/regenerate — queue durable regen workflow (flag preserved; resolution manual)
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
import { authedFetch } from "@/lib/api/authed-fetch";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatLocaleDate } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  RotateCcw,
  Link as LinkIcon,
  Eye,
} from "lucide-react";
import {
  AdminSectionHeader,
  AdminErrorBanner,
  AdminStatCellLarge,
  AdminIconEmptyState,
  AdminFixedToast,
} from "@/components/admin/AdminTableView";

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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await authedFetch("/api/admin/integrity-flags");
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
  }, []);

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
      const path =
        action === "regenerate"
          ? `/api/admin/integrity-flags/${encodeURIComponent(id)}/regenerate`
          : `/api/admin/integrity-flags/${encodeURIComponent(id)}/resolve`;

      const resp = await authedFetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(action === "regenerate" ? {} : { action, ...extra }),
      });
      const payload = await resp.json();

      if (!resp.ok) {
        showToast(`Error: ${payload?.error || `Status ${resp.status}`}`);
        return;
      }

      if (action === "regenerate") {
        // Async contract (Wave-α A4): regeneration is queued as a durable
        // workflow; the flag stays open until the operator resolves it
        // after inspecting the fresh brief. No auto-resolve.
        if (payload.queued) {
          showToast(
            `Regeneration queued (run ${payload.runId ?? "unknown"}). Flag stays open — re-check after the run completes.`
          );
        } else if (payload.skipped === "already_verified") {
          showToast("Item already verified — nothing regenerated. Flag preserved.");
        } else {
          showToast(payload.message || "Regeneration request accepted.");
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
      <AdminSectionHeader
        title="Agent integrity flags"
        description={
          <>
            Briefs where the agent self-reported it could not verify the source
            URL or the source content didn&apos;t match the request. Each row
            is surfaced for review — the operator may resolve it.
          </>
        }
        onRefresh={load}
        loading={loading}
      />

      {/* Stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AdminStatCellLarge
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
        <AdminStatCellLarge
          label="All-time flagged"
          value={
            loading ? "…" : data ? String(data.stats.totalFlagged) : "—"
          }
        />
        <AdminStatCellLarge
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
      <AdminErrorBanner error={error} />

      {/* Table */}
      {!loading && data && data.items.length === 0 && !error && (
        <EmptyState />
      )}

      {!loading && data && data.items.length > 0 && (
        <div
          className="rounded-lg overflow-x-auto"
          style={{ border: "1px solid var(--color-border)" }}
        >
          {/* L-5 (2026-07-11): overflow-x-auto is the safety hatch so any residual wide row
              scrolls INSIDE the panel instead of overflowing the page body. With the URL cell
              wrapping (L-4) the table should already fit; this guarantees the body never
              scrolls horizontally. */}
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
                  ? formatLocaleDate(new Date(row.flaggedAt))
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
                      {/* L-4 (2026-07-11): URL-cell class. A long unbroken URL (EcoVadis,
                          EU-climate, …) must WRAP within the capped column, not stretch it.
                          `truncate` on an inline-flex anchor never engaged; use a block flex
                          anchor with break-all on the URL text so ANY long URL wraps. */}
                      <div className="flex flex-col gap-0.5 max-w-[260px] min-w-0">
                        <span style={{ color: "var(--color-text-primary)" }}>
                          {row.sourceName || "(no registry source)"}
                        </span>
                        {row.sourceUrl && (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] hover:underline flex items-start gap-1 break-all"
                            style={{ color: "var(--color-primary)" }}
                          >
                            <ExternalLink size={10} className="shrink-0 mt-0.5" />
                            <span className="break-all min-w-0">{row.sourceUrl}</span>
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
      <AdminFixedToast toast={toast} />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
    <AdminIconEmptyState
      icon={<CheckCircle size={28} />}
      iconColor="var(--color-success)"
      title="No unresolved integrity flags"
      description={
        <>
          Every brief whose agent emitted an integrity concern phrase has been
          resolved. New flags appear here automatically when the integrity rule
          trigger fires.
        </>
      }
      footer={
        <>
          <AlertTriangle size={11} />
          {"Powered by migration 035 — agent_integrity_flag column."/* glyph:verbatim */}
        </>
      }
    />
  );
}
