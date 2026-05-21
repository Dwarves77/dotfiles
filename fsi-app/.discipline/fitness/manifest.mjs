// Fitness function manifest. Main session owns this file.
// Post-slim (2026-05-21): F1, F3, F4, F5, F7 deleted per evidence-based audit
// (zero catches in production OR structural issues). Engine cut from 9 → 4.

import { fitnessFunction as F2 } from './functions/F2-admin-routes-isPlatformAdmin.mjs';
import { fitnessFunction as F6 } from './functions/F6-migrations-numeric-ordering.mjs';
import { fitnessFunction as F8 } from './functions/F8-client-server-tier-boundary.mjs';
import { fitnessFunction as F9 } from './functions/F9-build-compiles.mjs';

export const fitnessFunctions = [
  F2,
  F6,
  F8,
  F9,
];

export function getFunctionById(id) {
  return fitnessFunctions.find((f) => f.id === id);
}
