"use client";

import type { CSSProperties, ReactNode } from "react";
import { SectionRule } from "@/components/ui/SectionRule";

/**
 * SectionCard: THE section/panel card shell. One component, every card.
 *
 * WHY IT EXISTS (operator item A1, UI fix round 2026-09-08, verbatim: "The 3px
 * graduated rule at the top of every card is MISSING on all pages except the band
 * blocks. It is part of the card component, not a decoration"). Before this file the
 * card shell was not a component at all: the same five declarations
 *
 *     background: var(--card); border: 1px solid var(--line-1);
 *     border-radius: var(--radius-card); box-shadow: var(--shadow-card);
 *     overflow: hidden
 *
 * were retyped in fifteen files, each caller then mounting `<SectionRule/>` by hand,
 * or forgetting to, or (CommunityRooms' `CARD`) typing radius 8 and no shadow at all.
 * A rule every caller has to remember is a rule that is missing somewhere, which is
 * exactly what the operator found. The fix is structural, not per page: the rule,
 * the border, the radius and the shadow belong to the CARD, so a card cannot be
 * constructed without them. Closing the class is F42's job (a card shell assembled
 * by hand outside this file is a fitness violation); this file is what the class
 * closes onto.
 *
 * THE VALUES, from the artboard markup verbatim (`Caros Ledge UI System.dc.html`,
 * 84 occurrences, every one identical):
 *
 *     background:#fff; border:1px solid rgba(0,0,0,.12); border-radius:10px;
 *     box-shadow:0 1px 2px rgba(26,26,26,.04),0 4px 14px rgba(26,26,26,.06);
 *     overflow:hidden
 *     └─ first child: <div style="height:3px;background:linear-gradient(90deg,
 *        #5A5552,#5A5552 22%,rgba(90,85,82,.18))">
 *
 * which is exactly `--card` / `--line-1` / `--radius-card` / `--shadow-card` in
 * theme.css plus `SectionRule`. `overflow: hidden` is what keeps the rule INSIDE the
 * radius (operator A1: "inside the radius", no square corners over a rounded card):
 * it is a card property here, not a caller's choice.
 *
 * NO LINE BELOW THE TITLE (ruling 5.1, 2026-09-07). The rule sits above the title and
 * nothing sits below it. This component does not draw a title, so it cannot draw a
 * divider under one; a caller that wants one is violating 5.1.
 *
 * NOT the band-coloured rule. Ruling 5.2 (2026-09-07) confines `BandGradientRule` to
 * three places sitewide (nav card cap, mobile top bar, drawer) and the per-band
 * grouping header keeps its own 3px band-colour TOP BORDER, which is a data-grouping
 * marker rather than a card edge. `noRule` in ListSurfaceShell's band card exists for
 * exactly that one case and is the only supported way to suppress this rule.
 *
 * TWO LAYOUTS, ONE RULE. Whether the rule sits in normal flow or is absolutely
 * positioned is decided by the component from `padding`, never by the caller:
 *
 *   - `padding` omitted: the rule is the card's first flow child (the artboard's own
 *     shape) and the caller pads its own inner wrapper. Rail cards, the masthead, the
 *     dashboard's Due next / What changed, the matrix card.
 *   - `padding` given: the padding goes on the card, the card is `position:
 *     relative`, and the rule is absolutely positioned at the top edge so it spans the
 *     full width and is NOT indented by that padding. The detail-page cards.
 *
 * Both mount `<SectionRule/>` unconditionally. Neither is reachable without it.
 *
 * FOLD 62 (2026-09-08). Lane layoutguard created `components/ui/Card.tsx` for the same reason,
 * on the same day, and adopted it in four callers (DashboardBrief, ListSurfaceShell, MapPageView,
 * WatchlistSurface); this file is the survivor because it is the superset (polymorphic tag,
 * padding layout, audit hook, caller data attributes) and because F42 already names it as the one
 * home for a card shell. `Card.tsx` is deleted and its callers are on this component, its `noRule`
 * becoming `suppressRuleForBandGrouping`. `data-guard-card` is carried over from it unchanged: it
 * is what the site-wide layout guard's L6 and L10 read to NAME a card that came from the shared
 * shell (the guard also detects cards structurally, so nothing depends on the attribute for
 * detection).
 */
export interface SectionCardProps {
  children: ReactNode;
  /** The rendered element. Defaults to `div`; `section`/`header`/`aside` where the card is a
   *  landmark in the page's outline (the masthead is a `header`, the matrix a `section`). */
  as?: "div" | "section" | "header" | "aside" | "article";
  /** Content padding ON THE CARD. Supplying it switches the rule to the absolutely positioned
   *  layout so the rule still spans the full card width rather than being inset by the padding. */
  padding?: string | number;
  /** Design-audit hook: rendered as `data-audit`, the stable selector an audit spec addresses. */
  dataAudit?: string;
  className?: string;
  id?: string;
  /** Extra layout properties the CALLER owns (margin, maxWidth, scrollMarginTop, minWidth, grid
   *  placement). The card's own five properties are applied after this object and always win, so
   *  no caller can drop the border, the radius, the shadow or `overflow: hidden`. */
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Extra `data-*` attributes the caller needs on the card element itself (the masthead's
   *  `data-masthead-size`, which its own responsive CSS selects on). Keys are not validated as
   *  `data-*` by the type system; every caller writes the full attribute name. */
  dataAttributes?: Record<string, string>;
  /** Ruling 5.2's ONE exemption: the per-band grouping card, whose top edge is the band-coloured
   *  3px border the band scale owns, not this card's dark-grey gradation. Stacking both would put
   *  two 3px rules on one edge. No other caller may pass it (F42 names this file as its home). */
  suppressRuleForBandGrouping?: boolean;
}

export function SectionCard({
  children,
  as = "div",
  padding,
  dataAudit,
  className,
  id,
  style,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  suppressRuleForBandGrouping = false,
  dataAttributes,
}: SectionCardProps) {
  const Tag = as;
  const padded = padding !== undefined;
  const cardStyle: CSSProperties = {
    ...style,
    background: "var(--card)",
    border: "1px solid var(--line-1)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-card)",
    overflow: "hidden",
    ...(padded ? { position: "relative", padding } : null),
  };
  // `data-section-card` is the marker the design audit's CLASS-CLOSURE row counts on:
  // `[data-section-card=""]:not(:has(.cl-section-rule))` must match zero elements on every page.
  // Ruling 5.2's band-grouping card is the one card that legitimately renders no rule, so it
  // identifies itself by VALUE ("band-grouping") rather than being invisible to that check.
  return (
    <Tag
      {...dataAttributes}
      id={id}
      className={className}
      data-audit={dataAudit}
      data-section-card={suppressRuleForBandGrouping ? "band-grouping" : ""}
      data-guard-card=""
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={cardStyle}
    >
      {suppressRuleForBandGrouping ? null : padded ? (
        <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <SectionRule />
        </div>
      ) : (
        <SectionRule />
      )}
      {children}
    </Tag>
  );
}
