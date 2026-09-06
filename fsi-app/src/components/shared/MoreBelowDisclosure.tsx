/**
 * MoreBelowDisclosure — the ONE "N more below" overflow control (P3 fix, 2026-09-06).
 *
 * BUG (operator, 2026-09-06): "the '6 MORE BELOW' label in the Dashboard and Market Intel
 * headers is non-functional (shared component bug)." Root cause [CONFIRMED] by reading:
 * `ChangedSinceStrip.tsx` (Dashboard, MAX_ROWS=6) and `MarketComparativeRibbon.tsx` (Market
 * Intel, MAX_METRICS=10) each independently hard-coded a slice-and-count pattern — render the
 * first N rows, then print a plain `<div>`/`<span>` reading "+K more" / "K more below" with no
 * href, no onClick, nothing behind it. The label describes hidden content it never lets the
 * reader reach: two copies of the same dead-end pattern (CLAUDE.md: "no copies of logic").
 *
 * Fix at the cause, not the symptom: ONE shared disclosure both call sites import. It renders as
 * a native `<details>/<summary>` — functional with zero client JS (both call sites are Server
 * Components; a "use client" widget would force one of them client-side for no reason) — so the
 * count label IS the control: activating it reveals the actual hidden rows, passed as children,
 * in place. `<details>` is natively a 44px+ tappable region when given block padding, satisfying
 * the 44px target law without a client-side hit-area hack.
 */

import type { ReactNode } from "react";

export function MoreBelowDisclosure({
  count,
  itemNoun = "more",
  children,
}: {
  /** Hidden-row count. Renders nothing (not even a placeholder) when 0 — see ux-laws honest-state rule. */
  count: number;
  /** e.g. "more series", "more items" — defaults to "more". */
  itemNoun?: string;
  /** The hidden rows themselves. Rendered inside the disclosure body, revealed on activation. */
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <details className="cl-more-below" style={{ marginTop: 10 }}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-primary, #1a5fb4)",
        }}
      >
        {count} {itemNoun} below
      </summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}
