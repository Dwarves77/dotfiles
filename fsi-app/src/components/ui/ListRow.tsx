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
 *
 * RESPONSIVE COLLAPSE, added additively this lane (UILISTS, 2026-09-06,
 * RD-60/F35 — the rendering guard's own phone-width pass, ux-smoke-specs.mjs):
 * the desktop grid's fixed columns alone (3+56+88+84+76+40+44 = 391px) plus
 * 7×14px gaps (98px) need ~489px before the 1fr title column gets anything,
 * so below 640px the row overflowed its card, titles measured near-zero
 * width, and several targets lost their neighbour clearance — none of that
 * is in the artboards (drawn at 1440px) or the README grid spec, which
 * names only the desktop shape. Below 640px this collapses to a 2-row grid
 * (spine+jurisdiction+title+⋯ on row 1; impact/due/timeline/tier as one
 * wrapped flex strip on row 2) via `.cl-row-*` classes — the same
 * shape every pre-existing row component in this app (`.cl-row`/
 * `.cl-row__aside`, globals.css) already uses for this exact problem.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { ImpactScores, TimelineEntry } from "@/types/resource";
import type { UrgencyBand } from "@/lib/urgency/bands";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { MilestoneTimeline } from "@/components/ui/MilestoneTimeline";
import { TierChip } from "@/components/ui/Chips";
import { Absence } from "@/components/ui/Absence";

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
      <style>{`
        .cl-list-row:hover { background: var(--row-hover); }
        @media (max-width: 640px) {
          .cl-list-row {
            grid-template-columns: 3px 40px 1fr 44px !important;
            grid-template-rows: auto auto !important;
            row-gap: 4px !important;
            padding-bottom: 8px !important;
          }
          .cl-row-spine { grid-column: 1 !important; grid-row: 1 / span 2 !important; }
          .cl-row-jur { grid-column: 2 !important; grid-row: 1 !important; }
          .cl-row-main { grid-column: 3 !important; grid-row: 1 !important; }
          .cl-row-overflow { grid-column: 4 !important; grid-row: 1 !important; }
          .cl-row-secondary {
            display: flex !important;
            grid-column: 2 / span 2 !important;
            grid-row: 2 !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            gap: 8px 16px !important;
            padding: 2px 0 4px !important;
          }
        }
      `}</style>
      <span aria-hidden="true" className="cl-row-spine" style={{ background: band.cssVar }} />
      {/* Column span excludes the spine (col 1) AND the ⋯ overflow cell (last column) in BOTH the
          desktop 8-column grid and the mobile 4-column collapse — restored during the mobile-
          responsive edit above, which had briefly widened this to "1 / -1" and made the Link's own
          box exactly cover the Watch/⋯ button (0px law-2 clearance, RD-60/F35: an overlapping
          "neighbour" is not a spacing defect on either control, but the geometry detector cannot
          tell that from two genuinely stacked hit areas — the original design deliberately excludes
          the overflow column from the row Link's span so the two never share a box). */}
      <Link
        href={href}
        prefetch={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          // 12px short of the grid line, not exactly 0: the "2 / -2" column boundary and the ⋯
          // cell's own Watch button can land within a few px of each other after grid layout
          // rounding (measured: a 0.77px overlap at the boundary, growing to a few more once the
          // ⋯ cell's actual control — WatchButton, a pre-existing shared part with its own
          // internal padding this lane does not own — is accounted for), which the law-2
          // clearance check (≥8px between two targets under the 44px floor) treats as touching or
          // too close. This margin is sized to the measured worst case across all five surfaces'
          // fixtures, not the theoretical grid-line gap alone.
          right: 12,
          gridColumn: "2 / -2",
          gridRow: "1 / -1",
          textDecoration: "none",
        }}
        aria-label={title}
      />
      <span
        className="cl-row-jur"
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
      <span className="cl-row-main" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, padding: "8px 0" }}>
        <span
          data-guard-title
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
      {/* `display: contents` at desktop width keeps these four as independent grid columns
          (the original 8-track layout, unchanged); the mobile media query above turns this
          wrapper into a real grid cell — one flex strip under the title, row 2 — instead. */}
      <span className="cl-row-secondary" style={{ display: "contents" }}>
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
            <Absence reason="pending" />
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center" }}>
          <MilestoneTimeline entries={timeline} bandHex={band.cssVar} />
        </span>
        <span style={{ display: "flex", alignItems: "center" }}>
          {tier != null ? <TierChip tier={tier} /> : <Absence reason="not in primary source" />}
        </span>
      </span>
      <span
        className="cl-row-overflow"
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
