// Fitness function manifest. Main session owns this file.
// All 8 initial fitness functions registered here per Sprint Architecture Phase 4.

import { fitnessFunction as F1 } from './functions/F1-sources-tier-columns.mjs';
import { fitnessFunction as F2 } from './functions/F2-admin-routes-isPlatformAdmin.mjs';
import { fitnessFunction as F3 } from './functions/F3-src-no-discipline-imports.mjs';
import { fitnessFunction as F4 } from './functions/F4-intelligence-items-urgency-score.mjs';
import { fitnessFunction as F5 } from './functions/F5-briefs-cite-registered-sources.mjs';
import { fitnessFunction as F6 } from './functions/F6-migrations-numeric-ordering.mjs';
import { fitnessFunction as F7 } from './functions/F7-sources-routes-skill-attestation.mjs';
import { fitnessFunction as F8 } from './functions/F8-client-server-tier-boundary.mjs';

export const fitnessFunctions = [
  F1,
  F2,
  F3,
  F4,
  F5,
  F6,
  F7,
  F8,
];

export function getFunctionById(id) {
  return fitnessFunctions.find((f) => f.id === id);
}
