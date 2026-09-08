/**
 * Card - THE section/panel card. One definition, for the whole product.
 *
 * UI system handoff 2026-09-06, README §0.4 and every page artboard in
 * 'Caros Ledge UI System.dc.html', which draws a card as exactly this:
 * `background:#fff; border:1px solid rgba(0,0,0,.12); border-radius:10px;
 * box-shadow:0 1px 2px rgba(26,26,26,.04),0 4px 14px rgba(26,26,26,.06)`
 * with a 3px rule on its top edge. Operator rulings 5.1 + 4.1 (2026-09-07)
 * put that rule above every panel sitewide and removed the divider that
 * used to sit under the section title.
 *
 * WHY THIS FILE EXISTS (lane layoutguard, 2026-09-08). Four files carried a
 * byte-for-byte identical local `function Card()` - DashboardBrief.tsx,
 * ListSurfaceShell.tsx, MapPageView.tsx and WatchlistSurface.tsx - each with
 * a comment explaining that it was the same five declarations as the others.
 * That is the duplication CLAUDE.md rule 13 forbids, and it is also what made
 * the operator's L6 ("every card gets its 3px top rule, 1px border, radius
 * 10, shadow") unenforceable: with four definitions there was no one place a
 * card's chrome could be asserted, and a fifth surface that wrote its own
 * div was indistinguishable from one that used a card. There is one now.
 *
 * `data-guard-card` is what the site-wide layout guard's L6 and L10 read.
 * The guard does NOT depend on it - it detects a card structurally, by the
 * chrome above, so a surface that draws its own card is still measured - but
 * the attribute names the ones that came from here.
 *
 * `noRule`: the per-band card on a list surface carries its own top-edge 3px
 * BAND accent (BandSectionHeader), which is a data-grouping marker rather
 * than a section rule, and stacking two 3px rules is not what any artboard
 * draws. That one caller opts out; nothing else does.
 */

import type { ReactNode } from "react";
import { SectionRule } from "@/components/ui/SectionRule";

export function Card({ children, noRule }: { children: ReactNode; noRule?: boolean }) {
  return (
    <div
      data-guard-card
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {!noRule && <SectionRule />}
      {children}
    </div>
  );
}
