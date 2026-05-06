"use client";

/**
 * ModerationQueue — admin-facing list of moderation reports.
 *
 * Recommended placement (orchestrator decides):
 *   1. Standalone route at /community/moderation, mounted inside the
 *      CommunityShell layout (the shell tags body[data-side="community"]
 *      so the community sidebar is preserved).
 *   2. OR a "Moderation" tab inside the Group Settings modal that
 *      ships with C6.
 *
 * Either placement renders this component with `groupId` (for a single
 * group's queue) or without (platform-admin global view, all reports).
 *
 * Filterable by status/group/reason. Each row expands to show full
 * report + reported post body excerpt + ModerationActions buttons.
 *
 * Light-first design — Apple-HIG-style restrained palette.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { ModerationActions } from "./ModerationActions";
import type { ModerationAction } from "./ModerationActions";

interface ModerationReportRow {
  id: string;
  target_kind: "post" | "group" | "user";
  target_id: string;
  reporter_user_id: string | null;
  reason: string;
  body: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  post: {
    id: string;
    group_id: string;
    author_user_id: string | null;
    title: string | null;
    excerpt: string;
    created_at: string;
  } | null;
}

interface ModerationQueueProps {
  /** When set, the queue scopes to a single group. */
  groupId?: string;
  /** When the reviewer is platform admin only (no group admin role
   *  for the row's group), suppress the "Ban from group" button. */
  canBan?: boolean;
  /** Optional toast hook. */
  onToast?: (message: string, variant?: "success" | "error") => void;
}

const STATUS_OPTIONS: Array<{
  value: "open" | "resolved" | "dismissed" | "all";
  label: string;
}> = [
  { value: "open", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  misinformation: "Misinformation",
  "off-topic": "Off-topic",
  "self-harm": "Self-harm",
  other: "Other",
};

export function ModerationQueue({
  groupId,
  canBan = true,
  onToast,
}: ModerationQueueProps) {
  const [status, setStatus] =
    useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [reports, setReports] = useState<ModerationReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (groupId) params.set("group_id", groupId);
      params.set("limit", "50");
      const res = await fetch(
        `/api/community/moderation/reports?${params.toString()}`,
        { method: "GET", headers: { accept: "application/json" } }
      );
      if (!res.ok) {
        const j = await safeJson(res);
        throw new Error(j?.error || `Failed to load reports (${res.status})`);
      }
      const j = (await res.json()) as { reports: ModerationReportRow[] };
      setReports(Array.isArray(j.reports) ? j.reports : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [status, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (reasonFilter === "all") return reports;
    return reports.filter((r) => r.reason === reasonFilter);
  }, [reports, reasonFilter]);

  const onResolved = (reportId: string) => (
    _action: ModerationAction,
    _phaseD: boolean
  ) => {
    // Optimistic: drop the row from the open queue. If the user is
    // viewing "all" or "resolved", the resolution is reflected on
    // next reload.
    if (status === "open") {
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } else {
      // Trigger refresh to pull updated status.
      load();
    }
    setExpandedId(null);
  };

  return (
    <section
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 20,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldAlert
            size={18}
            color="var(--color-text-secondary)"
            aria-hidden
          />
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            Moderation queue
          </h2>
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
            }}
          >
            {loading
              ? "Loading…"
              : `${filtered.length} report${
                  filtered.length === 1 ? "" : "s"
                }`}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          <FilterSelect
            label="Reason"
            value={reasonFilter}
            onChange={setReasonFilter}
            options={[
              { value: "all", label: "All reasons" },
              ...Object.entries(REASON_LABEL).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "var(--color-error, #b91c1c)",
            background: "var(--color-error-bg, #fef2f2)",
            border: "1px solid var(--color-error-border, #fecaca)",
            borderRadius: 4,
            padding: "8px 12px",
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <EmptyState status={status} />
      )}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {filtered.map((r) => (
          <li
            key={r.id}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-bg-base)",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setExpandedId((prev) => (prev === r.id ? null : r.id))
              }
              aria-expanded={expandedId === r.id}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                textAlign: "left",
                padding: "12px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "var(--color-text-primary)",
              }}
            >
              {expandedId === r.id ? (
                <ChevronDown size={14} aria-hidden />
              ) : (
                <ChevronRight size={14} aria-hidden />
              )}
              <ReasonPill reason={r.reason} />
              <StatusPill status={r.status} />
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.post?.title ||
                  r.post?.excerpt ||
                  "Reported item no longer available"}
              </span>
              <time
                dateTime={r.created_at}
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  flexShrink: 0,
                }}
              >
                {formatRelative(r.created_at)}
              </time>
            </button>

            {expandedId === r.id && (
              <div
                style={{
                  borderTop: "1px solid var(--color-border)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: "var(--color-bg-surface)",
                }}
              >
                <ReportDetails report={r} />
                {r.status === "open" ? (
                  <ModerationActions
                    reportId={r.id}
                    canBan={canBan}
                    onToast={onToast}
                    onResolved={onResolved(r.id)}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      fontStyle: "italic",
                    }}
                  >
                    This report is {r.status}
                    {r.resolved_at
                      ? ` — closed ${formatRelative(r.resolved_at)}.`
                      : "."}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────
// subcomponents
// ───────────────────────────────────────────────────────────────────

function ReportDetails({ report }: { report: ModerationReportRow }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontSize: 13,
        color: "var(--color-text-primary)",
      }}
    >
      <DetailRow
        label="Reason"
        value={REASON_LABEL[report.reason] || report.reason}
      />
      {report.body && <DetailRow label="Reporter notes" value={report.body} />}
      <DetailRow
        label="Filed"
        value={`${formatRelative(report.created_at)} · ${new Date(
          report.created_at
        ).toLocaleString()}`}
      />
      {report.post && (
        <div
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-base)",
            borderRadius: 6,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Reported post
          </span>
          {report.post.title && (
            <strong
              style={{
                fontSize: 13,
                color: "var(--color-text-primary)",
              }}
            >
              {report.post.title}
            </strong>
          )}
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--color-text-secondary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {report.post.excerpt}
          </p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          minWidth: 90,
          paddingTop: 2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--color-text-primary)",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "3px 7px",
        borderRadius: 3,
        border: "1px solid var(--color-border)",
        color: "var(--color-text-secondary)",
        background: "var(--color-bg-surface)",
        flexShrink: 0,
      }}
    >
      {REASON_LABEL[reason] || reason}
    </span>
  );
}

function StatusPill({
  status,
}: {
  status: "open" | "resolved" | "dismissed";
}) {
  const palette =
    status === "open"
      ? {
          color: "var(--color-warning, #b45309)",
          border: "var(--color-high-border, #fed7aa)",
        }
      : status === "resolved"
      ? {
          color: "var(--color-low, #15803d)",
          border: "var(--color-low-border, #a7f3d0)",
        }
      : {
          color: "var(--color-text-muted)",
          border: "var(--color-border)",
        };
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 3,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        background: "transparent",
        flexShrink: 0,
      }}
    >
      {status === "open" ? "pending" : status}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--color-text-secondary)",
      }}
    >
      <span
        style={{
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12,
          padding: "5px 8px",
          borderRadius: 4,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-surface)",
          color: "var(--color-text-primary)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({
  status,
}: {
  status: "open" | "resolved" | "dismissed" | "all";
}) {
  return (
    <div
      style={{
        border: "1px dashed var(--color-border)",
        borderRadius: 6,
        padding: "24px 16px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        fontSize: 13,
      }}
    >
      {status === "open"
        ? "Nothing to review. New reports appear here."
        : `No ${status === "all" ? "" : status} reports match the current filter.`}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return new Date(iso).toLocaleDateString();
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}
