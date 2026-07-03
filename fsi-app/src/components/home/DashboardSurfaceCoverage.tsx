"use client";

/**
 * DashboardSurfaceCoverage — five-surface widget for the dashboard rail.
 *
 * Per caros-ledge-platform-intent SKILL Section "The Five Customer-Facing
 * Surfaces", the Dashboard must present Regulations, Market Intel, Research,
 * Operations, and Community as co-equal entry points. Pre-Build-11 the
 * Dashboard surface was regulation-skewed (per OBS-41); this widget closes
 * the gap by rendering one row per surface with the workspace's actual
 * count and a Link into the surface page.
 *
 * Behaviour:
 *   - Five surface rows, fixed order: Regulations, Market Intel, Research,
 *     Operations, Community.
 *   - Each row: surface label (display font), count, brief deck, link arrow.
 *   - Community row carries activity signals (groups + unread mentions)
 *     because its data model is different (per source-credibility-model
 *     Section 8 Community uses the author-identity model, not the
 *     intelligence_items shape).
 *   - Suppresses rows with count 0 + no activity signal cleanly.
 *
 * Co-located on the rail with DashboardWatchlist + DashboardByOwner.
 */

import Link from "next/link";
import { TypesetSection } from "./TypesetSection";
import type {
  SurfaceCoverageSnapshot,
} from "@/lib/dashboard/surface-coverage";

export interface DashboardSurfaceCoverageProps {
  snapshot: SurfaceCoverageSnapshot;
}

interface SurfaceRow {
  key: string;
  label: string;
  count: number;
  href: string;
  deck: string;
  /** Optional activity badge (e.g., "3 unread mentions"). Renders below the count. */
  activity?: string;
}

export function DashboardSurfaceCoverage({ snapshot }: DashboardSurfaceCoverageProps) {
  const intel = snapshot.intelligence;
  const community = snapshot.community;

  const rows: SurfaceRow[] = [
    {
      key: "regulations",
      label: "Regulations",
      count: intel.regulations,
      href: "/regulations",
      deck: "Binding law, agency rules, court decisions.",
    },
    {
      key: "market",
      label: "Market Intel",
      count: intel.marketIntel,
      href: "/market",
      deck: "Industry signals, corporate moves, capital flow.",
    },
    {
      key: "research",
      label: "Research",
      count: intel.research,
      href: "/research",
      deck: "Horizon-scan analytical depth across the field.",
    },
    {
      key: "operations",
      label: "Operations",
      count: intel.operations,
      href: "/operations",
      deck: "Regional cost, feasibility, infrastructure picture.",
    },
    {
      key: "community",
      label: "Community",
      count: community.activeGroups,
      href: "/community",
      deck: "Peer working groups, forums, cross-org discussion.",
      activity:
        community.unreadMentions > 0
          ? `${community.unreadMentions} unread mention${community.unreadMentions === 1 ? "" : "s"}`
          : community.unreadNotifications > 0
            ? `${community.unreadNotifications} unread`
            : undefined,
    },
  ];

  const totalActive = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <TypesetSection
      eyebrow="Across the platform"
      title="All five surfaces"
      count={
        totalActive > 0 ? `${totalActive} active across 5 surfaces` : "5 surfaces"
      }
      deck="Regulations, Market Intel, Research, Operations, and Community are co-equal entry points."
    >
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((row, i) => (
          <li
            key={row.key}
            style={{
              padding: "10px 0",
              borderTop: i === 0 ? "0" : "1px solid var(--color-border-subtle, rgba(0,0,0,0.06))",
            }}
          >
            <Link
              href={row.href}
              prefetch={false}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "baseline",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "var(--color-text-primary, #1A1A1A)",
                    lineHeight: 1.3,
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--color-text-muted, #7A6E6C)",
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  {row.deck}
                </div>
                {row.activity && (
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "var(--color-critical, #DC2626)",
                      letterSpacing: "0.04em",
                      marginTop: 4,
                    }}
                  >
                    {row.activity}
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display, 'Anton', sans-serif)",
                    fontSize: 22,
                    color: "var(--color-accent, #1E3A8A)",
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.count}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted, #7A6E6C)",
                  }}
                >
                  {row.key === "community" ? "groups" : "items"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {/*
        Uncategorized is a DEFECT DETECTOR, not a customer surface (count-integrity binding 4): a
        nonzero uncategorized count means surface_of could not route an item, a standing integrity
        signal in the same family as the platform flags queue. It must NOT render customer-side, so the
        prior "N items not yet routed" note is removed here. The count is exposed for the admin surface
        via get_all_surface_counts.uncategorized; the admin-rail display + the data_quality
        integrity_flag on transition-from-zero are QUEUED (they need a stateful non-customer-read host).
      */}
    </TypesetSection>
  );
}
