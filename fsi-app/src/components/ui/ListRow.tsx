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
 * Mobile (lane moblist, 2026-09-07, mobile-390 spec "LIST ROW"): below 768px
 * a CSS media query on THIS shared part (never a page-local override)
 * reflows the row to the spec's 76px two-line anatomy — line 1 jurisdiction
 * code + wrapping title, line 2 impact meter/sum, date+days, tier,
 * workspace tags, then the 44x44 overflow control pushed right; the
 * TIMELINE column is the only thing dropped at this width (it stays on
 * detail, per the spec's own "THE 76px TIMELINE COLUMN IS THE ONLY THING
 * DROPPED" line). 375px is a fluid reflow of the same row, not a fixed
 * 390px layout — no horizontal clipping at either width. Tablet 1024 and
 * desktop keep the original fixed 8-column grid unchanged (operator ruling
 * 2026-09-07: "tablet 1024 keeps the desktop row... leave tablet as is").
 * The `data-guard-title` attribute and the additive `endStat` prop (for
 * rows with no impact/due/timeline/tier dimensions of their own, e.g. the
 * map's jurisdiction register) are unchanged by this lane.
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
  /**
   * Additive extension (design audit B130, 2026-09-07, map-register.json,
   * dc.html p10 'Jurisdiction register' card): register-style rows (a row
   * per JURISDICTION, not per scored item — carries no impact/due/timeline
   * of its own) are 44px tall, not the general row's 56px. Undefined keeps
   * the original 56px — every existing caller is unaffected.
   */
  minHeight?: number;
}

const GRID = "3px 56px 1fr 88px 84px 76px 40px 44px";

/**
 * ListRowColumnHeader — the column-header row that sits above a ListRow
 * list (README §0.4 type scale: "column headers 9.5 uppercase .12em/700").
 * Shares GRID with ListRow so cells line up exactly; additive export, not
 * a fork — every page assembling a ListRow list uses this for its header
 * row instead of a page-local one.
 */
export function ListRowColumnHeader({
  dueLabel = "Due",
  titleLabel = "Title",
}: {
  dueLabel?: string;
  /** Additive extension (lane comp-11, 2026-09-08): artboard 11 (id="p11")
   *  labels this column "Title · type · modes" where artboard 1 labels it
   *  "Title". Default is unchanged, so every existing caller is unaffected. */
  titleLabel?: string;
}) {
  // Every header cell is a grid item in the same fixed GRID the rows use (88px impact, 84px due,
  // 76px timeline, 40px tier). `minWidth: 0` overrides the flex/grid item default of `min-width:
  // auto`, which otherwise refuses to shrink below its content's intrinsic width — the exact
  // mechanism that let "Impact low → high" push past its 88px column and collide with the DUE
  // column's dates (operator report 2026-09-07, D1). `whiteSpace: nowrap` + `textOverflow:
  // ellipsis` + `overflow: hidden` keep every label on ONE line, clipped inside its own column
  // rather than wrapping into a second line or bleeding into the next column.
  const cellStyle: CSSProperties = {
    fontSize: "var(--fs-95)",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  };
  return (
    <div
      className="cl-list-row-header"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: "0 14px",
        height: 30,
        // dc.html p1 line 116 / p11 line 55, identical on both: `padding:0 12px 0 0`.
        // The 12px right pad is what puts this header's last grid line on the SAME
        // x as ListRow's own (the row carries paddingRight 12); the prior "8px 0"
        // left the header's ⋯ column 12px wider than the rows beneath it.
        padding: "0 12px 0 0",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <style>{RESPONSIVE_CSS}</style>
      <span aria-hidden="true" />
      <span style={cellStyle}>Juris.</span>
      <span style={cellStyle}>{titleLabel}</span>
      {/* dc.html p1 line 121 / p11 line 60: "low → high" is a nested span at
          weight 400 / letter-spacing .04em inside the 700/.12em "Impact" label,
          not one uniform run. */}
      <span style={cellStyle}>
        Impact&nbsp;
        <span style={{ fontWeight: 400, letterSpacing: "0.04em" }}>low → high</span>
      </span>
      <span style={{ ...cellStyle, justifyContent: "flex-end", textAlign: "right" }}>{dueLabel}</span>
      <span style={cellStyle}>Timeline</span>
      <span style={cellStyle}>Tier</span>
      <span aria-hidden="true" />
    </div>
  );
}

// Mobile 390 spec "LIST ROW" (lane moblist, 2026-09-07): a media query on this shared part,
// never a page-local copy. Below 768px the wrappers below (.cl-row-content/.cl-row-line1/
// .cl-row-line2, each `display: contents` at >=768px so desktop's original 8-column grid is
// byte-identical to before this lane) switch to a flex column of two flex rows. 375px is a
// fluid reflow of the same row (min-height 76px, wrapping title, no fixed 390px box) — the
// mechanism the rendering guard's 375px UX smoke checks for the five list rows require.
const RESPONSIVE_CSS = `
  .cl-list-row:hover { background: var(--row-hover); }

  @media (max-width: 767px) {
    .cl-list-row { grid-template-columns: 3px 1fr !important; min-height: 76px !important; }
    .cl-row-link { right: 0 !important; grid-column: 2 / -1 !important; }
    .cl-row-content { display: flex !important; flex-direction: column; grid-column: 2 / -1; padding: 10px 6px 10px 12px; min-width: 0; }
    .cl-row-line1 { display: flex !important; align-items: baseline; gap: 8px; min-width: 0; }
    .cl-row-line1 .cl-row-juris { flex-shrink: 0; padding: 0; }
    .cl-row-line1 .cl-row-title { padding: 0 !important; min-width: 0; flex: 1; }
    .cl-row-title-text { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; font-size: 13.5px !important; line-height: 1.35 !important; }
    .cl-row-line1 .cl-row-juris { font-size: 10.5px !important; letter-spacing: 0.06em !important; color: var(--ink-2) !important; }
    .cl-row-meta-tags { display: none !important; }
    .cl-row-line2 { display: flex !important; align-items: center; flex-wrap: wrap; gap: 9px; margin-top: 7px; }
    .cl-row-due { flex-direction: row !important; align-items: baseline !important; gap: 5px; }
    .cl-row-due-label { font-size: 11.5px !important; font-weight: 700 !important; }
    .cl-row-due-days { font-size: 11.5px !important; font-weight: 500 !important; }
    .cl-row-timeline { display: none !important; }
    .cl-row-tags-mobile { display: inline-flex !important; }
    .cl-row-overflow { margin-left: auto; border-left: 1px solid rgba(0,0,0,.08) !important; width: 44px; height: 44px; flex-shrink: 0; }
  }
`;

export function ListRow({ href, band, jurisdiction, title, meta, impact, due, timeline, tier, overflow, endStat, tags, minHeight = 56 }: ListRowProps) {
  const tailContent = endStat ? (
    <span
      style={{
        gridColumn: "4 / span 4",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingRight: 4,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: "var(--fs-10)",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink)",
        }}
      >
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: endStat.band.cssVar }} />
        {endStat.label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          color: endStat.band.cssVar,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {endStat.value}
      </span>
    </span>
  ) : (
    <>
      {/* `minWidth: 0` on every fixed-width grid cell (D1, operator report 2026-09-07): a grid
          item's default `min-width: auto` refuses to shrink below its content's intrinsic width,
          so a cell whose content is wider than its column (the unscored ImpactMeter's dashed
          baseline + Absence reason is the case that shipped a visible defect) bleeds into the
          next column instead of being contained by it. `overflow: hidden` is added ONLY on the
          impact cell, which is where a fix was actually needed (ImpactMeter's unscored content is
          made to WRAP inside its column, so nothing here is ever clipped — this is a backstop, not
          the mechanism): the due/timeline/tier cells are left overflow-VISIBLE, because their own
          content (nowrap dates, the Absence "not in primary source"/"pending" reason) already
          wraps or sizes safely within its column via ordinary flex-shrink — an `overflow: hidden`
          tried here during this fix clipped "not in primary source" mid-word instead of letting it
          wrap, a regression caught in this lane's own screenshot check, not a fix. */}
      <span className="cl-row-impact" style={{ display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" }}>
        <ImpactMeter scores={impact} />
      </span>
      <span className="cl-row-due" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", minWidth: 0 }}>
        {due ? (
          <>
            <span className="cl-row-due-label" style={{ fontSize: "var(--fs-125)", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {due.label}
            </span>
            <span className="cl-row-due-days" style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{due.days}</span>
          </>
        ) : (
          <Absence reason="pending" />
        )}
      </span>
      <span className="cl-row-timeline" style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <MilestoneTimeline entries={timeline} bandHex={band.cssVar} />
      </span>
      <span className="cl-row-tier" style={{ display: "flex", alignItems: "center", textAlign: "center", minWidth: 0 }}>
        {tier != null ? <TierChip tier={tier} /> : <Absence reason="not in primary source" />}
      </span>
    </>
  );

  return (
    <div
      className="cl-list-row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: "0 14px",
        minHeight,
        alignItems: "stretch",
        borderBottom: "1px solid var(--line-3)",
        paddingRight: 12,
        position: "relative",
        ["--row-band" as string]: band.cssVar,
      }}
    >
      <style>{RESPONSIVE_CSS}</style>
      <span className="cl-row-spine" aria-hidden="true" style={{ background: band.cssVar }} />
      {/* Column span excludes the spine (col 1) AND the ⋯ overflow cell (last column) — the row
          Link never shares a box with the Watch/⋯ button. At <768px .cl-row-link (CSS above)
          spans the full content column instead: the ⋯ control moves inside the flex line-2 flow
          and wins clicks over the Link via its own z-index (unchanged from desktop), so no
          competing click target is introduced. */}
      <Link
        href={href}
        prefetch={false}
        className="cl-row-link"
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
      <div className="cl-row-content" style={{ display: "contents" }}>
        <div className="cl-row-line1" style={{ display: "contents" }}>
          <span
            className="cl-row-juris"
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: "var(--fs-11)",
              fontWeight: 700,
              color: "var(--ink-2)",
              letterSpacing: "0.06em",
              minWidth: 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {jurisdiction}
          </span>
          <span className="cl-row-title" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, padding: "8px 0" }}>
            <span
              data-guard-title
              className="cl-row-title-text"
              style={{
                fontSize: "var(--fs-14)",
                fontWeight: 600,
                lineHeight: "18.2px",
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </span>
            {/* Desktop-only line (README §0.4: 11px muted meta + tags beneath the title). Hidden
                <768px (.cl-row-meta-tags above) where `meta` stays put per this lane's title but
                `tags` re-renders below in .cl-row-line2 (mobile spec's line-2 item order) instead —
                logged in DEVIATION-LOG.md: the mobile spec is silent on `meta`'s own position, so it
                is left exactly where it already sat rather than invented a new placement. */}
            {(meta || (tags && tags.length > 0)) && (
              <span
                className="cl-row-meta-tags"
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
                      color: "var(--ink-3)",
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
        </div>
        <div className="cl-row-line2" style={{ display: "contents" }}>
          {tailContent}
          {/* Mobile-only: line 2's "then workspace tags" item (spec order). Hidden >=768px — the
              desktop tag rendering above (.cl-row-meta-tags) is unchanged. */}
          {tags && tags.length > 0 && (
            <span className="cl-row-tags-mobile" style={{ display: "none", gap: 4, position: "relative", zIndex: 1 }}>
              {tags.map((t) => (
                <WorkspaceTagPill key={`m-${t.id}`} name={t.name} />
              ))}
            </span>
          )}
          <span
            className="cl-row-overflow"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderLeft: "1px solid var(--line-2)",
              position: "relative",
              zIndex: 1,
            }}
          >
            {overflow}
          </span>
        </div>
      </div>
    </div>
  );
}
