"use client";

/**
 * RailCard (`data-part="rail-card"`), the ONE rail-card shell, every rail on every surface.
 * Lane W10-RailCard, 2026-09-22, parts-brief 2.12 (RAIL CARD): "Header 10.5px uppercase .12em/700
 * muted; label/value rows 12.5px, labels muted." Ruling 5 (legend rail card): one live ImpactMeter
 * frozen at N=8 next to the text, no diagram, carried by LegendRailCard in
 * `src/components/list-surface/ListSurfaceRailCards.tsx`, which now builds on this part instead of
 * defining its own copy.
 *
 * PRIOR ART (reuse-before-construction). Before this lane, the same "SectionCard + padding 14px
 * 16px + 10.5px/800/.12em uppercase muted header" shell was hand-retyped in at least four places:
 * `ListSurfaceRailCards.tsx`'s own local `RailCard`, `DetailShell.tsx`'s `AtAGlanceCard` /
 * `RailLegend` / `ImpactRailCard` (the detail rail "At a glance" / "Impact assessment" / "Legend"
 * cards the operator's review called correct in content), `home/DashboardRailCard.tsx` (the
 * dashboard's Watchlist rail), and `admin/redesign/AdminIssuesRail.tsx` (the admin "Issues queue"
 * rail). This file is the one home; every one of those call sites now imports it. The operator's
 * instruction (brief item 6, verbatim): "keep their content, move them onto the parts", no
 * content, copy, or data changed at any of those call sites, only the shell.
 *
 * `headLink` (an artboard 02/id="p2" anchor, e.g. "Calendar →") and `headRight` (an arbitrary node
 * on the head's trailing edge, e.g. AdminIssuesRail's computed red total) are mutually exclusive:
 * a caller supplies at most one. Neither existed before this lane except `headLink`; `headRight` is
 * the additive generalization AdminIssuesRail's own count badge needed, kept inside this one file
 * rather than becoming a fifth hand-rolled head variant.
 */

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";

const RAIL_CARD_TITLE_STYLE: React.CSSProperties = {
  fontSize: "var(--fs-105)",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  margin: 0,
};

export interface RailCardProps {
  title: string;
  children: ReactNode;
  /** Design-audit hook (../../.discipline/rendering/audit), a stable selector for a real page
   *  composition mount, since some callers (e.g. LegendRailCard) mount this with no wrapper div of
   *  their own. */
  dataAudit?: string;
  /** Right-aligned link on the card head's baseline (artboard 02/id="p2" "Obligations · next 30
   *  days" → "Calendar →"). Mutually exclusive with `headRight`. */
  headLink?: { label: string; href: string };
  /** Right-aligned arbitrary node on the card head's baseline (AdminIssuesRail's computed total
   *  badge). Mutually exclusive with `headLink`. */
  headRight?: ReactNode;
  /** When set, the TITLE ITSELF becomes the entry point to the card's full surface, the
   *  dashboard's Watchlist rail pattern (`home/DashboardRailCard.tsx`, pre-lane), title renders
   *  "Watchlist →" as a Link. Mutually exclusive with `headLink`/`headRight` (a card has one head
   *  affordance, not two). */
  titleHref?: string;
  /** A count shown beside the title, muted (the dashboard rail's "3 of 12" reading). Only
   *  meaningful alongside `titleHref`; ignored otherwise since a plain title carries no adjacent
   *  count in any artboard this part serves. */
  titleCount?: string;
  /** Extra layout properties the CALLER owns on the card element itself (AdminIssuesRail's
   *  `minWidth: 0`, needed so the card can shrink inside the admin right rail's grid track). The
   *  card's own five shell properties still come from `SectionCard` and always win. */
  style?: CSSProperties;
}

export function RailCard({ title, children, dataAudit, headLink, headRight, titleHref, titleCount, style }: RailCardProps) {
  if (titleHref) {
    return (
      <SectionCard dataAudit={dataAudit ?? "rail-card"} dataAttributes={{ "data-part": "rail-card" }} style={style}>
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 10px" }}>
            {/* Law-2 floor (docs/design/ux-laws.md #2): a small-font, zero-padding title link
                measures well under the 44px target size; `minHeight: 28` + inline-flex reaches the
                small-target floor without changing the visible type scale (carried over verbatim
                from `home/DashboardRailCard.tsx`, pre-lane). */}
            <Link
              href={titleHref}
              prefetch={false}
              style={{ ...RAIL_CARD_TITLE_STYLE, textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 28 }}
            >
              {title} →
            </Link>
            {titleCount && <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--ink-3)" }}>{titleCount}</span>}
          </div>
          {children}
        </div>
      </SectionCard>
    );
  }
  const headTrailing = headLink ? (
    <a
      href={headLink.href}
      style={{
        minHeight: 24,
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        // Artboard 02/id="p2" head link: 11px, weight 600.
        fontSize: "var(--fs-11)",
        fontWeight: 600,
        color: "var(--ink)",
        textDecoration: "underline",
        textDecorationColor: "rgba(0,0,0,.3)",
      }}
    >
      {headLink.label}
    </a>
  ) : (
    headRight ?? null
  );

  return (
    <SectionCard dataAudit={dataAudit ?? "rail-card"} dataAttributes={{ "data-part": "rail-card" }} style={style}>
      <div style={{ padding: "14px 16px" }}>
        {headTrailing ? (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "0 0 10px" }}>
            <p style={RAIL_CARD_TITLE_STYLE}>{title}</p>
            {headTrailing}
          </div>
        ) : (
          <p style={{ ...RAIL_CARD_TITLE_STYLE, margin: "0 0 10px" }}>{title}</p>
        )}
        {children}
      </div>
    </SectionCard>
  );
}
