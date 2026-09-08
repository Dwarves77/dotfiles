"use client";

/**
 * AdminIssuesRail — redesign TEMPLATE 08 (HANDOFF §6.8) issues-queue rail.
 *
 * The right rail of the Admin surface. Anton "Issues queue" header with a
 * red total that is the COMPUTED SUM of the exact rows rendered below it —
 * never hard-coded, never read from a separate scalar that could contradict
 * the list (binding override: "the issues-queue total is sum(rows), never
 * hard-coded, never recomputed to contradict the list. A badge that can
 * contradict its list is a bug.").
 *
 * Rows come from useAdminAttention (one 60s polling singleton shared with the
 * sidebar dot). Zero-count rows stay quiet — muted, non-tappable — because a
 * zero is a fact, not an alarm. Non-zero rows navigate the section/sub-nav.
 *
 * The rail deliberately does NOT read `counts.total` from the API: the
 * displayed total is `sum(row.count)` over the rows actually rendered, so the
 * badge and its list can never disagree.
 */

import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import { formatNumber } from "@/lib/format";
import { SectionRule } from "@/components/ui/SectionRule";

export interface IssueNavTarget {
  section: string;
  tab: string;
}

interface RailRow {
  key: string;
  title: string;
  count: number;
  target: IssueNavTarget;
}

interface AdminIssuesRailProps {
  /** Navigate the parent's section + sub-nav when a non-zero row is tapped. */
  onNavigate: (target: IssueNavTarget) => void;
}

export function AdminIssuesRail({ onNavigate }: AdminIssuesRailProps) {
  const { counts, loading, error } = useAdminAttention();

  // Render zeroes during the first poll so the layout doesn't shift when the
  // snapshot lands.
  const c = counts ?? {
    provisional_sources_pending: 0,
    staged_updates_pending: 0,
    staged_updates_materialization_failed: 0,
    integrity_flags_unresolved: 0,
    platform_integrity_flags_open: 0,
    source_attribution_mismatches: 0,
    auto_approved_awaiting_spotcheck: 0,
    coverage_gaps_critical: 0,
    total: 0,
  };

  // dc.html p13's ISSUES QUEUE rows, in the artboard's own order: the four
  // attention rows (provisional, platform integrity flags, auto-approved
  // spot-check, integrity flags) first, then the four quiet ones. The order is
  // the artboard's, not a sort, a count that changes must not reorder the list
  // under the operator's eye. Reordered by lane admin60, 2026-09-08.
  const rows: RailRow[] = [
    {
      key: "provisional",
      title: "Provisional sources pending review",
      count: c.provisional_sources_pending,
      target: { section: "Sources", tab: "Provisional review" },
    },
    {
      key: "platform",
      title: "Platform integrity flags open",
      count: c.platform_integrity_flags_open,
      target: { section: "Ingest", tab: "Flags & rejections" },
    },
    {
      key: "spotcheck",
      title: "Auto-approved awaiting spot-check",
      count: c.auto_approved_awaiting_spotcheck,
      target: { section: "Sources", tab: "Spot-check" },
    },
    {
      key: "integrity",
      title: "Integrity flags unresolved",
      count: c.integrity_flags_unresolved,
      target: { section: "Ingest", tab: "Flags & rejections" },
    },
    {
      key: "staged",
      title: "Staged updates pending",
      count: c.staged_updates_pending,
      target: { section: "Ingest", tab: "Staged updates" },
    },
    {
      key: "materialization",
      title: "Materialization failures",
      count: c.staged_updates_materialization_failed,
      target: { section: "Ingest", tab: "Staged updates" },
    },
    {
      key: "attribution",
      title: "Source attribution mismatches",
      count: c.source_attribution_mismatches,
      target: { section: "Sources", tab: "Source registry" },
    },
    {
      key: "coverage",
      title: "Coverage gaps (critical)",
      count: c.coverage_gaps_critical,
      target: { section: "Coverage", tab: "Jurisdiction review" },
    },
  ];


  // COMPUTED total — sum of the exact rows rendered below. This is the
  // binding invariant: the badge equals its list, always.
  const total = rows.reduce((t, r) => t + r.count, 0);

  return (
    <div
      data-audit="rail-card"
      style={{
        minWidth: 0,
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card, 0 1px 2px rgba(26,26,26,.04), 0 4px 14px rgba(26,26,26,.06))",
        overflow: "hidden",
      }}
    >
      {/* Ruling 5.1: the graduated rule above the section title, no divider below it. */}
      <SectionRule />
      <div style={{ padding: "12px 16px 14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
            gap: 12,
          }}
        >
          <h2
            style={{
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 700,
              margin: 0,
              color: "var(--ink-3)",
            }}
          >
            Issues queue
          </h2>
          <span
            aria-label={`${formatNumber(total)} items need attention`}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: total > 0 ? "var(--sev-critical)" : "var(--ink-3)",
            }}
          >
            {formatNumber(total)}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          {rows.map((r) => (
            <RailButton key={r.key} row={r} onNavigate={onNavigate} />
          ))}
        </div>

        <p
          style={{
            fontSize: 10.5,
            color: "var(--ink-3)",
            margin: "8px 0 0",
          }}
        >
          {error
            ? "Refresh error — showing last snapshot."
            : loading && !counts
              ? "Loading queue…"
              : "Refreshes every 60s · zero-count rows stay quiet — a zero is a fact, not an alarm."}
        </p>
      </div>
    </div>
  );
}

function RailButton({
  row,
  onNavigate,
}: {
  row: RailRow;
  onNavigate: (target: IssueNavTarget) => void;
}) {
  const zero = row.count === 0;

  const base: React.CSSProperties = {
    fontFamily: "inherit",
    cursor: zero ? "default" : "pointer",
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: "4px 0",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(0,0,0,.06)",
    textAlign: "left",
  };

  const content = (
    <>
      <span
        style={{
          fontWeight: zero ? 500 : 700,
          color: zero ? "var(--ink-2)" : "var(--text)",
        }}
      >
        {row.title}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          color: zero ? "var(--text)" : "var(--sev-critical)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {formatNumber(row.count)}
      </span>
    </>
  );

  if (zero) {
    return (
      <div style={base} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(row.target)}
      style={base}
      aria-label={`${row.title}: ${row.count}. Open queue.`}
    >
      {content}
    </button>
  );
}
