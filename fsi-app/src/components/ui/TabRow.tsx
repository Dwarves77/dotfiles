"use client";

/**
 * TabRow — the account/settings tab row (UI system handoff 2026-09-06,
 * README §0.3: "Tab rows (account, settings) span the frame above the
 * two-column grid, so rail cards align with the first content card.").
 *
 * A new shared part, not shipped by the base UI-system lane (that lane's
 * one page was the dashboard, which has no tab row) — added here because
 * both surfaces in this lane's scope (`/profile`, `/settings`) need the
 * SAME one, and README artboards 14/15 show them as one merged row: the
 * seven Account sub-tabs plus "Settings" itself as the eighth entry,
 * never two stacked tab bars (the pre-existing shape this lane replaces —
 * AccountMasthead's own Profile/Settings pair stacked over
 * AccountPrimitives' SubTabBar).
 *
 * Each tab is a real link (`href`) so /profile and /settings stay two
 * routes with working deep-links and back-navigation; a tab with no href
 * is an in-page state switch (`onClick`) on the surface currently
 * mounted. Active = bold ink; resting = ink-2. One hairline under the whole
 * row (`--line-1`). Per the design audit (2026-09-07, tabrow.json), the
 * artboard also underlines the active tab: a solid 2px brand rule, with
 * every resting tab carrying the same 2px TRANSPARENT rule so no tab shifts
 * width when its state changes, and `margin-bottom: -1px` pulls that rule
 * onto the row's own hairline.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export interface TabRowItem {
  key: string;
  label: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

export interface TabRowProps {
  tabs: TabRowItem[];
  ariaLabel: string;
  /**
   * Where this row sits (additive, lane admin60 2026-09-08).
   *
   * "page" (default) is artboard 14/15's row: it spans the frame above the
   * two-column grid, gap 4, wrapping allowed because the eight account tabs
   * are wider than a narrow frame.
   *
   * "card-head" is artboard 13's row, which dc.html p13 draws INSIDE the
   * "SOURCES · PROVISIONAL REVIEW" card head: gap 2, inset by the card's own
   * 16px horizontal padding, and NEVER wrapping, so the five Sources sub-tabs
   * stay on one line at 1440 the way the artboard draws them.
   */
  placement?: "page" | "card-head";
  /**
   * Tab semantics (additive, lane admin60 2026-09-08). "nav" (default) is a
   * <nav> of links/buttons. "tablist" renders role="tablist" / role="tab" /
   * aria-selected for a row that switches an in-page panel rather than a
   * route, which is what the Admin sub-nav has always been.
   */
  semantics?: "nav" | "tablist";
}

export function TabRow({ tabs, ariaLabel, placement = "page", semantics = "nav" }: TabRowProps) {
  const cardHead = placement === "card-head";
  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: cardHead ? 2 : 4,
    flexWrap: cardHead ? "nowrap" : "wrap",
    overflowX: cardHead ? "auto" : undefined,
    padding: cardHead ? "0 16px" : undefined,
    borderBottom: "1px solid var(--line-1)",
  };
  const body = renderTabs();
  if (semantics === "tablist") {
    return (
      <div role="tablist" aria-label={ariaLabel} style={rowStyle}>
        {body}
      </div>
    );
  }
  return (
    <nav aria-label={ariaLabel} style={rowStyle}>
      {body}
    </nav>
  );

  function renderTabs() {
    return (
      <>
      {tabs.map((t) => {
        const style: React.CSSProperties = {
          fontFamily: "inherit",
          fontSize: "var(--fs-125)",
          fontWeight: t.active ? 700 : 600,
          padding: "9px 12px",
          whiteSpace: "nowrap",
          border: "none",
          borderBottom: t.active ? "2px solid var(--brand)" : "2px solid transparent",
          marginBottom: -1,
          background: "transparent",
          color: t.active ? "var(--ink)" : "var(--ink-2)",
          textDecoration: "none",
          cursor: t.href || t.onClick ? "pointer" : "default",
        };
        if (t.href) {
          return (
            <Link key={t.key} href={t.href} prefetch={false} aria-current={t.active ? "page" : undefined} style={style}>
              {t.label}
            </Link>
          );
        }
        return (
          <button
            key={t.key}
            type="button"
            role={semantics === "tablist" ? "tab" : undefined}
            aria-selected={semantics === "tablist" ? !!t.active : undefined}
            aria-current={semantics === "tablist" ? undefined : t.active ? "page" : undefined}
            onClick={t.onClick}
            style={style}
          >
            {t.label}
          </button>
        );
      })}
      </>
    );
  }
}
