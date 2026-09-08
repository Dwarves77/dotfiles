// forward-event-format.mjs — precision-honest date formatting for item_forward_events (flywheel U9,
// UpcomingObligationsPanel). PURE, no DB, no LLM.
//
// Same reason theme-stats.mjs exists as its own module rather than inline in a component: there is no
// vitest/jest/tsx test runner anywhere in this repo (verified there — zero *.test.tsx files, `node
// --test` on *.mjs only). Rather than let the one piece of real logic in UpcomingObligationsPanel.tsx
// go unproven (a cited-but-unrun "proof" rule 15 forbids), it is pulled into a module that joins the
// src/lib/connections/*.test.mjs glob like theme-stats.mjs/cluster.mjs/gaps.mjs. The component imports
// this function rather than re-implementing it.
//
// PRECISION-HONESTY, THE WHOLE POINT: migration 274's own column comment — "A 'year' row's January 1st
// is a normalization artifact, not a claim the source made about January 1st." event_date is always a
// real calendar date (the extractor normalizes a bare year to YYYY-01-01, a month+year to YYYY-MM-01),
// so date_precision is the ONLY thing that stops this function rendering a fabricated day/month the
// source never stated.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Render an item_forward_events row's date, honoring its precision.
 * @param {string} eventDate - 'YYYY-MM-DD' (Postgres date column)
 * @param {'day'|'month'|'year'} precision
 * @returns {string} 'year' -> "2026"; 'month' -> "December 2026"; 'day' -> "December 31, 2026"
 */
export function formatEventDate(eventDate, precision) {
  // Parse the 'YYYY-MM-DD' parts directly rather than `new Date(eventDate)` + a locale formatter —
  // that path applies the VIEWER'S timezone and can roll a UTC midnight date back a calendar day, a
  // defect independent of (but easily confused with) the precision-honesty this function guarantees.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(eventDate || ""));
  if (!m) return String(eventDate || ""); // malformed input — show verbatim, never guess
  const [, year, month, day] = m;
  const monthName = MONTH_NAMES[parseInt(month, 10) - 1] ?? month;
  if (precision === "year") return year;
  if (precision === "month") return `${monthName} ${year}`;
  return `${monthName} ${parseInt(day, 10)}, ${year}`;
}

/**
 * The SAME precision-honest rendering in the compact form the artboard's rail cards draw in a 48px
 * date column: artboard 02/id="p2" "OBLIGATIONS · NEXT 30 DAYS" writes "Sep 25 2026", not
 * "September 25, 2026". Added here (rather than as a second date formatter inside a component) so
 * this module stays the ONE holder of precision honesty: a 'month' row still refuses to name a day
 * and a 'year' row still refuses to name a month, exactly as formatEventDate does.
 * @param {string} eventDate - 'YYYY-MM-DD'
 * @param {'day'|'month'|'year'} precision
 * @returns {string} 'year' -> "2026"; 'month' -> "Sep 2026"; 'day' -> "Sep 25 2026"
 */
export function formatEventDateCompact(eventDate, precision) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(eventDate || ""));
  if (!m) return String(eventDate || ""); // malformed input — show verbatim, never guess
  const [, year, month, day] = m;
  const monthName = (MONTH_NAMES[parseInt(month, 10) - 1] ?? month).slice(0, 3);
  if (precision === "year") return year;
  if (precision === "month") return `${monthName} ${year}`;
  return `${monthName} ${parseInt(day, 10)} ${year}`;
}
