"use client";

/**
 * TypesetSection — non-card grouping primitive used by the rail widgets
 * (Watchlist, By Owner) and by the Housekeeping body widgets (Coverage
 * gaps, Awaiting review). Body widgets wrap the rendered shell in
 * `.cl-hk-card` for the white-surface card chrome; rail widgets render
 * the typeset shell as-is for muted typography on the page surface.
 *
 * Wiring matches dashboard-sidebar-spec.html. CSS in
 * src/app/globals.css under the "Dashboard sidebar widgets" block:
 *   - .cl-typeset, .cl-typeset-eyebrow, .cl-typeset-h, .count, .cl-typeset-deck
 *   - .cl-typeset-list, .cl-typeset-foot
 */

import type { ReactNode } from "react";

export interface TypesetSectionProps {
  /** 9px / 800 / 0.18em / muted, sits above the headline. */
  eyebrow: string;
  /** Anton 20px headline. */
  title: string;
  /** Optional sans count rendered on its own line under the headline (e.g. "3 of 14"). */
  count?: string;
  /** Optional 12px / text-2 deck paragraph below the headline. */
  deck?: string;
  /** Optional footer slot — usually a "View all →" link. */
  footer?: ReactNode;
  /** Body slot — the widget's list / content. */
  children: ReactNode;
  /** Optional id for in-page anchors. */
  id?: string;
}

export function TypesetSection({
  eyebrow,
  title,
  count,
  deck,
  footer,
  children,
  id,
}: TypesetSectionProps) {
  return (
    <section className="cl-typeset" id={id}>
      <div className="cl-typeset-eyebrow">{eyebrow}</div>
      <h3 className="cl-typeset-h">
        <span>{title}</span>
        {count && <span className="count">{count}</span>}
      </h3>
      {deck && <p className="cl-typeset-deck">{deck}</p>}
      {children}
      {footer && <div className="cl-typeset-foot">{footer}</div>}
    </section>
  );
}
