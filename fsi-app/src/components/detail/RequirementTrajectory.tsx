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
