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
import type { CSSProperties, ReactNode } from "react";
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

/**
 * ListRowColumnHeader — the column-header row that sits above a ListRow
 * list (README §0.4 type scale: "column headers 9.5 uppercase .12em/700").
 * Shares GRID with ListRow so cells line up exactly; additive export, not
 * a fork — every page assembling a ListRow list uses this for its header
 * row instead of a page-local one.
 */
export function ListRowColumnHeader({ dueLabel = "Due" }: { dueLabel?: string }) {
  const cellStyle: CSSProperties = {
    fontSize: "var(--fs-95)",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
    display: "flex",
    alignItems: "center",
  };
  return (
    <div
      className="cl-list-row-header"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: "0 14px",
        padding: "8px 0",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <style>{RESPONSIVE_CSS}</style>
      <span aria-hidden="true" />
      <span style={cellStyle}>Juris.</span>
      <span style={cellStyle}>Title</span>
      <span style={cellStyle}>Impact low → high</span>
      <span style={{ ...cellStyle, justifyContent: "flex-end", textAlign: "right" }}>{dueLabel}</span>
      <span style={cellStyle}>Timeline</span>
      <span style={cellStyle}>Tier</span>
      <span aria-hidden="true" />
    </div>
  );
}

// Responsive collapse (<=640px), NOT part of the artboard (README §"Open decisions": mobile 390 is
// "not yet designed, captures needed" — desktop 1440 is the only fidelity target). Every list page
// this row anatomy serves is currently desktop-only, so this is a provisional, disclosed concession
// to keep the shared part usable rather than overflowing the viewport, logged in DEVIATION-LOG.md
// as follow-up for whichever lane runs the mobile design pass. It hides the impact meter and
// timeline (both remain on the detail page) and stacks jurisdiction/title/due/tier into two lines,
// trading the spine COLUMN for a border-left in the row's own band colour (`--row-band`).
const RESPONSIVE_CSS = `
  .cl-list-row:hover { background: var(--row-hover); }
  @media (max-width: 640px) {
    .cl-list-row-header { display: none !important; }
    .cl-list-row {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: center !important;
      min-height: 0 !important;
      padding: 10px 44px 10px 12px !important;
      gap: 4px 10px !important;
      border-left-color: var(--row-band) !important;
    }
    .cl-list-row .cl-row-spine,
    .cl-list-row .cl-row-impact,
    .cl-list-row .cl-row-timeline { display: none !important; }
    .cl-list-row .cl-row-juris { order: 1; flex: 0 0 auto; }
    .cl-list-row .cl-row-title { order: 2; flex: 1 1 100%; min-width: 0; padding: 0 !important; }
    .cl-list-row .cl-row-due { order: 3; flex: 0 0 auto; align-items: flex-start !important; }
    .cl-list-row .cl-row-tier { order: 4; flex: 0 0 auto; margin-left: auto; }
    .cl-list-row .cl-row-overflow { position: absolute !important; right: 0; top: 0; bottom: 0; }
  }
`;

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
        borderLeft: "3px solid transparent",
        position: "relative",
        ["--row-band" as string]: band.cssVar,
      }}
    >
      <style>{RESPONSIVE_CSS}</style>
      <span className="cl-row-spine" aria-hidden="true" style={{ background: band.cssVar }} />
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
        className="cl-row-juris"
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
      <span className="cl-row-title" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, padding: "8px 0" }}>
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
      <span className="cl-row-impact" style={{ display: "flex", alignItems: "center" }}>
        <ImpactMeter scores={impact} />
      </span>
      <span className="cl-row-due" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end" }}>
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
      <span className="cl-row-timeline" style={{ display: "flex", alignItems: "center" }}>
        <MilestoneTimeline entries={timeline} bandHex={band.cssVar} />
      </span>
      <span className="cl-row-tier" style={{ display: "flex", alignItems: "center" }}>
        {tier != null ? <TierChip tier={tier} /> : <Absence reason="not in primary source" />}
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
