import { formatLocaleDate } from "../../lib/format.ts";

/** Nearest-upcoming-milestone chip: "Sep 25". Null in, null out (never renders a chip with nothing to say). */
export function formatMilestoneChip(d: Date | null): string | null {
  if (!d) return null;
  return formatLocaleDate(d, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** RegulationDetailSurface's year-only byline date: "2026". */
export function formatYearOnly(d: Date): string {
  return formatLocaleDate(d, { year: "numeric", timeZone: "UTC" });
}

/** RegulationDetailSurface's full byline date: "Sep 25, 2026". */
export function formatShortDate(d: Date): string {
  return formatLocaleDate(d, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Month+day, no year: "Sep 25" — MarketSignalDetailSurface's own chart-axis/short date shape.
 *  RECONCILE (2026-09-04, item 4b-ii): that file's own `shortDate` previously called
 *  `.toLocaleDateString("en-US", { month: "short", day: "numeric" })` with NO `timeZone` pin — a live,
 *  undiagnosed instance of the SAME HYDRATION-418 defect class this module exists to fix (identical
 *  shape to formatMilestoneChip above, just never named/fixed for Market before this sweep found it by
 *  routing every repo `.toLocaleDateString` call through one shared home). */
export function formatMonthDay(d: Date): string {
  return formatLocaleDate(d, { month: "short", day: "numeric", timeZone: "UTC" });
}
