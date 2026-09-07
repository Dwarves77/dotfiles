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
 * Desktop-only (README: 1440px desktop only, Claude Design is producing 390px
 * mobile artboards separately). No <=640px collapse or reflow of any kind —
 * operator ruling 2026-09-07: mobile is not designed in this bundle, so no
 * page in it gets an ad hoc mobile treatment ahead of the real mobile
 * artboards (this retires both UILISTS' own collapse and uimapcomm's
 * flex-wrap reflow). Logged in DEVIATION-LOG.md. The `data-guard-title`
 * attribute, the row-Link's `right: 12` inset, and the additive `endStat`
 * prop (for rows with no impact/due/timeline/tier dimensions of their own,
 * e.g. the map's jurisdiction register) are kept — none is mobile-specific.
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ImpactScores, TimelineEntry } from "@/types/resource";
import type { UrgencyBand } from "@/lib/urgency/bands";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { MilestoneTimeline } from "@/components/ui/MilestoneTimeline";
import { TierChip, WorkspaceTagPill } from "@/components/ui/Chips";
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
  /**
   * Additive extension (lane uitags, 2026-09-07, README "Workspace tags" /
   * ruling R6): the item's applied workspace tags, rendered on the second
   * line beside `meta`. Undefined/empty renders nothing extra — every
   * existing caller is unaffected.
   */
  tags?: { id: string; name: string }[] | null;
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

// Desktop-only (README: 1440px desktop only; mobile artboards are a separate, not-yet-landed
// track). No <=640px collapse here — operator ruling 2026-09-07: no page gets an ad hoc mobile
// treatment ahead of the real mobile artboards. Logged in DEVIATION-LOG.md. Known consequence:
// the rendering guard's 375px UX smoke checks for the five list rows fail (rows clip past the
// viewport at that width) — expected, not a regression, until the operator picks a desktop-only
// guard exemption or a temporary stacking rule.
const RESPONSIVE_CSS = `
  .cl-list-row:hover { background: var(--row-hover); }
`;

export function ListRow({ href, band, jurisdiction, title, meta, impact, due, timeline, tier, overflow, endStat, tags }: ListRowProps) {
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
      {/* Column span excludes the spine (col 1) AND the ⋯ overflow cell (last column) — the row
          Link never shares a box with the Watch/⋯ button. */}
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
        {(meta || (tags && tags.length > 0)) && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              overflow: "hidden",
              marginTop: 2,
            }}
          >
            {meta && (
              <span
                style={{
                  fontSize: "var(--fs-11)",
                  color: "var(--ink-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 1,
                }}
              >
                {meta}
              </span>
            )}
            {tags && tags.length > 0 && (
              <span style={{ display: "flex", gap: 4, flexShrink: 0, position: "relative", zIndex: 1 }}>
                {tags.map((t) => (
                  <WorkspaceTagPill key={t.id} name={t.name} />
                ))}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="cl-row-tail" style={{ display: "contents" }}>
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
        </>
      )}
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
