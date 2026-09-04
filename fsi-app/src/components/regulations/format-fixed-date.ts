// format-fixed-date.ts — HYDRATION-418 (2026-09-04): the one home for "format a Date as a short
// human string" on the regulations surface's CLIENT components.
//
// THE DEFECT THIS FIXES [CONFIRMED, reproduced with `TZ=<zone> node -e`]: `Date.prototype.toLocaleDateString`
// with no `timeZone` option uses the RUNTIME's local timezone. RegulationsLedger.tsx ("use client") is a
// hydrated component: React renders it once on the SERVER (a Vercel Lambda, UTC — no TZ env var set,
// confirmed against vercel.json/next.config.ts) and once more on the CLIENT (the viewer's browser, whatever
// local zone) during hydration, and diffs the two text outputs. A milestone date stored as a date-only
// column ("2026-09-25") parses via `new Date(...)` as UTC midnight; formatted with no `timeZone` that is
// "Sep 25" on the UTC server and "Sep 24" for any viewer west of UTC (reproduced: `TZ=America/New_York node
// -e 'new Date("2026-09-25").toLocaleDateString("en-US",{month:"short",day:"numeric"})'` → "Sep 24") — a
// genuine server/client text mismatch, exactly React's minified error #418 ("hydration mismatch, args
// HTML"). Pinning `timeZone: "UTC"` makes both passes agree (verified the same way: both render "Sep 25").
//
// THIS IS A DIFFERENT DEFECT FROM THE ONE `WhatChanged.tsx`'s 2026-07-13 diagnosis fixed (that one was a
// clock-skew race — `formatRelative(Date.now())` computed at two different WALL-CLOCK MOMENTS, fixed by
// deferring the relative-time text to a post-mount `useEffect`). This one is a TIMEZONE defect on a FIXED
// input date — no amount of deferring to `useEffect` would fix it (the string would still differ, just
// after a flash instead of at hydration); the only fix is pinning the zone so both environments compute the
// same string from the same instant.
//
// "en-US" / UTC is the established convention already in this codebase for exactly this class of call —
// see `src/components/home/DashboardTopPriority.tsx`, `src/components/profile/UserProfilePage.tsx`, and
// `src/components/profile/OrganizationPanel.tsx`, all of which already pass `timeZone: "UTC"` to the same
// API. This file gives regulations' own two call sites (RegulationsLedger's row milestone chip,
// RegulationDetailSurface's two byline dates) ONE testable home instead of three independent inline calls,
// so a `node --test` proof can pin the behavior without mounting React.

/** Nearest-upcoming-milestone chip: "Sep 25". Null in, null out (never renders a chip with nothing to say). */
export function formatMilestoneChip(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** RegulationDetailSurface's year-only byline date: "2026". */
export function formatYearOnly(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
}

/** RegulationDetailSurface's full byline date: "Sep 25, 2026". */
export function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
