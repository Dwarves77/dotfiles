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
 * NARROW FORM (lane DFIX-1, 2026-10-08, design audit BUILD DEFECT, MOBILE 390 text spec "TIMELINE (vertical)"):
 * under 768 the wide block above is not drawn and a vertical stack takes its place (header, a 62px date gutter,
 * a 14px dot column over a 2px track, a 1fr label column per marker, then the same callout). Both blocks are in
 * the markup and one <style> decides which shows (no client media-query JS, so first paint is right at every
 * width; the same pattern ListRow uses). The vertical form had been built 2026-09-07 inside DetailTimeline and
 * went with it when PR 800 deleted that component, with nothing ruling the narrow form away. The marker window
 * (four, then "+N more") is the wide block's own, from collapseTimeline, so the two forms cannot disagree.
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
  /** Operator ruling (lane PARITY-PARTS, 2026-09-25): jump target for the "+N more" chip, when the
   *  marker set is collapsed. Omitted renders "+N more" as plain (non-interactive) text, unchanged
   *  from before this ruling. */
  moreMarkersHref?: string;
}

export function Timeline({ entries, band, onFullSchedule, fullScheduleHref, moreMarkersHref }: TimelineProps) {
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

  const callout = (
    <TimelineCallout
      clause={clause}
      counts={counts}
      lastDate={list[list.length - 1].date}
      band={band}
      onFullSchedule={onFullSchedule}
      fullScheduleHref={fullScheduleHref}
    />
  );

  return (
    <>
    <style>{TIMELINE_RESPONSIVE_CSS}</style>
    <div data-part="timeline" className="cl-timeline-wide">
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
        {collapsed && hiddenCount > 0 && (() => {
          // One element, one style object: `as` picks the tag (a link when moreMarkersHref is
          // supplied, plain text otherwise) rather than two near-identical JSX blocks (F45).
          const MoreTag = moreMarkersHref ? "a" : "span";
          return (
            <MoreTag
              href={moreMarkersHref}
              data-audit="timeline-more-markers"
              style={{
                display: "block",
                marginTop: 6,
                fontSize: "var(--fs-105)",
                fontWeight: 700,
                color: "var(--ink-3)",
                textAlign: "right",
                ...(moreMarkersHref ? { textDecoration: "underline", cursor: "pointer" } : {}),
              }}
            >
              +{hiddenCount} more
            </MoreTag>
          );
        })()}
      </div>
      {callout}
    </div>
    <div data-part="timeline-narrow" className="cl-timeline-narrow">
      <TimelineHeader total={counts.total} passed={counts.passed} nextDate={counts.nextDate} />
      <div className="cl-timeline-mobile" style={{ paddingTop: 12 }}>
        <VerticalMilestoneStack visible={visible} band={band} />
      </div>
      {collapsed && hiddenCount > 0 && (() => {
        const MoreTag = moreMarkersHref ? "a" : "span";
        return (
          <MoreTag
            href={moreMarkersHref}
            data-audit="timeline-more-markers-narrow"
            style={{
              display: "block",
              marginTop: 2,
              fontSize: "var(--fs-105)",
              fontWeight: 700,
              color: "var(--ink-3)",
              textAlign: "right",
              ...(moreMarkersHref ? { textDecoration: "underline", cursor: "pointer" } : {}),
            }}
          >
            +{hiddenCount} more
          </MoreTag>
        );
      })()}
      {callout}
    </div>
    </>
  );
}

/** Which of the two forms shows is CSS, not script: the wide block under 768 is not drawn and the narrow block is
 *  (DFIX-1, MOBILE 390 spec). 767px, not 768: 768 and up is the tablet row everywhere else (ListRow, PAR-1). */
const TIMELINE_RESPONSIVE_CSS = `
  .cl-timeline-narrow { display: none; }
  @media (max-width: 767px) {
    .cl-timeline-wide { display: none; }
    .cl-timeline-narrow { display: block; }
  }
`;

/** The callout under the track: "Next: <label> . <date> . in N days" with the Full schedule action, or the
 *  all-passed line. One home for both forms (F45): the wide and the narrow block render the same text. */
function TimelineCallout({
  clause,
  counts,
  lastDate,
  band,
  onFullSchedule,
  fullScheduleHref,
}: {
  clause: string | null;
  counts: { total: number };
  lastDate: string;
  band: UrgencyBand;
  onFullSchedule?: () => void;
  fullScheduleHref?: string;
}) {
  if (clause) {
    return (
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
    );
  }
  if (counts.total > 0) {
    return (
      <div style={{ marginTop: 10 }}>
        <StateNote band={band}>
          Last milestone passed {"·"} {formatDayMonthYear(lastDate)} {"·"} obligations are current, no further step scheduled
        </StateNote>
      </div>
    );
  }
  return null;
}

/** The narrow form's stack (MOBILE 390 spec, "TIMELINE (vertical)"): a 62px date gutter, a 14px dot column over
 *  ONE 2px track (green down to the next row, grey beyond), a 1fr label column; 14px under each row. Dot states
 *  come from the same classifier the wide block uses (the entries arrive classified). The date gutter wraps
 *  rather than overflowing into the dot column: an ISO date at 11px needs ~57px in the app face and ~70px in a
 *  fallback face (DEVIATION-LOG 2026-09-08, MOBILE-60). */
function VerticalMilestoneStack({ visible, band }: { visible: ClassifiedMilestone[]; band: UrgencyBand }) {
  const nextIndex = visible.findIndex((c) => c.state === "next");
  const allPassed = visible.every((c) => c.state === "passed");
  const greenPercent =
    nextIndex >= 0 ? (visible.length > 1 ? (nextIndex / (visible.length - 1)) * 100 : 0) : allPassed ? 100 : 0;

  return (
    <div style={{ position: "relative" }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 68,
          top: 10,
          bottom: 10,
          width: 2,
          background: `linear-gradient(to bottom, var(--awareness) 0%, var(--awareness) ${greenPercent}%, rgba(0,0,0,.12) ${greenPercent}%, rgba(0,0,0,.12) 100%)`,
        }}
      />
      {visible.map(({ entry, state, index }) => (
        <div
          key={index}
          style={{ display: "grid", gridTemplateColumns: "62px 14px 1fr", alignItems: "start", paddingBottom: 14 }}
        >
          <span
            style={{
              textAlign: "right",
              width: 62,
              paddingRight: 8,
              boxSizing: "border-box",
              fontVariantNumeric: "tabular-nums",
              fontSize: "var(--fs-11)",
              fontWeight: state === "next" ? 800 : 600,
              color: "var(--ink-3)",
            }}
          >
            {entry.date}
          </span>
          <span style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 1, paddingTop: 2 }}>
            {state === "passed" ? (
              <span aria-hidden="true" style={passedDotStyle(10)} />
            ) : state === "next" ? (
              <span aria-hidden="true" style={nextDotStyle(band.hex, 12, 3)} />
            ) : (
              <span aria-hidden="true" style={aheadDotStyle(10)} />
            )}
          </span>
          <span
            style={{
              minWidth: 0,
              overflowWrap: "anywhere",
              paddingLeft: 8,
              fontSize: "var(--fs-12)",
              fontWeight: state === "next" ? 700 : 500,
              color: "var(--ink)",
            }}
          >
            {entry.label}
          </span>
        </div>
      ))}
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
      // nextDotStyle wants the raw hex (band.hex), not the var() reference (band.cssVar); it
      // appends an alpha suffix onto this string for the ring, which is only a valid color when
      // the base is a hex literal (CF-BROKEN-2 / A2bc).
      <span aria-hidden="true" style={nextDotStyle(band.hex, 12, 3)} />
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
