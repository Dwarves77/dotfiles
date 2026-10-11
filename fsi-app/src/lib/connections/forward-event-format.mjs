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
