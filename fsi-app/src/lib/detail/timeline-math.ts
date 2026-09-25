/**
 * timeline-math, pure date/collapse logic for the ActionCard TIMELINE part
 * (lane W10-ActionCard-a, 2026-09-21, operator review item 3). Split into
 * its own plain .ts module (no JSX) so `timeline-math.test.mjs` can import
 * it directly under bare `node --test` (same convention as
 * `milestone-timeline-classify.ts`, `format-fixed-date.ts`).
 *
 * F36 (date-format-timezone-pin): this module never calls
 * `toLocaleDateString`/`toLocaleTimeString`/`Intl.DateTimeFormat`, dates
 * are formatted with a hand-rolled month table (same approach as
 * `src/lib/format.ts`'s `formatDate`), so there is no locale/timezone call
 * for F36 to gate. A `YYYY-MM-DD` string is parsed as its own calendar
 * date components, never through `new Date(iso)` (which would parse as UTC
 * midnight and could shift a day under a naive local-timezone read).
 */

import type { TimelineEntry } from "@/types/resource";
// Relative path + explicit .ts extension (not the `@/` alias): this module's own
// timeline-math.test.mjs imports it directly under bare `node --test`, with no bundler to resolve
// the tsconfig path alias (same convention as requirement-trajectory-classify.ts /
// format-fixed-date.ts). milestone-timeline-classify.ts's own only import is `import type`
// (erased, no runtime resolution needed), so this stays portable through the whole graph.
import { classifyTimelineEntries, type TimelineDotState } from "../../components/ui/milestone-timeline-classify.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Sep 2026", the EXPOSURE NEXT MILESTONE cell's date shape (review item 2). Day-month-year,
 *  matching the review's own worked example verbatim ("Transition deadline . 29 Sep 2026 . in 8
 *  days"), distinct from `formatDate`'s "Sep 29, 2026" (month-first, used elsewhere in the app). */
export function formatDayMonthYear(iso: string): string {
  const parts = iso.split(/[-T]/);
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parts[2] ? parseInt(parts[2], 10) : undefined;
  if (Number.isNaN(year) || Number.isNaN(month) || !MONTHS[month]) return iso;
  return day ? `${day} ${MONTHS[month]} ${year}` : `${MONTHS[month]} ${year}`;
}

/** Calendar-date subtraction, immune to time-of-day/TZ drift: parses both `YYYY-MM-DD` strings as
 *  UTC-midnight instants (the one safe way to diff two date-only values) rather than relying on the
 *  caller's local clock. `from` defaults to "now" truncated to a UTC calendar day. */
export function daysBetween(targetIso: string, fromIso?: string): number {
  const toUtcMidnight = (iso: string) => {
    const [y, m, d] = iso.split(/[-T]/).map((s) => parseInt(s, 10));
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  const fromMs = fromIso ? toUtcMidnight(fromIso) : (() => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();
  const targetMs = toUtcMidnight(targetIso);
  return Math.round((targetMs - fromMs) / 86400000);
}

/** "in 8 days" / "today" / "1 day ago", the callout's day-count phrase. */
export function daysPhrase(days: number): string {
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  const past = Math.abs(days);
  return `${past} day${past === 1 ? "" : "s"} ago`;
}

export interface ClassifiedMilestone {
  entry: TimelineEntry;
  state: TimelineDotState;
  index: number;
}

/** Full classified list (never collapsed), the source both the header counts and the collapse
 *  rule read from, so they can never disagree about which entry is "next". */
export function classifyMilestones(entries: TimelineEntry[]): ClassifiedMilestone[] {
  return classifyTimelineEntries(entries).map((c, index) => ({ ...c, index }));
}

export interface TimelineHeaderCounts {
  total: number;
  passed: number;
  nextDate: string | null;
}

/** "N milestones . M passed . next <date>", computed from the FULL list, never the collapsed
 *  view (review item 3: the header states real counts regardless of the collapse rule below). */
export function timelineHeaderCounts(classified: ClassifiedMilestone[]): TimelineHeaderCounts {
  const passed = classified.filter((c) => c.state === "passed").length;
  const next = classified.find((c) => c.state === "next") ?? null;
  return { total: classified.length, passed, nextDate: next ? next.entry.date : null };
}

// Operator ruling (lane PARITY-PARTS, 2026-09-25), SUPERSEDES review item 3's original "more than
// eight collapses to the next-three" rule: "With more than 4, show the next 4 then '+N more'." The
// original 8/3 pair predates the timeline carrying obligation markers merged in from the removed
// UpcomingObligationsStrip (mergeObligationEvents below); a busier marker set is now the norm, not
// the exception, so the tighter 4/4 window is the current, binding rule.
const COLLAPSE_THRESHOLD = 4;
const COLLAPSE_SHOW = 4;

export interface CollapsedTimeline {
  visible: ClassifiedMilestone[];
  hiddenCount: number;
  collapsed: boolean;
}

/** At COLLAPSE_THRESHOLD (4) or fewer, every milestone renders. Above 4, the visible set is the
 *  "next" milestone plus the three immediately following it (the reader's actual forward-looking
 *  window); when no "next" is classified (every milestone already passed), the trailing four
 *  (the most recently passed) are shown instead, since that is the same "closest to the reader's
 *  present" window on the other side of the track. `hiddenCount` is what the "+N more" chip renders,
 *  as a link to the obligations-register section when the caller (Timeline's `moreMarkersHref`)
 *  supplies one. */
export function collapseTimeline(classified: ClassifiedMilestone[]): CollapsedTimeline {
  if (classified.length <= COLLAPSE_THRESHOLD) {
    return { visible: classified, hiddenCount: 0, collapsed: false };
  }
  const nextIndex = classified.findIndex((c) => c.state === "next");
  let start: number;
  if (nextIndex >= 0) {
    start = nextIndex;
  } else {
    start = Math.max(0, classified.length - COLLAPSE_SHOW);
  }
  const end = Math.min(classified.length, start + COLLAPSE_SHOW);
  const visible = classified.slice(start, end);
  return { visible, hiddenCount: classified.length - visible.length, collapsed: true };
}

/** The NEXT MILESTONE exposure cell's compact clause: "Transition deadline . 29 Sep 2026 . in 8
 *  days" (review item 2). Null when no "next" milestone is classified (nothing upcoming, the
 *  EXPOSURE cell then renders the Absence convention, decided by the caller). */
export function nextMilestoneClause(classified: ClassifiedMilestone[]): string | null {
  const next = classified.find((c) => c.state === "next");
  if (!next) return null;
  const days = daysBetween(next.entry.date);
  return `${next.entry.label} · ${formatDayMonthYear(next.entry.date)} · ${daysPhrase(days)}`;
}

/** An item_forward_events row shape ("upcoming obligation"), minimal - only the three fields this
 *  merge needs, so this module stays decoupled from the full UpcomingEvent type (read-upcoming.mjs /
 *  UpcomingObligationsStripView.tsx). */
export interface ObligationEventLike {
  event_date: string;
  event_kind: string;
}

/**
 * Operator ruling (lane PARITY-PARTS, 2026-09-25): "Upcoming-obligations strip: remove it as a
 * separate element. Show each obligation in the timeline instead." Merges item_forward_events rows
 * (the SAME data the removed strip read) into the item_timelines-derived `timeline` array, ONE
 * marker per obligation, so TimelineDot's existing date-above/label-below rendering is reused
 * unchanged rather than building a second marker shape.
 *
 * `date` is kept as the RAW `event_date` ('YYYY-MM-DD'), matching the existing convention every
 * `timeline` entry already uses (item_timelines' own `milestone_date` reaches this module unformatted
 * too - TimelineDot renders `entry.date` verbatim, and `daysBetween`/`formatDayMonthYear` both parse
 * it as raw ISO). Reformatting only the merged entries here would make them display-inconsistent
 * with the milestones already on the track AND break `daysBetween` the moment a merged entry becomes
 * classified "next" - so this stays consistent with the pre-existing (unformatted-display) contract
 * rather than introducing a second one. `label` is the SHORT `kindLabels[event_kind]` name (never
 * the long `obligation_text` prose the strip showed - that stays reachable from the item's own
 * Obligation Register row, not duplicated onto a ~60px dot label).
 *
 * A forward event landing on the exact same calendar date as an existing timeline entry (either an
 * item_timelines milestone or another forward event already merged) is dropped: the earlier entry
 * already carries that date, so a second identical-date dot would be visual noise, not new
 * information. Order is preserved (existing `timeline` entries first, in their given order, then
 * surviving forward events in their given order) - `classifyMilestones`/`collapseTimeline` rely on
 * array order for "next", so this function does not itself sort by date.
 */
export function mergeObligationEvents(
  timeline: TimelineEntry[],
  events: ObligationEventLike[],
  kindLabels: Record<string, string>,
): TimelineEntry[] {
  const seenDates = new Set(timeline.map((t) => t.date));
  const merged = [...timeline];
  for (const ev of events) {
    if (!ev.event_date || seenDates.has(ev.event_date)) continue;
    seenDates.add(ev.event_date);
    merged.push({ date: ev.event_date, label: kindLabels[ev.event_kind] ?? ev.event_kind });
  }
  return merged;
}
