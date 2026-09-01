// Consistency check manifest. Main session owns this file.
// Post-slim (2026-05-21): C1, C2, C6, C7, C8, C9, C10 deleted per
// evidence-based audit. C3 + C4 remain from that slim (both have documented real catches:
// migration 067 orphan + remediation-discipline worktree orphan in CI); C5 was added after the
// slim (2026-06-28, see its import below) as the plan re-grounding mechanism, so three checks
// — C3, C4, C5 — are registered today.

import { consistencyCheck as C3 } from './checks/C3-migrations-reality.mjs';
import { consistencyCheck as C4 } from './checks/C4-worktrees-reality.mjs';
// Plan re-grounding mechanism (2026-06-28): C5 forces the ACTIVE phase in the governing program doc
// to re-ground against the real code (its declared anchors still present/absent) before it executes —
// the plan-layer silent-rot guard. Invariant RG-1 (remediation-discipline).
import { consistencyCheck as C5 } from './checks/C5-program-anchors-reality.mjs';

export const consistencyChecks = [C3, C4, C5];

export function getCheckById(id) {
  return consistencyChecks.find((c) => c.id === id);
}
