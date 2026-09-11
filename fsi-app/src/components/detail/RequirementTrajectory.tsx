/**
 * RequirementTrajectory: the ONE renderer for the Exposure card's Trajectory cell on
 * regulation-family items (task 2.3, brief-chain-build-plan-2026-09-11, migration 316
 * intelligence_items.requirement_trajectory). Read first: docs/design/handoff-2026-09-06/
 * "Caros Ledge UI System.dc.html", the regulation Exposure card (four-cell grid Where / Who
 * pays / Your lanes / Trajectory). Its trajectory cell renders exactly:
 *
 *   40% (2025) -> 70% (Sep 30 2026) -> 100% (2027); CH4 and N2O in scope from 2026
 *
 * (the arrow above is written as "->" in this comment only so the source file itself carries
 * no raw non-ASCII glyph outside the rendered string; the component's OWN rendered output uses
 * the mock's real glyph, U+2192 RIGHTWARDS ARROW, verbatim, per the brief-drift precedent: mockup
 * strings bind. That arrow is not the standing em-dash / en-dash / section-sign prohibition;
 * it is a different codepoint and is not covered by that rule.)
 *
 * Exported as a plain function, not a JSX component, so the four call sites can chain it with
 * `||` against the existing conversionTrigger / Absence fallback the Trajectory cell already
 * used (a JSX element is always truthy as a value even when it renders null internally, which
 * would break that chain).
 *
 * One renderer, four callers: RegulationDetailSurface.tsx, OperationsDetailSurface.tsx,
 * MarketSignalDetailSurface.tsx, ResearchFindingDetailSurface.tsx. requirement_trajectory is
 * prompt-gated to format_type === 'regulatory_fact_document' (system-prompt.ts), so in practice
 * only regulation-family items ever populate it; the other three surfaces call this same
 * function for architectural parity (no per-surface copy) and it returns null there today,
 * falling through to their existing conversionTrigger / Absence chain.
 *
 * The "which step is imminent" decision (pickCurrentStepIndex) and the per-step display text
 * (formatTrajectoryStep) are factored into src/lib/detail/requirement-trajectory-classify.ts (no
 * JSX, alongside this directory's other detail-page helper, meta-line.ts), so that logic is
 * unit-tested directly (requirement-trajectory-classify.test.mjs) without needing a browser mount
 * for what is really a pure function of steps + "now" -- same convention
 * milestone-timeline-classify.ts already established for MilestoneTimeline.tsx.
 */

import type { Resource } from "@/types/resource";
import { pickCurrentStepIndex, formatTrajectoryStep } from "@/lib/detail/requirement-trajectory-classify";

/**
 * Renders `trajectory` as the mock's Trajectory-cell string, or returns null when there is
 * nothing to render (absent, or an empty steps array) so callers can chain it with `||` against
 * their existing fallback (conversionTrigger, then Absence). Never invents a step, a value, or a
 * "current" flag the data does not carry.
 */
export function renderRequirementTrajectory(
  trajectory: Resource["requirementTrajectory"] | null | undefined
): React.ReactNode | null {
  if (!trajectory || !Array.isArray(trajectory.steps) || trajectory.steps.length === 0) {
    return null;
  }
  const { steps, note } = trajectory;
  const currentIndex = pickCurrentStepIndex(steps, new Date());

  const parts: React.ReactNode[] = [];
  steps.forEach((step, i) => {
    if (i > 0) parts.push(" → ");
    const label = formatTrajectoryStep(step);
    parts.push(
      i === currentIndex ? (
        <span key={`step-${i}`} style={{ fontWeight: 700 }}>
          {label}
        </span>
      ) : (
        <span key={`step-${i}`}>{label}</span>
      )
    );
  });
  if (note) {
    parts.push(`; ${note}`);
  }
  return <>{parts}</>;
}
