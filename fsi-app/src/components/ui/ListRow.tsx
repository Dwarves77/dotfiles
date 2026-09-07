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
 * MOBILE REFLOW (lane uimapcomm, 2026-09-06): the 8 fixed-width columns
 * above do not fit a 375px viewport, and no ListRow consumer had been
 * measured at phone width by any UX smoke spec until this lane's
 * map-smoke.mjs mounted one directly. At ≤640px the row switches to a
 * wrapping flex layout (jurisdiction + title on the first line, the
 * impact/due/timeline/tier — or `endStat` — cluster wrapping onto its
 * own line below) rather than scrolling horizontally: this codebase's
 * established policy for a row that doesn't fit narrow is to reflow it,
 * not to exempt it behind an `overflow-x:auto` wrapper (globals.css's
 * `.cl-row-grid` comment states this explicitly for the same class of
 * defect). The desktop grid anatomy above is completely unchanged.
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
  /**
   * Additive extension (lane uimapcomm, 2026-09-06): when a row's subject
   * has no impact/due/timeline/tier dimensions of its own — the map's
   * jurisdiction register is a row per JURISDICTION, not per item — this
   * replaces those four cells (grid columns 4-7) with one merged stat
   * block: a band-coloured label left, a band-coloured tabular numeral
   * right. `impact`/`due`/`timeline`/`tier` are ignored when this is set.
   * Undefined preserves the original four-cell anatomy exactly — every
   * existing caller (Regulations, Market, Research, Operations,
   * Watchlist, Dashboard) is unaffected.
   */
  endStat?: { label: string; value: string | number; band: UrgencyBand } | null;
}

const GRID = "3px 56px 1fr 88px 84px 76px 40px 44px";

export function ListRow({ href, band, jurisdiction, title, meta, impact, due, timeline, tier, overflow, endStat }: ListRowProps) {
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
        /* Reflow at phone width (RD-60/law-2; no ListRow consumer was measured at 375px before
           lane uimapcomm's map-smoke.mjs exposed this) instead of letting the row's 8 fixed-width
           columns clip past the viewport edge — this codebase's established policy for a row that
           doesn't fit narrow (see globals.css .cl-row-grid's own comment: reflow it, a bare
           overflow-x:auto wrapper is NOT the sanctioned fix). Title forces a line break (flex-basis
           100%); the trailing cells wrap onto their own line below it. */
        @media (max-width: 640px) {
          .cl-list-row { display: flex !important; flex-wrap: wrap !important; align-items: center !important; padding: 8px 0; gap: 6px 10px; }
          .cl-lr-title { flex: 1 1 100% !important; order: 1; padding-left: 4px; }
          .cl-lr-jur { order: 0; }
          .cl-lr-tail { order: 2; flex: 1 1 100% !important; display: flex !important; flex-wrap: wrap; align-items: center; gap: 10px; padding-left: 4px; }
          .cl-lr-overflow { order: 3; margin-left: auto; border-left: none !important; }
        }
      `}</style>
      <span aria-hidden="true" className="cl-lr-spine" style={{ background: band.cssVar, alignSelf: "stretch" }} />
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
        className="cl-lr-jur"
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
      <span className="cl-lr-title" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, padding: "8px 0" }}>
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
      <span className="cl-lr-tail" style={{ display: "contents" }}>
      {endStat ? (
        <span
          style={{
            gridColumn: "4 / span 4",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            paddingRight: 4,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: "var(--fs-105)",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: endStat.band.cssVar,
            }}
          >
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: endStat.band.cssVar }} />
            {endStat.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              color: endStat.band.cssVar,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {endStat.value}
          </span>
        </span>
      ) : (
        <>
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
        </>
      )}
      </span>
      <span
        className="cl-lr-overflow"
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
