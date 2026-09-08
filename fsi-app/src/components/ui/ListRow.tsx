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
 * The `data-guard-title` attribute is unchanged by this lane.
 *
 * REGISTER VARIANT (lane map60, 2026-09-08): `variant="register"` renders
 * artboard 10's jurisdiction register instead, its own six-column grid
 * (3px 1fr 1fr 110px 80px 40px), 44px rows, a name column beside an active-
 * themes column, the band + count stat cells from `endStat`, and a trailing
 * → glyph. It has no mobile reflow: /map at 375 is exempt by operator ruling
 * (2026-09-07, second set, item 2) and no mobile map spec exists to build to.
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ImpactScores, TimelineEntry } from "@/types/resource";
import type { UrgencyBand } from "@/lib/urgency/bands";
import { ImpactMeter, isImpactScored } from "@/components/ui/ImpactMeter";
import { MilestoneTimeline } from "@/components/ui/MilestoneTimeline";
import { TierChip, WorkspaceTagPill } from "@/components/ui/Chips";
import { Absence, pickAbsenceReason, type AbsenceReason } from "@/components/ui/Absence";

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
   * The REGISTER variant's two stat cells (see `variant` below): a band-coloured dot + band label
   * in the HIGHEST BAND column, and a band-coloured tabular numeral in the ITEMS column, exactly
   * as dc.html p10 draws them. Read only when `variant="register"`; the list anatomy has its own
   * impact/due/timeline/tier cells and ignores it.
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
  /**
   * Additive extension (lane map60, 2026-09-08, dc.html p10 "Jurisdiction
   * register"): the REGISTER anatomy. Artboard 10 draws the register on its
   * own six-column grid, `3px 1fr 1fr 110px 80px 40px`, where the
   * jurisdiction NAME and its ACTIVE THEMES are two side-by-side columns
   * under their own headers, the highest band and item count are the next
   * two, and the row ends in a → glyph. The generic eight-column list grid
   * cannot express that (it puts the code in a 56px cell and the themes on a
   * second line under the title, which is what the pre-map60 build showed).
   * Undefined keeps the original eight-column anatomy byte for byte, so every
   * other caller (Regulations, Market, Research, Operations, Watchlist,
   * Dashboard) is unaffected. Requires `endStat`; `impact`/`due`/`timeline`/
   * `tier`/`overflow`/`tags` are not part of this anatomy and are ignored.
   */
  variant?: "list" | "register";
}

const GRID = "3px 56px 1fr 88px 84px 76px 40px 44px";
// dc.html p10, the "Jurisdiction register" card's own header and row grids (identical on both):
// `grid-template-columns:3px 1fr 1fr 110px 80px 40px; gap:0 14px; padding:0 16px 0 0`.
const REGISTER_GRID = "3px 1fr 1fr 110px 80px 40px";
const REGISTER_PADDING = "0 16px 0 0";

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
  variant = "list",
}: {
  dueLabel?: string;
  /** Additive extension (lane comp-11, 2026-09-08): artboard 11 (id="p11")
   *  labels this column "Title · type · modes" where artboard 1 labels it
   *  "Title". Default is unchanged, so every existing caller is unaffected. */
  titleLabel?: string;
  /** Additive extension (lane map60, 2026-09-08): the register header row for
   *  ListRow's `variant="register"` rows, dc.html p10's own
   *  JURISDICTION / ACTIVE THEMES / HIGHEST BAND / ITEMS labels on the
   *  register grid. Default "list" is unchanged for every existing caller. */
  variant?: "list" | "register";
}) {
  // Every header cell is a grid item in the same fixed GRID the rows use (88px impact, 84px due,
  // 76px timeline, 40px tier). `minWidth: 0` overrides the flex/grid item default of `min-width:
  // auto`, which otherwise refuses to shrink below its content's intrinsic width — the exact
  // mechanism that let "Impact low → high" push past its 88px column and collide with the DUE
  // column's dates (operator report 2026-09-07, D1).
  //
  // DEFECT 2, lane opsclip (train 61, 2026-09-08). The D1 fix above was correct; the `whiteSpace:
  // nowrap` + `textOverflow: ellipsis` that shipped WITH it was not. Measured on production at
  // 1440, the IMPACT header rendered as "IMPACT LOW → H" on the dashboard and on /watchlist, the
  // word HIGH cut to one letter, one defect traded for another. The label cannot fit an 88px
  // column on one line at 9.5px/.12em (it measures ~113px), and the artboard does not ask it to:
  // dc.html p1/p11 give this header cell the SAME 88px track and the SAME type with no nowrap at
  // all, and render it over two lines inside the 30px row. Two 9.5px lines at line-height 1.2
  // measure 22.8px, which fits the artboard's own `height:30px` with room to spare.
  //
  // So the cell WRAPS, exactly as the artboard draws it, and stays inside its own 88px column
  // because `minWidth: 0` (the real D1 fix) is untouched. `alignItems: center` centres the
  // two-line block against the single-line labels beside it.
  //
  // The wrapping treatment goes on the cells that need it (`wrappingCellStyle`), not on
  // `cellStyle`: JURIS. / TITLE / DUE / TIMELINE / TIER each fit their track on one line and keep
  // the ellipsis as their honest last resort.
  //
  // NOTE FOR THE MOBILE LANE (mobfix61 is editing RESPONSIVE_CSS in this file concurrently): this
  // change adds `wrappingCellStyle`/`impactCellStyle` and uses them on header spans. It touches no
  // media query, no class name, and no line of RESPONSIVE_CSS.
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
  // Wraps at WORD boundaries only: the artboard breaks "IMPACT low → high" after IMPACT, and
  // `overflowWrap: anywhere` would break inside the word ("IMPA / CT"), which is the same lost
  // legibility the truncation had, differently spelled. Confirmed by capture at 1440.
  const impactCellStyle: CSSProperties = {
    ...cellStyle,
    whiteSpace: "normal",
    textOverflow: "clip",
    lineHeight: 1.2,
  };
  // The register variant's own labels sit in tracks that go genuinely tiny at the narrow widths
  // /map has no artboard for, where a single unbreakable word cannot fit any other way.
  const wrappingCellStyle: CSSProperties = { ...impactCellStyle, overflowWrap: "anywhere" };
  if (variant === "register") {
    // dc.html p10: same 30px height, same 9.5/.12em/700/--ink-3 type, the register grid, and the
    // ITEMS label right-aligned over its right-aligned numerals. The spine and arrow columns carry
    // no label, exactly as the artboard leaves them blank.
    //
    // DEFECT 2's class, lane opsclip (train 61): "HIGHEST BAND" measured 146px against its own
    // 110px track and shipped truncated, exactly as the IMPACT header did, found by the new
    // column-header fit rule, not by the operator, which is the point. The artboard's own markup
    // for this row (dc.html p10, the register card's header div) carries no `nowrap` either and
    // draws the label over two lines, so these cells take the same wrapping treatment. `height`
    // becomes `minHeight` so the row is the artboard's 30px at every width where two 9.5px lines
    // fit inside it (every desktop width), and grows rather than clipping at the narrow widths
    // /map has no artboard for. `overflowWrap: anywhere` lets a single long label break at those
    // widths instead of running out of its column.
    return (
      <div
        className="cl-list-row-header cl-list-row-header-register"
        style={{
          display: "grid",
          gridTemplateColumns: REGISTER_GRID,
          gap: "0 14px",
          minHeight: 30,
          padding: REGISTER_PADDING,
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        <span aria-hidden="true" />
        <span style={wrappingCellStyle}>Jurisdiction</span>
        <span style={wrappingCellStyle}>Active themes</span>
        <span style={wrappingCellStyle}>Highest band</span>
        <span style={{ ...wrappingCellStyle, justifyContent: "flex-end", textAlign: "right" }}>Items</span>
        <span aria-hidden="true" />
      </div>
    );
  }
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
      <span style={impactCellStyle}>
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
  /* The register row (variant="register", dc.html p10) carries the same hover the list row does.
     It is deliberately OUTSIDE the max-width:767px block below: the mobile reflow rewrites the
     eight-column list grid, and the register's own six-column grid has no mobile artboard to
     reflow to (operator ruling 2026-09-07, second set, item 2: no mobile map spec exists and none
     should be invented). */
  .cl-list-row-register:hover { background: var(--row-hover); }

  /* FOLD-61 [CONFIRMED, measured at 390 by the audit's own probe]: the register's six tracks
     (3px 1fr 1fr 110px 80px 40px, five 14px gaps) need 303px of fixed width and gap alone. In the
     356px row the map page gives them at 390, that left 37px for BOTH "1fr" tracks, so the
     jurisdiction NAME column computed to 18.5px and rendered as roughly one character and an
     ellipsis, with the meta column beside it the same. Neither lane could see it: map60 built this
     variant with no 390 spec in existence, and mobfix61's mobile-10-map spec was written against
     the shared ".cl-list-row" this variant replaced, so its four register rows reported NOT BUILT
     rather than measuring the row that shipped.

     The comment above is still right that no mobile ARTBOARD for this register exists and none is
     invented here. What governs instead is the mobile 390 spec's own operator prose: "the frame
     collapses; every part is the desktop part at a smaller measure". So every part stays - name,
     meta, band, count and the arrow all still render, in the same order and with the same type -
     and only the MEASURE changes: name over meta in one flexible column, band over count in a
     narrow one, the 40px arrow full height. The desktop grid is untouched above 768. */
  @media (max-width: 767px) {
    .cl-list-row-register {
      grid-template-columns: 3px minmax(0, 1fr) 68px 40px !important;
      gap: 2px 10px !important;
      padding-right: 8px !important;
    }
    .cl-list-row-register > .cl-row-spine { grid-column: 1; grid-row: 1 / -1; }
    .cl-row-register-name { grid-column: 2; grid-row: 1; }
    .cl-row-register-meta { grid-column: 2; grid-row: 2; }
    .cl-row-register-band { grid-column: 3; grid-row: 1; }
    .cl-row-register-count { grid-column: 3; grid-row: 2; }
    .cl-row-register-arrow { grid-column: 4; grid-row: 1 / -1; }
  }

  @media (max-width: 767px) {
    /* MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390 by
       .discipline/rendering/audit/spec/mobile-01-dashboard.json]: the column header
       keeps the desktop eight-track GRID, whose fixed tracks alone (3+56+88+84+76+
       40+44 plus seven 14px gaps) need 489px before the 1fr title column gets a
       single pixel — so at 390 it ran ~160px past the card and its IMPACT / DUE /
       TIMELINE / TIER labels sat over the page edge. The mobile 390 spec has no
       column header at all (the row is two-line and the timeline column is dropped),
       so the header is not reflowed here, it is not shown: one rule on the shared
       part, so every list surface and the dashboard get it once. */
    .cl-list-row-header { display: none !important; }
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
    /* MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390 and read off
       docs/design/handoff-2026-09-06/built/mobile-01-dashboard.png]: the overflow control
       was an ordinary item of the wrapping line-2 flow with margin-left: auto, and at 390
       the metadata ahead of it (impact 72-108px, date+days 130-142px, tier 30px, three 9px
       gaps) already fills the 296px content width — so it wrapped onto a line of its own,
       every time, and rendered as a 44px box with a dangling left rule and nothing beside
       it. That is the orphan/collision class the operator's 2026-09-07 visual-pass standard
       forbids. It is now a fixed 44px gutter at the row's right edge, vertically centred:
       the row reserves the width with its own padding-right, so the control is exactly the
       spec's 44x44 with its border-left, "pushed right", and the metadata wraps inside the
       space that is actually left. The row grid stays "3px 1fr" as the spec writes it; the
       gutter is padding on the row, not a third track. */
    .cl-list-row { padding-right: 44px !important; }
    .cl-row-overflow {
      position: absolute !important;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      margin-left: 0 !important;
      border-left: 1px solid rgba(0,0,0,.08) !important;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
    }
  }
`;

export function ListRow({ href, band, jurisdiction, title, meta, impact, due, timeline, tier, overflow, endStat, tags, minHeight = 56, variant = "list" }: ListRowProps) {
  if (variant === "register" && endStat) {
    return (
      <div
        className="cl-list-row-register"
        style={{
          display: "grid",
          gridTemplateColumns: REGISTER_GRID,
          gap: "0 14px",
          minHeight,
          alignItems: "stretch",
          borderBottom: "1px solid var(--line-3)",
          padding: REGISTER_PADDING,
          position: "relative",
        }}
      >
        <style>{RESPONSIVE_CSS}</style>
        <span className="cl-row-spine" aria-hidden="true" style={{ background: band.cssVar }} />
        {/* The whole row is the one click target (README §0.4). The register row carries no ⋯
            cell, so unlike the list row this Link spans every column but the spine, the → glyph
            is a direction affordance the artboard draws, never a second competing target. */}
        <Link
          href={href}
          prefetch={false}
          className="cl-row-link"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            gridColumn: "2 / -1",
            gridRow: "1 / -1",
            textDecoration: "none",
          }}
          aria-label={title}
        />
        <span
          className="cl-row-register-name"
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "var(--fs-13)",
            fontWeight: 600,
            color: "var(--ink)",
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
        <span
          className="cl-row-register-meta"
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "var(--fs-12)",
            color: "var(--ink-2)",
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {meta}
        </span>
        <span
          className="cl-row-register-band"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: "var(--fs-10)",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ink)",
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: endStat.band.cssVar, flexShrink: 0 }} />
          {endStat.label}
        </span>
        <span
          className="cl-row-register-count"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            fontFamily: "var(--font-display)",
            fontSize: 16,
            color: endStat.band.cssVar,
            fontVariantNumeric: "tabular-nums",
            minWidth: 0,
          }}
        >
          {endStat.value}
        </span>
        <span
          aria-hidden="true"
          className="cl-row-register-arrow"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}
        >
          →
        </span>
      </div>
    );
  }

  // The register variant above is the ONLY consumer of `endStat`. Until lane map60 this branch
  // ALSO rendered it inside the eight-column list grid as one merged `4 / span 4` cell, an
  // approximation of artboard 10's register that map-register.json's own note called out as "a
  // genuine layout-strategy difference" from what p10 draws. The variant reproduces p10 exactly,
  // so the approximation is DELETED rather than left as a second way to render the same row
  // (CLAUDE.md rule 13). The list anatomy below is unchanged.
  // ONE ABSENCE PER ROW (lane mobfix61, 2026-09-08, operator mobile report D-M4)
  // [CONFIRMED root cause]: the impact, due and tier cells each rendered their own
  // `<Absence>` independently, so a row missing all three drew a dashed baseline, then
  // "UNSCORED", then "PENDING", then "NOT IN PRIMARY SOURCE" - three tokens, and at 390 the
  // third wrapped onto a line of its own beside a dangling divider. That is what the operator
  // photographed on 2026-09-08, and the design audit's own "no literal UNSCORED" forbids read
  // source text rather than rendered text, so all of them reported MATCH while it shipped (the
  // harness half of this defect is fixed in run-audit.mjs's `renderedText`).
  //
  // This is NOT a mobile defect: the same three tokens render at 1440 (measured), so the fix is
  // in the shared part for both widths, per ruling 2.1 ("removed everywhere").
  //
  // The row asks Absence.tsx for the single reason, then renders it in the cell that OWNS that
  // dimension, so the token still sits under the column it explains and the other cells stay
  // empty. `reasonSlot` is what makes "at most one" structural rather than a convention.
  //
  // FOLD-61: lane opsclip's narrow-cell rule is the PRESENTATION half of this same mechanism, not
  // a second one. This block decides WHICH reason a row shows and WHERE; `variant="narrow"`
  // decides how that one reason is drawn in a cell too small to hold the phrase. They meet in the
  // tier cell, the only 40px fixed track of the three, and the artboard decides what it shows:
  // dc.html p2 and p8 draw a dash there and explain it once in the card foot, so the tier slot
  // renders the dash while the impact and due slots, which have room, render the words.
  const impactScored = isImpactScored(impact);
  const rowAbsence: AbsenceReason | null = pickAbsenceReason([
    tier == null ? "not in primary source" : null,
    !due || !impactScored ? "pending" : null,
  ]);
  const reasonSlot: "impact" | "due" | "tier" | null =
    rowAbsence === null ? null : rowAbsence === "not in primary source" ? "tier" : !due ? "due" : "impact";

  const tailContent = (
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
        <ImpactMeter scores={impact} reason={reasonSlot === "impact" ? rowAbsence : null} />
      </span>
      <span className="cl-row-due" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", minWidth: 0 }}>
        {due ? (
          <>
            <span className="cl-row-due-label" style={{ fontSize: "var(--fs-125)", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {due.label}
            </span>
            <span className="cl-row-due-days" style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{due.days}</span>
          </>
        ) : reasonSlot === "due" && rowAbsence ? (
          <Absence reason={rowAbsence} />
        ) : null}
      </span>
      <span className="cl-row-timeline" style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <MilestoneTimeline entries={timeline} bandHex={band.cssVar} />
      </span>
      <span className="cl-row-tier" style={{ display: "flex", alignItems: "center", textAlign: "center", minWidth: 0 }}>
        {/* DEFECT 3 (lane opsclip, train 61): the TIER column is a 40px fixed track, and
            "NOT IN PRIMARY SOURCE" wrapped over three lines inside it, doubling the row's height
            on the dashboard. `variant="narrow"` is the Absence part's own rule for a cell this
            size, the dash, with the same closed-vocabulary reason on `aria-label`/`title`.
            D-M4 (lane mobfix61) decides WHETHER this cell is the one that speaks: the dash is
            drawn only when the row's single reason belongs to the tier dimension, so a row whose
            reason is "pending" leaves this cell empty rather than adding a second token. */}
        {tier != null ? <TierChip tier={tier} /> : reasonSlot === "tier" && rowAbsence ? <Absence reason={rowAbsence} variant="narrow" /> : null}
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
                      // DEFECT 6 (lane opsclip, train 61, 2026-09-08): production cut this line
                      // mid-word with NO ellipsis on /research ("initiative · Last-mile
                      // electrifica") while the title directly above it truncated properly. Root
                      // cause [CONFIRMED]: `flexShrink: 1` without `minWidth: 0` is inert, a flex
                      // item's default `min-width: auto` refuses to shrink below its content's
                      // intrinsic width, so this span never narrowed, its own ellipsis never had
                      // anything to do, and the PARENT's `overflow: hidden` did the cutting
                      // instead. Same mechanism this file's own ListRowColumnHeader header
                      // documents for the D1 collision.
                      minWidth: 0,
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
