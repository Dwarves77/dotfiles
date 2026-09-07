"use client";

/**
 * SectionRule — the one section/panel top rule (operator audit items 5.1 +
 * 4.1, 2026-09-07 CLOSED rulings, artboard 18): a 3px graduated rule ABOVE
 * every section/panel card sitewide, full card width, top edge, no radius
 * on the rule itself, and NO divider below the section title. Value:
 * `linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))` — the
 * dark grey gradation, same family as `--brand` (#5A5552).
 *
 * This is deliberately NOT `BandGradientRule` (the band-proportion rule):
 * ruling 5.2 (2026-09-07) restricts the coloured band rule to exactly
 * three places sitewide (the nav card cap, the 56px mobile top bar, the
 * drawer — see BandGradientRule.tsx's own header) and puts this dark grey
 * gradation everywhere else a 3px rule appears on a masthead, panel,
 * section card, or detail header. One coloured rule per screen; every
 * other 3px rule is this one.
 *
 * Root-fixed here in the shared `ui/` layer so every section/panel card
 * can mount ONE rule rather than each page reimplementing the gradient —
 * consumed so far by `DashboardBrief.tsx`'s `Card` (this lane's write
 * set); rolling it onto DetailShell/ListSurfaceShell/admin/community panel
 * wrappers is later-lane scope (those files are outside this lane's write
 * set) — logged in docs/design/handoff-2026-09-06/DEVIATION-LOG.md.
 */

export const SECTION_RULE_GRADIENT =
  "linear-gradient(90deg,#5A5552,#5A5552 22%,rgba(90,85,82,.18))";

export function SectionRule() {
  return (
    <div
      aria-hidden="true"
      className="cl-section-rule"
      style={{ height: 3, flexShrink: 0, background: SECTION_RULE_GRADIENT }}
    />
  );
}
