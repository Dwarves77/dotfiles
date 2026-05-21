// Shared relative-time formatter for "X minutes ago", "Y hours ago", etc.
// Extracted 2026-05-21 so both the credibility RecencyChip (when Build 8 mounts
// it) and the /regulations masthead "last sync" indicator share one
// implementation. Add new consumers here, don't reinline.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelative(ts: Date): string {
  const diff = Date.now() - ts.getTime();

  if (diff < 0) {
    // future timestamp, show absolute upcoming distance
    const abs = Math.abs(diff);
    if (abs < HOUR) return `in ${Math.max(1, Math.round(abs / MIN))} min`;
    if (abs < DAY) return `in ${Math.round(abs / HOUR)} hr`;
    if (abs < WEEK) return `in ${Math.round(abs / DAY)} days`;
    if (abs < MONTH) return `in ${Math.round(abs / WEEK)} weeks`;
    if (abs < YEAR) return `in ${Math.round(abs / MONTH)} months`;
    return `in ${Math.round(abs / YEAR)} years`;
  }

  if (diff < MIN) return "just now";
  if (diff < HOUR) {
    const m = Math.max(1, Math.round(diff / MIN));
    return `${m} min ago`;
  }
  if (diff < DAY) {
    const h = Math.round(diff / HOUR);
    return `${h} hr ago`;
  }
  if (diff < WEEK) {
    const d = Math.round(diff / DAY);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (diff < MONTH) {
    const w = Math.round(diff / WEEK);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (diff < YEAR) {
    const mo = Math.round(diff / MONTH);
    return `${mo} month${mo === 1 ? "" : "s"} ago`;
  }
  const y = Math.round(diff / YEAR);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

// Convert a string or Date to a Date; returns null for invalid input.
export function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}
