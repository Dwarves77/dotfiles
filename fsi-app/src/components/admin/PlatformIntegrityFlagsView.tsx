"use client";

/**
 * PlatformIntegrityFlagsView — admin sub-tab for the platform-level
 * integrity_flags table from migration 048.
 *
 * DISTINCT from IntegrityFlagsView (which surfaces per-brief flags
 * from migration 035 — the intelligence_items.agent_integrity_flag*
 * columns). This view surfaces the broader class of agent-detected
 * concerns that aren't tied to a single intelligence_items row:
 * design_drift, data_quality, source_issue, coverage_gap,
 * data_integrity, surface_concern.
 *
 * Backed by:
 *   GET   /api/admin/integrity-flags?platform=1   — list with filters
 *   PATCH /api/admin/integrity-flags?platform=1   — status update
 *
 * Renders:
 *   1. Filter chips — by category (6) and by status (4)
 *   2. List view sorted by created_at DESC
 *   3. Per-row controls — change status to in_review/resolved/archived
 *      with optional resolution_note
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/Button";
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Archive,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const CATEGORIES = [
  "design_drift",
  "data_quality",
  "source_issue",
  "coverage_gap",
  "data_integrity",
  "surface_concern",
] as const;
type Category = (typeof CATEGORIES)[number];

const STATUSES = ["open", "in_review", "resolved", "archived"] as const;
type Status = (typeof STATUSES)[number];

interface RecommendedAction {
  action: string;
  rationale?: string;
}

interface PlatformFlag {
  id: string;
  category: Category;
  subject_type: string;
  subject_ref: string;
  description: string;
  recommended_actions: RecommendedAction[];
  status: Status;
  created_at: string;
  created_by: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

interface FlagsResponse {
  items: PlatformFlag[];
  counts: {
    byCategory: Record<Category, number>;
    byStatus: Record<Status, number>;
    total: number;
  };
}

const CATEGORY_LABELS: Record<Category, string> = {
  design_drift: "Design drift",
  data_quality: "Data quality",
  source_issue: "Source issue",
  coverage_gap: "Coverage gap",
  data_integrity: "Data integrity",
  surface_concern: "Surface concern",
};

const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  archived: "Archived",
};

export function PlatformIntegrityFlagsView() {
  const [data, setData] = useState<FlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "open_or_review">(
    "open_or_review"
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ platform: "1" });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (statusFilter !== "open_or_review") params.set("status", statusFilter);
      const resp = await fetch(`/api/admin/integrity-flags?${params}`, {
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
  }, [supabase, categoryFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(
    id: string,
    nextStatus: Exclude<Status, "open">,
    note?: string
  ) {
    setPendingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch("/api/admin/integrity-flags?platform=1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ id, status: nextStatus, resolution_note: note }),
      });
      const payload = await resp.json();
      if (!resp.ok) {
        showToast(`Error: ${payload?.error || `Status ${resp.status}`}`);
        return;
      }
      showToast(`Flag marked ${STATUS_LABELS[nextStatus].toLowerCase()}.`);
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
            Platform integrity flags
          </h2>
          <p
            className="text-sm mt-1 max-w-2xl"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Agent-surfaced concerns that aren&apos;t tied to a single brief —
            design drift, data quality gaps, source issues, coverage gaps, data
            integrity breaks, surface concerns. Distinct from per-brief flags
            (Integrity flags tab). Migration 048.
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

      {/* Stat strip — totals by status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUSES.map((s) => {
          const count = data?.counts.byStatus[s] ?? 0;
          const critical = s === "open" && count > 0;
          return (
            <StatCell
              key={s}
              label={STATUS_LABELS[s]}
              value={loading ? "…" : String(count)}
              critical={critical}
            />
          );
        })}
      </div>

      {/* Filter chips */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterLabel>Category:</FilterLabel>
          <Chip
            active={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
            label={`All (${data?.counts.total ?? 0})`}
          />
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              active={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              label={`${CATEGORY_LABELS[cat]} (${data?.counts.byCategory[cat] ?? 0})`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterLabel>Status:</FilterLabel>
          <Chip
            active={statusFilter === "open_or_review"}
            onClick={() => setStatusFilter("open_or_review")}
            label="Open + In review"
          />
          {STATUSES.map((s) => (
            <Chip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              label={STATUS_LABELS[s]}
            />
          ))}
        </div>
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

      {/* Empty */}
      {!loading && data && data.items.length === 0 && !error && (
        <EmptyState />
      )}

      {/* List */}
      {!loading && data && data.items.length > 0 && (
        <div className="space-y-2">
          {data.items.map((row) => {
            const isExpanded = expandedId === row.id;
            const isPending = pendingId === row.id;
            const note = noteDraft[row.id] || "";
            return (
              <div
                key={row.id}
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--color-border)" }}
              >
                {/* Row header */}
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  style={{ backgroundColor: "var(--color-surface)" }}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : row.id)
                  }
                >
                  <CategoryBadge category={row.category} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span
                        className="text-[12px] font-mono"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {row.subject_type}:
                      </span>
                      <span
                        className="text-[12px] font-mono break-all"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {row.subject_ref}
                      </span>
                      <StatusBadge status={row.status} />
                    </div>
                    <p
                      className="text-sm mt-1 line-clamp-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {row.description}
                    </p>
                    <p
                      className="text-[11px] mt-1.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {row.created_by} ·{" "}
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} style={{ color: "var(--color-text-muted)" }} />
                  ) : (
                    <ChevronDown size={16} style={{ color: "var(--color-text-muted)" }} />
                  )}
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div
                    className="p-4 space-y-3"
                    style={{
                      borderTop: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface-raised)",
                    }}
                  >
                    {row.recommended_actions.length > 0 && (
                      <div>
                        <h4
                          className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Recommended actions
                        </h4>
                        <ul className="space-y-1.5">
                          {row.recommended_actions.map((a, i) => (
                            <li
                              key={i}
                              className="text-sm"
                              style={{ color: "var(--color-text-primary)" }}
                            >
                              <span className="font-semibold">{a.action}</span>
                              {a.rationale && (
                                <span
                                  className="ml-1.5"
                                  style={{ color: "var(--color-text-secondary)" }}
                                >
                                  — {a.rationale}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {row.resolution_note && (
                      <div>
                        <h4
                          className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Resolution note
                        </h4>
                        <p
                          className="text-sm"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {row.resolution_note}
                          {row.resolved_at && row.resolved_by && (
                            <span
                              className="ml-2 text-[11px]"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              ({row.resolved_by} ·{" "}
                              {new Date(row.resolved_at).toLocaleString()})
                            </span>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Status update controls — only when row isn't already resolved/archived */}
                    {(row.status === "open" ||
                      row.status === "in_review") && (
                      <div className="space-y-2 pt-2">
                        <textarea
                          value={note}
                          onChange={(e) =>
                            setNoteDraft((s) => ({
                              ...s,
                              [row.id]: e.target.value,
                            }))
                          }
                          placeholder="Resolution note (optional)"
                          disabled={isPending}
                          rows={2}
                          className="w-full text-sm px-3 py-2 rounded border outline-none"
                          style={{
                            borderColor: "var(--color-border)",
                            backgroundColor: "var(--color-background)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {row.status === "open" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isPending}
                              onClick={() =>
                                updateStatus(row.id, "in_review", note || undefined)
                              }
                            >
                              <Eye size={12} />
                              Mark in review
                            </Button>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              updateStatus(row.id, "resolved", note || undefined)
                            }
                          >
                            <CheckCircle size={12} />
                            Resolve
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              updateStatus(row.id, "archived", note || undefined)
                            }
                          >
                            <Archive size={12} />
                            Archive
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider mr-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </span>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-[11px] font-medium rounded transition-colors"
      style={{
        border: active
          ? "1px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        background: active
          ? "var(--color-active-bg)"
          : "var(--color-surface)",
        color: active
          ? "var(--color-primary)"
          : "var(--color-text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  const palette: Record<Category, { fg: string; bg: string; bd: string }> = {
    design_drift: {
      fg: "var(--color-warning)",
      bg: "rgba(217, 119, 6, 0.08)",
      bd: "rgba(217, 119, 6, 0.2)",
    },
    data_quality: {
      fg: "var(--color-primary)",
      bg: "var(--color-active-bg)",
      bd: "var(--color-primary)",
    },
    source_issue: {
      fg: "var(--color-error)",
      bg: "rgba(220, 38, 38, 0.06)",
      bd: "rgba(220, 38, 38, 0.2)",
    },
    coverage_gap: {
      fg: "var(--color-text-secondary)",
      bg: "var(--color-surface-raised)",
      bd: "var(--color-border)",
    },
    data_integrity: {
      fg: "var(--color-error)",
      bg: "rgba(220, 38, 38, 0.06)",
      bd: "rgba(220, 38, 38, 0.2)",
    },
    surface_concern: {
      fg: "var(--color-text-secondary)",
      bg: "var(--color-surface-raised)",
      bd: "var(--color-border)",
    },
  };
  const p = palette[category];
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{
        color: p.fg,
        background: p.bg,
        border: `1px solid ${p.bd}`,
        whiteSpace: "nowrap",
      }}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const palette: Record<Status, { fg: string; bg: string }> = {
    open: {
      fg: "var(--color-warning)",
      bg: "rgba(217, 119, 6, 0.08)",
    },
    in_review: {
      fg: "var(--color-primary)",
      bg: "var(--color-active-bg)",
    },
    resolved: {
      fg: "var(--color-success)",
      bg: "rgba(22, 163, 74, 0.08)",
    },
    archived: {
      fg: "var(--color-text-muted)",
      bg: "var(--color-surface-raised)",
    },
  };
  const p = palette[status];
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
      style={{
        color: p.fg,
        background: p.bg,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

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
      className="p-3 rounded-lg"
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
        className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
        style={{
          color: critical ? "var(--color-warning)" : "var(--color-text-muted)",
        }}
      >
        {label}
      </div>
      <div
        className="text-xl font-semibold tabular-nums"
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
        No platform integrity flags match the current filters
      </h3>
      <p
        className="mt-1 text-xs max-w-md"
        style={{ color: "var(--color-text-secondary)" }}
      >
        When an agent surfaces a category-fitting concern it can&apos;t resolve,
        a row appears here for owner review. Open status is the default for
        unresolved flags.
      </p>
      <p
        className="mt-3 text-[11px] inline-flex items-center gap-1.5"
        style={{ color: "var(--color-text-muted)" }}
      >
        <AlertTriangle size={11} />
        Powered by migration 048 — integrity_flags table.
      </p>
    </div>
  );
}
