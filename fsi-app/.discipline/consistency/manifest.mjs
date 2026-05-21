// Consistency check manifest. Main session owns this file.
// 10 initial C-checks for Layer 4 per ADR-005.

import { consistencyCheck as C1 } from './checks/C1-skills-reality.mjs';
import { consistencyCheck as C2 } from './checks/C2-routes-reality.mjs';
import { consistencyCheck as C3 } from './checks/C3-migrations-reality.mjs';
import { consistencyCheck as C4 } from './checks/C4-worktrees-reality.mjs';
import { consistencyCheck as C5 } from './checks/C5-env-vars-reality.mjs';
import { consistencyCheck as C6 } from './checks/C6-cron-jobs-reality.mjs';
import { consistencyCheck as C7 } from './checks/C7-decisions-reality.mjs';
import { consistencyCheck as C8 } from './checks/C8-obs-status-reality.mjs';
import { consistencyCheck as C9 } from './checks/C9-discipline-manifest-consistency.mjs';
import { consistencyCheck as C10 } from './checks/C10-cross-skill-reference-integrity.mjs';

export const consistencyChecks = [C1, C2, C3, C4, C5, C6, C7, C8, C9, C10];

export function getCheckById(id) {
  return consistencyChecks.find((c) => c.id === id);
}
