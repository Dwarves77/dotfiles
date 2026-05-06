"use client";

import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import {
  AlertTriangle,
  Inbox,
  XCircle,
  ShieldAlert,
  Link2Off,
  ClipboardCheck,
  MapPinned,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

/**
 * IssuesQueue — admin-homepage section that surfaces every
 * needs-attention category in one tappable list (W2.E).
 *
 * Rendered above the rest of the admin shell. When `total === 0`,
 * shows a pleasant empty state. Categories with count=0 stay visible
 * but dimmed and non-tappable so the admin sees the full inventory
 * without having to remember which queues exist.
 *
 * The component reuses the global `useAdminAttention` hook — the
 * sidebar dot and this list share one polling source and one
 * snapshot per 60-second tick.
 */

// AdminTab is duplicated here as a string literal to avoid a circular
// import with AdminDashboard.tsx. The tab IDs match the AdminDashboard's
// AdminTab union: "orgs" | "integrations" | "sources" | "staged" |
// "scan" | "audit". Future W2.C / W2.D categories will introduce new
// tab IDs ("integrity-flags", "coverage-matrix") — the type relaxes to
// `string` so adding tabs doesn't require a coordinated rename.
type AdminTab = string;

interface CategoryConfig {
  key: string;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
  count: number;
  /** When non-null, clicking the row switches AdminDashboard to this tab. */
  targetTab: AdminTab | null;
  /** Optional sub-filter the parent can read off the category to scope the tab view. */
  filter?: string;
}

interface IssuesQueueProps {
  /** Called when the admin clicks a tappable category. */
  onNavigate: (tab: AdminTab, filter?: string) => void;
}

export function IssuesQueue({ onNavigate }: IssuesQueueProps) {
  const { counts, total, loading, error } = useAdminAttention();

  // Build the category list whether or not counts have loaded yet — render
  // zeroes during the first poll instead of a blank slot, so the layout
  // doesn't shift when the data arrives.
  const c = counts ?? {
    provisional_sources_pending: 0,
    staged_updates_pending: 0,
    staged_updates_materialization_failed: 0,
    integrity_flags_unresolved: 0,
    source_attribution_mismatches: 0,
    auto_approved_awaiting_spotcheck: 0,
    coverage_gaps_critical: 0,
    total: 0,
  };

  const categories: CategoryConfig[] = [
    {
      key: "provisional",
      label: "Provisional sources pending review",
      description: "Discovered URLs awaiting promote / reject decision.",
      icon: Inbox,
      count: c.provisional_sources_pending,
      targetTab: "sources",
      filter: "provisional",
    },
    {
      key: "staged",
      label: "Staged updates pending",
      description: "Worker-staged regulations awaiting human approval.",
      icon: ClipboardCheck,
      count: c.staged_updates_pending,
      targetTab: "staged",
    },
    {
      key: "materialization-failed",
      label: "Materialization failures",
      description: "Approved staged updates that failed to write through.",
      icon: XCircle,
      count: c.staged_updates_materialization_failed,
      targetTab: "staged",
      filter: "materialization-failed",
    },
    {
      key: "integrity",
      label: "Integrity flags unresolved",
      description: "Agent emissions flagged for human review.",
      icon: ShieldAlert,
      count: c.integrity_flags_unresolved,
      // Tab shipped by W2.C — fall back to staged-updates view until then.
      targetTab: "integrity-flags",
    },
    {
      key: "attribution",
      label: "Source attribution mismatches",
      description: "Citations not matching their declared source.",
      icon: Link2Off,
      count: c.source_attribution_mismatches,
      targetTab: "sources",
      filter: "attribution-mismatch",
    },
    {
      key: "spotcheck",
      label: "Auto-approved awaiting spot-check",
      description: "Sources added in the last 7 days needing a human pass.",
      icon: AlertTriangle,
      count: c.auto_approved_awaiting_spotcheck,
      targetTab: "sources",
      filter: "recently-approved",
    },
    {
      key: "coverage",
      label: "Coverage gaps critical",
      description: "Domains / jurisdictions with insufficient source coverage.",
      icon: MapPinned,
      count: c.coverage_gaps_critical,
      // Tab shipped by W2.D.
      targetTab: "coverage-matrix",
    },
  ];

  return (
    <section
      aria-labelledby="issues-queue-heading"
      style={{
        marginBottom: 24,
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md, 8px)",
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h2
            id="issues-queue-heading"
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Issues queue
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              margin: "4px 0 0",
            }}
          >
            Aggregated needs-attention queue across every admin surface.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "var(--color-text-muted)",
          }}
        >
          {loading && <span>Refreshing…</span>}
          {!loading && !error && (
            <span>Refreshes every 60s</span>
          )}
          {error && (
            <span style={{ color: "var(--color-error)" }}>Refresh error</span>
          )}
          <span
            aria-hidden="true"
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 11,
              color: total > 0 ? "var(--color-critical)" : "var(--color-text-secondary)",
              background:
                total > 0
                  ? "var(--color-critical-bg)"
                  : "var(--color-surface-raised, var(--color-active-bg))",
              border:
                total > 0
                  ? "1px solid var(--color-critical-border)"
                  : "1px solid var(--color-border)",
            }}
          >
            {total}
          </span>
        </div>
      </header>

      {total === 0 ? (
        <EmptyState />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {categories.map((cat, i) => (
            <CategoryRow
              key={cat.key}
              category={cat}
              isLast={i === categories.length - 1}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "32px 18px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <CheckCircle2
        size={24}
        style={{ color: "var(--color-success, var(--color-primary))" }}
        aria-hidden="true"
      />
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-primary)",
        }}
      >
        Nothing needs attention right now.
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--color-text-secondary)",
          maxWidth: 480,
        }}
      >
        All review queues are empty. New items will appear here automatically.
      </p>
    </div>
  );
}

function CategoryRow({
  category,
  isLast,
  onNavigate,
}: {
  category: CategoryConfig;
  isLast: boolean;
  onNavigate: (tab: AdminTab, filter?: string) => void;
}) {
  const { count, label, description, icon: Icon, targetTab, filter } = category;
  const tappable = count > 0 && targetTab !== null;
  const handleClick = () => {
    if (!tappable || !targetTab) return;
    onNavigate(targetTab, filter);
  };

  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "14px 18px",
    borderBottom: isLast ? "none" : "1px solid var(--color-border)",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: tappable ? "pointer" : "default",
    opacity: count === 0 ? 0.55 : 1,
    color: "inherit",
    fontFamily: "inherit",
    transition: "background-color 120ms ease",
  };

  const content = (
    <>
      <Icon
        size={18}
        aria-hidden="true"
        style={{
          color:
            count > 0
              ? "var(--color-critical)"
              : "var(--color-text-muted)",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: "2px 0 0",
            fontSize: 11,
            color: "var(--color-text-secondary)",
          }}
        >
          {description}
        </p>
      </div>
      <span
        style={{
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          color:
            count > 0
              ? "var(--color-critical)"
              : "var(--color-text-secondary)",
          background:
            count > 0
              ? "var(--color-critical-bg)"
              : "transparent",
          border:
            count > 0
              ? "1px solid var(--color-critical-border)"
              : "1px solid var(--color-border)",
          minWidth: 32,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {count}
      </span>
      {tappable ? (
        <ArrowRight
          size={14}
          aria-hidden="true"
          style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
        />
      ) : (
        <span style={{ width: 14, flexShrink: 0 }} aria-hidden="true" />
      )}
    </>
  );

  if (!tappable) {
    return (
      <li>
        <div style={baseStyle} aria-disabled="true">
          {content}
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        style={baseStyle}
        aria-label={`${label}: ${count}. Open queue.`}
      >
        {content}
      </button>
    </li>
  );
}
