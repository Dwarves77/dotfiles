"use client";

/**
 * ListRow — the one list-row anatomy (UI system handoff 2026-09-06,
 * README §0.4), used by Regulations, Market, Research, Operations,
 * Watchlist, Dashboard:
 *
 *   grid-template-columns: 3px 56px 1fr 88px 84px 76px 40px 44px;
 *   gap: 0 14px; min-height: 56px
 *   = band spine · jurisdiction code · title + meta · impact meter ·
 *     due date + days · timeline · tier · ⋯
 *
 * Hover #FAFAF8 (--row-hover); row divider 1px solid rgba(0,0,0,.06)
 * (--line-3); the WHOLE ROW is the click target — the audit found two
 * competing click affordances (a row Link plus a separate button/icon
 * target); this is the only one. Title truncates with ellipsis; meta
 * line is 11px muted.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { ImpactScores, TimelineEntry } from "@/types/resource";
import type { UrgencyBand } from "@/lib/urgency/bands";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { MilestoneTimeline } from "@/components/ui/MilestoneTimeline";
import { TierChip } from "@/components/ui/Chips";

export interface ListRowProps {
  href: string;
  band: UrgencyBand;
  jurisdiction: string;
  title: string;
  meta?: ReactNode;
  impact?: ImpactScores | null;
  /** Due date label (e.g. "Nov 18 2026") + days-until label (e.g. "73 days"). */
  due?: { label: string; days: string } | null;
  timeline?: TimelineEntry[] | null;
  tier?: number | null;
  /** The row's overflow menu content. Rendered inside the 44px ⋯ cell,
   *  which carries its own 1px left divider — never a second click target
   *  competing with the row Link (the ⋯ button stops propagation only for
   *  its own click, it does not wrap a nested navigable link). */
  overflow?: ReactNode;
}

const GRID = "3px 56px 1fr 88px 84px 76px 40px 44px";

export function ListRow({ href, band, jurisdiction, title, meta, impact, due, timeline, tier, overflow }: ListRowProps) {
  return (
    <div
      className="cl-list-row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: "0 14px",
        minHeight: 56,
        alignItems: "stretch",
        borderBottom: "1px solid var(--line-3)",
        position: "relative",
      }}
    >
      <style>{`.cl-list-row:hover { background: var(--row-hover); }`}</style>
      <span aria-hidden="true" style={{ background: band.cssVar }} />
      <Link
        href={href}
        prefetch={false}
        style={{
          position: "absolute",
          inset: 0,
          gridColumn: `2 / span 6`,
          textDecoration: "none",
        }}
        aria-label={title}
      />
      <span
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          color: "var(--ink-3)",
          letterSpacing: "0.04em",
        }}
      >
        {jurisdiction}
      </span>
      <span style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, padding: "8px 0" }}>
        <span
          style={{
            fontSize: "var(--fs-14)",
            fontWeight: 600,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {meta && (
          <span
            style={{
              fontSize: "var(--fs-11)",
              color: "var(--ink-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {meta}
          </span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "center" }}>
        <ImpactMeter scores={impact} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end" }}>
        {due ? (
          <>
            <span style={{ fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {due.label}
            </span>
            <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{due.days}</span>
          </>
        ) : (
          <span style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)" }}>—</span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "center" }}>
        <MilestoneTimeline entries={timeline} bandHex={band.cssVar} />
      </span>
      <span style={{ display: "flex", alignItems: "center" }}>
        {tier != null ? <TierChip tier={tier} /> : <span style={{ color: "var(--ink-3)" }}>—</span>}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderLeft: "1px solid var(--line-3)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {overflow}
      </span>
    </div>
  );
}
