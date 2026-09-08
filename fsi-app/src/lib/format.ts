/** Format an ISO date string to human-readable form. THE one home (C6 consolidation, 2026-07-12).
 *  Output is US month-first ("Jun 5, 2024") — the MAJORITY/LIVE behavior all customer surfaces already
 *  rendered via local copies (behavior-preserving consolidation; this export was previously dead + day-first).
 *  US-vs-day-first-vs-locale-aware is a DEFERRED product decision (owner Jason, no dwell) — changeable HERE,
 *  in one place. String-parsed (not `new Date(iso)`) so a YYYY-MM-DD never TZ-shifts off by a day. */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Handle YYYY-MM, YYYY-MM-DD, or full ISO
  const parts = iso.split(/[-T]/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day = parts[2] ? parseInt(parts[2]) : undefined;

  if (isNaN(year) || isNaN(month)) return iso;

  if (day) {
    return `${months[month]} ${day}, ${year}`;
  }
  return `${months[month]} ${year}`;
}

/** Format a date for timeline display — shorter form */
export function formatTimelineDate(iso: string): string {
  return formatDate(iso);
}

/** Get quarter from date */
export function getQuarter(iso: string): { year: number; quarter: number; label: string } {
  const parts = iso.split(/[-T]/);
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);

  // Q1 = Jan-Mar (1-3), Q2 = Apr-Jun (4-6), Q3 = Jul-Sep (7-9), Q4 = Oct-Dec (10-12)
  const quarter = Math.ceil(month / 3);

  return { year, quarter, label: `${year} Q${quarter}` };
}

// ── RECONCILE (2026-09-04, item 4b-ii): THE one home for Intl-locale-dependent formatting ──────────
//
// Extends this file's own C6 consolidation precedent (2026-07-12, this file's own header: "THE one
// home") to the OTHER unpinned-locale hazard this reconciliation's dispatch named: repo-wide direct
// `.toLocaleString()` / `.toLocaleDateString()` calls, each supplying its OWN locale argument (in
// practice always "en-US" or `undefined`) independently, at ~70 call sites across ~40 files
// [CONFIRMED, grep, 2026-09-04]. `undefined` resolves to the JS runtime's OWN default locale — on a
// server this is the container's configured locale (commonly, but not guaranteed, "en-US"); on a
// client it is the visiting BROWSER's own `navigator.language`. A server component (or a "use client"
// component whose FIRST render is the SSR/hydration pass) that calls `.toLocaleDateString()` or
// `.toLocaleString()` with no locale argument is therefore not merely inconsistent styling — it is
// the SAME class of SSR/CSR mismatch HYDRATION-418 (format-fixed-date.ts) fixed for one call site by
// pinning `timeZone`, generalized to the SIBLING axis (locale) this file's own bare `.toLocaleString()`
// calls were still exposed to, repo-wide, before this pass.
//
// FIXED_LOCALE, not the caller's own choice: every call site audited (this lane's own grep, 2026-09-04)
// already passed "en-US", `undefined`, or nothing — never a second, deliberately-different locale — so
// pinning one shared constant here is a behavior-PRESERVING consolidation for every real caller today
// (identical to formatDate's own "majority/live behavior" framing above), not a new product decision.
// Changeable HERE, in one place, exactly like formatDate's own header states for its date-shape choice.
export const FIXED_LOCALE = "en-US";

/** Number formatting (counts, figures) pinned to FIXED_LOCALE — replaces a bare
 *  `value.toLocaleString(...)` (unpinned or explicitly "en-US") repo-wide. `options` passes through to
 *  `Intl.NumberFormat` unchanged (e.g. `{ maximumFractionDigits: 1 }`) — only the locale is pinned. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(FIXED_LOCALE, options);
}

/** Date-only formatting (no time-of-day) pinned to FIXED_LOCALE — replaces a bare
 *  `date.toLocaleDateString(...)` repo-wide. `options` passes through to `Intl.DateTimeFormat`
 *  unchanged, INCLUDING `timeZone` when the caller already pinned one (format-fixed-date.ts's own
 *  UTC-pinned helpers are unaffected by this consolidation, and remain the dedicated home for
 *  Regulations' own fixed-date chips) — this function pins locale only, matching FIXED_LOCALE's own
 *  header for why that is the ONE axis this pass changes, not a broader per-site timezone audit. */
export function formatLocaleDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(FIXED_LOCALE, options);
}

/** Date+time formatting pinned to FIXED_LOCALE — replaces a bare `date.toLocaleString(...)` repo-wide
 *  (almost every audited call site used this for a full timestamp — "regenerated Jun 5, 2024, 3:04 PM"
 *  — never a plain number; `Date.prototype.toLocaleString` and `Number.prototype.toLocaleString` share
 *  a method name but not a call site in this codebase, per this lane's own grep). Same locale-only-pin
 *  contract as formatLocaleDate above. */
export function formatLocaleDateTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString(FIXED_LOCALE, options);
}

// ── COUNTS-61 (2026-09-08): the one home for "a noun agreeing with its number" ──────────────────
//
// WHY: the click-through audit of production (2026-09-08) found the dashboard rail printing
// "1 regional rooms" — a plural noun against a count of one. That was not the only such site: the
// codebase carries ~40 hand-written `${n === 1 ? "" : "s"}` ternaries, each an independent chance
// to forget one, and the one that was forgotten shipped. These two helpers are that ternary with a
// name, so a new count line agrees with its number by construction instead of by remembering.
//
// English regular plural only, by design: an irregular noun passes its own plural explicitly
// (`pluralize(n, "jurisdiction")`, `pluralize(n, "analysis", "analyses")`). Nothing here guesses.

/** The noun in the form that agrees with `count`. `plural` defaults to `singular + "s"`. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return Math.abs(count) === 1 ? singular : plural ?? `${singular}s`;
}

/** "1 room" / "7 rooms" — the count (thousands-separated, per formatNumber) and its agreeing noun. */
export function countNoun(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${pluralize(count, singular, plural)}`;
}
