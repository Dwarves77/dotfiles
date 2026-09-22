"use client";

/**
 * Timeline (`data-part="timeline"`), the ActionCard TIMELINE block (lane W10-ActionCard-a,
 * 2026-09-21, operator review item 3, panels 21a/21b + artboard 3). NOT a redesign of
 * `MilestoneTimeline.tsx` (the row-width dot strip `ListRow`/ledgers already consume, untouched)
 * and NOT an edit to `DetailShell.tsx`'s existing `DetailTimeline` (a forbidden-adjacent shared
 * file this lane does not wire into the live regulation surface, Part B's job). This is the new,
 * fixed, self-contained composite: header count line, a labelled dot track, and the
 * next-obligation callout, all as ONE part.
 *
 * Review item 3, exactly:
 *   - Each milestone: date ABOVE the track, LABEL below it, 10.5px, ellipsised to the segment
 *     width; the full label is reachable on hover (title) AND by keyboard focus (a focusable
 *     element carrying the same text, per ux-laws law 2/8, a label a mouse user can see but a
 *     keyboard user cannot reach is not accessible).
 *   - Dot states reuse the ONE classifier (`classifyTimelineEntries`, milestone-timeline-classify.ts)
 *     so this view and the row-strip view can never disagree: passed = filled green; next = larger
 *     dot in the band colour with a ring; ahead = hollow.
 *   - Track green to today (the "next" dot's own position), grey beyond.
 *   - Header right: "N milestones . M passed . next <date>".
 *   - Below the track: the callout, the existing StateNote part in the item's band tint:
 *     "Next: <label> . <date> . in N days", with "Full schedule" and a down arrow.
 *   - 7 dates on one line at 1440 is fine; more than 8 collapses to the next-three plus "+N"
 *     (pure logic in timeline-math.ts, tested there).
 *
 * Date math is pure (`@/lib/detail/timeline-math`, tested in timeline-math.test.mjs) and never
 * calls `toLocaleDateString`/`Intl.DateTimeFormat` (F36), dates are hand-formatted from parsed
 * `YYYY-MM-DD` components, so there is no locale/timezone call for F36 to gate in the first place.
 */

import type { TimelineEntry } from "@/types/resource";
import type { UrgencyBand } from "@/lib/urgency/bands";
import { StateNote } from "@/components/ui/StateNote";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { pluralize } from "@/lib/format";
import { passedDotStyle, nextDotStyle, aheadDotStyle, timelineTrackStyle } from "@/components/ui/timeline-dot-styles";
import {
  classifyMilestones,
  timelineHeaderCounts,
  collapseTimeline,
  nextMilestoneClause,
  formatDayMonthYear,
  type ClassifiedMilestone,
} from "@/lib/detail/timeline-math";

export interface TimelineProps {
  entries?: TimelineEntry[] | null;
  band: UrgencyBand;
  /** "Full schedule" callout link target. Omitted renders the callout with no link (fixture-safe). */
  onFullSchedule?: () => void;
  fullScheduleHref?: string;
}

export function Timeline({ entries, band, onFullSchedule, fullScheduleHref }: TimelineProps) {
  const list = entries ?? [];
  if (list.length === 0) {
    return (
      <div data-part="timeline">
        <TimelineHeader total={0} passed={0} nextDate={null} />
        <span
          className="cl-timeline-empty"
          aria-hidden="true"
          style={{ display: "block", height: 1, background: "rgba(0,0,0,.12)", marginTop: 10 }}
        />
      </div>
    );
  }

  const classified = classifyMilestones(list);
  const counts = timelineHeaderCounts(classified);
  const { visible, hiddenCount, collapsed } = collapseTimeline(classified);
  const clause = nextMilestoneClause(classified);

  // Track fill: green from the left edge to the "next" dot's own position within the VISIBLE set
  // (review item 3's own track rule, applied to whichever window is on screen, collapsed or not).
  const visibleNextIndex = visible.findIndex((c) => c.state === "next");
  const allPassedVisible = visible.every((c) => c.state === "passed");
  const greenPercent =
    visibleNextIndex >= 0
      ? visible.length > 1
        ? (visibleNextIndex / (visible.length - 1)) * 100
        : 0
      : allPassedVisible
      ? 100
      : 0;

  return (
    <div data-part="timeline">
      <TimelineHeader total={counts.total} passed={counts.passed} nextDate={counts.nextDate} />
      <div style={{ position: "relative", padding: "22px 0 4px" }}>
        <span aria-hidden="true" style={timelineTrackStyle(greenPercent)} />
        <div
          role="img"
          aria-label={`Milestone timeline: ${counts.total} milestones, ${counts.passed} passed`}
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", position: "relative" }}
        >
          {visible.map((c) => (
            <TimelineDot key={c.index} classified={c} band={band} segments={visible.length} />
          ))}
        </div>
        {collapsed && hiddenCount > 0 && (
          <span
            style={{
              display: "block",
              marginTop: 6,
              fontSize: "var(--fs-105)",
              fontWeight: 700,
              color: "var(--ink-3)",
              textAlign: "right",
            }}
          >
            +{hiddenCount} more
          </span>
        )}
      </div>
      {clause && (
        <div style={{ marginTop: 10 }}>
          <StateNote
            band={band}
            action={
              onFullSchedule
                ? { label: "Full schedule ↓", onClick: onFullSchedule }
                : fullScheduleHref
                ? { label: "Full schedule ↓", href: fullScheduleHref }
                : undefined
            }
          >
            Next: {clause}
          </StateNote>
        </div>
      )}
      {!clause && counts.total > 0 && (
        <div style={{ marginTop: 10 }}>
          <StateNote band={band}>
            Last milestone passed {"·"} {formatDayMonthYear(list[list.length - 1].date)} {"·"} obligations are current, no further step scheduled
          </StateNote>
        </div>
      )}
    </div>
  );
}

function TimelineHeader({ total, passed, nextDate }: { total: number; passed: number; nextDate: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <SectionLabel>Timeline</SectionLabel>
      <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>
        {total} {pluralize(total, "milestone")} {"·"} {passed} passed
        {nextDate ? ` · next ${formatDayMonthYear(nextDate)}` : ""}
      </span>
    </div>
  );
}

/** One dot: date above, label below, ellipsised to its own segment width; the full label is on
 *  `title` (hover, mouse) AND on a zero-width focusable span carrying the same text as its
 *  accessible name (keyboard focus), law 2/8 (ux-laws.md): a hover-only affordance is not
 *  reachable by keyboard. */
function TimelineDot({ classified, band, segments }: { classified: ClassifiedMilestone; band: UrgencyBand; segments: number }) {
  const { entry, state } = classified;
  const dot =
    state === "passed" ? (
      <span aria-hidden="true" style={passedDotStyle(8)} />
    ) : state === "next" ? (
      <span aria-hidden="true" style={nextDotStyle(band.cssVar, 12, 3)} />
    ) : (
      <span aria-hidden="true" style={aheadDotStyle(8)} />
    );

  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
        flex: segments > 1 ? "1 1 0" : "0 0 auto",
        maxWidth: `${Math.max(60, Math.floor(100 / segments))}%`,
        position: "relative",
      }}
    >
      <span
        style={{
          fontSize: "var(--fs-105)",
          color: "var(--ink-3)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
      >
        {entry.date}
      </span>
      {dot}
      {/* Focusable duplicate of the title text (visually hidden, but in the tab order) so a
          keyboard user reaches the same full label a mouse user gets from `title` on hover. */}
      <span
        tabIndex={0}
        title={entry.label}
        aria-label={entry.label}
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: state === "next" ? 700 : 400,
          color: "var(--ink)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          textAlign: "center",
        }}
      >
        {entry.label}
      </span>
    </span>
  );
}
