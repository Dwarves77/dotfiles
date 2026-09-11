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

/** One step's display text, exactly the mock's per-step shape: "value (date)". */
export function formatTrajectoryStep(step: RequirementTrajectoryStepLike): string {
  return `${step.value} (${step.date})`;
}
