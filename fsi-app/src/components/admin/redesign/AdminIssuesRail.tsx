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

export interface IssueNavTarget {
  section: string;
  tab: string;
}

interface RailRow {
  key: string;
  title: string;
  sub: string;
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

  const rows: RailRow[] = [
    {
      key: "provisional",
      title: "Provisional sources pending review",
      sub: "Discovered URLs — machine-gated promotion (evaluatePromotion); visibility",
      count: c.provisional_sources_pending,
      target: { section: "Sources", tab: "Provisional review" },
    },
    {
      key: "staged",
      title: "Staged updates pending",
      sub: "Worker-staged regulations — machine-gated intake (visibility)",
      count: c.staged_updates_pending,
      target: { section: "Ingest", tab: "Staged updates" },
    },
    {
      key: "materialization",
      title: "Materialization failures",
      sub: "Approved updates that failed to write through",
      count: c.staged_updates_materialization_failed,
      target: { section: "Ingest", tab: "Staged updates" },
    },
    {
      key: "integrity",
      title: "Integrity flags unresolved",
      sub: "Agent emissions flagged — the operator may review",
      count: c.integrity_flags_unresolved,
      target: { section: "Ingest", tab: "Flags & rejections" },
    },
    {
      key: "platform",
      title: "Platform integrity flags open",
      sub: "Quarantine & data-quality flags",
      count: c.platform_integrity_flags_open,
      target: { section: "Ingest", tab: "Flags & rejections" },
    },
    {
      key: "attribution",
      title: "Source attribution mismatches",
      sub: "Citations not matching declared source",
      count: c.source_attribution_mismatches,
      target: { section: "Sources", tab: "Source registry" },
    },
    {
      key: "spotcheck",
      title: "Auto-approved awaiting spot-check",
      sub: "Sources added in the last 7 days — the operator may spot-check",
      count: c.auto_approved_awaiting_spotcheck,
      target: { section: "Sources", tab: "Spot-check" },
    },
    {
      key: "coverage",
      title: "Coverage gaps (critical)",
      sub: "Jurisdictions with insufficient source coverage",
      count: c.coverage_gaps_critical,
      target: { section: "Coverage", tab: "Jurisdiction review" },
    },
  ];

  // COMPUTED total — sum of the exact rows rendered below. This is the
  // binding invariant: the badge equals its list, always.
  const total = rows.reduce((t, r) => t + r.count, 0);

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderBottom: "2px solid var(--text)",
          padding: "0 0 8px",
          margin: "0 0 14px",
          gap: 12,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            margin: 0,
            color: "var(--text)",
          }}
        >
          Issues queue
        </h2>
        <span
          aria-label={`${total} items need attention`}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: total > 0 ? "var(--sev-critical)" : "var(--text-2)",
          }}
        >
          {total.toLocaleString()}
        </span>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--color-border)",
          borderLeft: "3px solid var(--sev-critical)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {rows.map((r) => (
          <RailButton key={r.key} row={r} onNavigate={onNavigate} />
        ))}
        <p
          style={{
            fontSize: 10.5,
            color: "var(--text-2)",
            margin: 0,
            padding: "10px 16px",
            background: "var(--color-background)",
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
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    background: "var(--surface)",
    border: "none",
    borderBottom: "1px solid var(--color-border-subtle)",
    textAlign: "left",
  };

  const content = (
    <>
      <span style={{ textAlign: "left", minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: zero ? 600 : 800,
            margin: 0,
            color: zero ? "var(--text-2)" : "var(--text)",
          }}
        >
          {row.title}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 10.5,
            color: "var(--text-2)",
            margin: "1px 0 0",
          }}
        >
          {row.sub}
        </span>
      </span>
      <span
        style={
          zero
            ? {
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-2)",
                padding: "2px 9px",
                borderRadius: 999,
                border: "1px solid var(--color-border)",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }
            : {
                fontFamily: "var(--font-display)",
                fontSize: 15,
                color: "var(--sev-critical)",
                padding: "2px 10px",
                borderRadius: 999,
                border: "1px solid var(--critical-bd)",
                background: "var(--critical-bg)",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }
        }
      >
        {row.count.toLocaleString()}
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
