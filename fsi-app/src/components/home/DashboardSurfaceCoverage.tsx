"use client";

/**
 * DashboardSurfaceCoverage — the "Across the platform" rail card.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock). One row per customer surface
 * (Regulations, Market Intel, Research, Operations, Community — the co-equal
 * five per caros-ledge-platform-intent), each with a deck and an Anton count.
 *
 * COUNTS (binding): the four intelligence surfaces read the verified subtotals
 * from get_all_surface_counts (migration 148) via getSurfaceCoverageSnapshot —
 * the SAME verified population the surface headers count, fail-soft to the
 * surface_of scan. Community reads its own data model (active groups). Counts
 * are never recomputed from visible rows nor hard-coded from the mock.
 */

import Link from "next/link";
import type { SurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";

export interface DashboardSurfaceCoverageProps {
  snapshot: SurfaceCoverageSnapshot;
}

interface SurfaceRow {
  key: string;
  label: string;
  desc: string;
  count: number;
  href: string;
}

export function DashboardSurfaceCoverage({ snapshot }: DashboardSurfaceCoverageProps) {
  const intel = snapshot.intelligence;
  const community = snapshot.community;

  const rows: SurfaceRow[] = [
    {
      key: "regulations",
      label: "Regulations",
      desc: "Binding law, agency rules, court decisions",
      count: intel.regulations,
      href: "/regulations",
    },
    {
      key: "market",
      label: "Market Intel",
      desc: "Industry signals, corporate moves, capital flow",
      count: intel.marketIntel,
      href: "/market",
    },
    {
      key: "research",
      label: "Research",
      desc: "Horizon-scan analytical depth",
      count: intel.research,
      href: "/research",
    },
    {
      key: "operations",
      label: "Operations",
      desc: "Regional cost, feasibility, infrastructure",
      count: intel.operations,
      href: "/operations",
    },
    {
      key: "community",
      label: "Community",
      desc: "Peer working groups and forums",
      count: community.activeGroups,
      href: "/community",
    },
  ];

  return (
    <div
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          Across the platform
        </p>
      </div>
      {rows.map((row) => (
        <Link
          key={row.key}
          href={row.href}
          prefetch={false}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            padding: "11px 16px",
            borderBottom: "1px solid var(--color-border-subtle)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              {row.label}
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "1px 0 0" }}>
              {row.desc}
            </p>
          </div>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              // Zero renders muted (honest — no content on that surface yet),
              // non-zero renders ink. Mirrors the mock (Community 0 = muted).
              color: row.count > 0 ? "var(--color-text-primary)" : "var(--color-text-muted)",
            }}
          >
            {row.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
