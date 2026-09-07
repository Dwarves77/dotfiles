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
 * mounted. Active = bold ink; resting = ink-2. One hairline under the
 * whole row (`--line-2`), no per-tab underline — matches the artboards,
 * which show only weight/colour distinguishing the active tab.
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
}

export function TabRow({ tabs, ariaLabel }: TabRowProps) {
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      {tabs.map((t) => {
        const style: React.CSSProperties = {
          fontFamily: "inherit",
          fontSize: "var(--fs-13)",
          fontWeight: t.active ? 800 : 600,
          padding: "12px 14px",
          whiteSpace: "nowrap",
          border: "none",
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
          <button key={t.key} type="button" aria-current={t.active ? "page" : undefined} onClick={t.onClick} style={style}>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
