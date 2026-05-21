// Consistency check manifest. Main session owns this file.
// Post-slim (2026-05-21): C1, C2, C5, C6, C7, C8, C9, C10 deleted per
// evidence-based audit. Only C3 + C4 remain (both have documented real catches:
// migration 067 orphan + remediation-discipline worktree orphan in CI).

import { consistencyCheck as C3 } from './checks/C3-migrations-reality.mjs';
import { consistencyCheck as C4 } from './checks/C4-worktrees-reality.mjs';

export const consistencyChecks = [C3, C4];

export function getCheckById(id) {
  return consistencyChecks.find((c) => c.id === id);
}
