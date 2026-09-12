/**
 * pickCurrentStepIndex / formatTrajectoryStep -- the pure logic behind the Exposure card's
 * Trajectory cell for regulation-family items (task 2.3, brief-chain-build-plan-2026-09-11,
 * migration 316 intelligence_items.requirement_trajectory). Factored into its own plain .ts file,
 * no JSX, so this can be unit-tested directly via node's native type-stripping (same convention
 * milestone-timeline-classify.ts establishes for MilestoneTimeline.tsx: keep the decision logic
 * import-portable, leave only JSX assembly in the .tsx). src/components/detail/
 * RequirementTrajectory.tsx is the one caller of both functions below.
 *
 * Which step gets bolded (the mock, docs/design/handoff-2026-09-06/"Caros Ledge UI System.dc.html"
 * regulation Exposure card, bolds "70% (Sep 30 2026)" -- the same date its own timeline callout
 * elsewhere on the page tags "UPCOMING"):
 *   - The first step whose parsed date is on or after `now` is the imminent milestone -> bold it.
 *   - If every parseable date has already passed, the trajectory is complete -> bold the last
 *     parseable step (the requirement level currently in force).
 *   - If no step's date parses, bold nothing (-1) rather than guess.
 *
 * A step's `date` is a free-form string (RequirementTrajectoryJSON, src/lib/agent/parse-output.ts,
 * only requires it to be a string, not ISO), so parsing is honest-best-effort, never asserted.
 */

export interface RequirementTrajectoryStepLike {
  date: string;
  value: string;
  label?: string;
}

/** Index of the step to bold, or -1 when no step's date can be parsed. */
export function pickCurrentStepIndex(steps: RequirementTrajectoryStepLike[], now: Date): number {
  const parsed = steps.map((step) => {
    const d = new Date(step.date);
    return Number.isNaN(d.getTime()) ? null : d;
  });
  if (parsed.every((d) => d === null)) return -1;
  const upcomingIndex = parsed.findIndex((d) => d !== null && d.getTime() >= now.getTime());
  if (upcomingIndex !== -1) return upcomingIndex;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (parsed[i] !== null) return i;
  }
  return -1;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const BARE_YEAR_RE = /^\d{4}$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats one step's `date` for display, per the mock's exact convention: a bare year passes
 * through unchanged ("2025"), a full "YYYY-MM-DD" (the stored shape, system-prompt.ts:311)
 * becomes "Mon D YYYY" ("2026-09-30" -> "Sep 30 2026"), and anything else (an unexpected shape,
 * or free-form prose) is echoed verbatim rather than turned into "NaN"/"Invalid Date" (fix round 1,
 * coordinator review, 2026-09-11: the prior implementation always echoed `date` verbatim, which
 * rendered the actual stored ISO shape wrong -- "70% (2026-09-30)" instead of the mock's
 * "70% (Sep 30 2026)" -- because every existing test happened to feed an already-formatted
 * display string instead of the stored shape).
 *
 * Deliberately parses by splitting the string rather than `new Date("YYYY-MM-DD")`: the Date
 * constructor treats a date-only ISO string as UTC midnight, which DISPLAYS as the previous
 * calendar day in any negative-UTC-offset timezone (the whole of the Americas). A per-year
 * requirement milestone must show the same calendar date to every reader regardless of the
 * viewer's timezone, so this never constructs a Date for display, only string arithmetic.
 */
function formatTrajectoryDate(date: string): string {
  if (BARE_YEAR_RE.test(date)) return date;

  const m = ISO_DATE_RE.exec(date);
  if (m) {
    const [, year, monthStr, dayStr] = m;
    const monthIndex = Number(monthStr) - 1;
    const day = Number(dayStr);
    if (monthIndex >= 0 && monthIndex <= 11 && Number.isInteger(day) && day >= 1 && day <= 31) {
      return `${MONTH_NAMES[monthIndex]} ${day} ${year}`;
    }
  }

  // Unexpected shape (free-form prose, an already-formatted display string, a malformed date):
  // echo verbatim. Never fabricate a parse that isn't there.
  return date;
}

/** One step's display text, exactly the mock's per-step shape: "value (date)". */
export function formatTrajectoryStep(step: RequirementTrajectoryStepLike): string {
  return `${step.value} (${formatTrajectoryDate(step.date)})`;
}
