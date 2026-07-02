// Fitness function manifest. Main session owns this file.
// Post-slim (2026-05-21): F1, F3, F4, F5, F7 deleted per evidence-based audit
// (zero catches in production OR structural issues). Engine cut from 9 → 4.

import { fitnessFunction as F2 } from './functions/F2-admin-routes-isPlatformAdmin.mjs';
import { fitnessFunction as F6 } from './functions/F6-migrations-numeric-ordering.mjs';
import { fitnessFunction as F8 } from './functions/F8-client-server-tier-boundary.mjs';
import { fitnessFunction as F9 } from './functions/F9-build-compiles.mjs';
// Operating-mechanism build (2026-06-06): F10 mechanically links source-credibility-model
// (was judgment-load only) by gating its syndication-collapse / independent-citer math.
import { fitnessFunction as F10 } from './functions/F10-source-credibility-syndication.mjs';
// Exemption-audit (2026-06-06): F11 converts invariant SC-3's tier-weight half from exempt to
// enforced (TIER_WEIGHTS T1=1.0…T7=0 + recency decay) — the operator's "buildable-but-unbuilt is
// not a valid exemption" rule applied. SQL COALESCE/override half remains a named residual (pgTAP-deferred).
import { fitnessFunction as F11 } from './functions/F11-trust-tier-weights.mjs';
// Moat assertion (2026-06-28, A1): F12 enforces invariant SC-9 — the reg-fact resolver is base_tier-
// ONLY (reputation/effective_tier never confers grounding eligibility). Behavioral selftest fails loud
// on a reintroduced `?? effective_tier` fallback the corpus audits cannot catch.
import { fitnessFunction as F12 } from './functions/F12-moat-base-tier.mjs';
// phase-intake-gate (2026-07-01, dispatch §2): F13 makes the single-mint-chokepoint claim an INVARIANT.
// Every intelligence_items INSERT must go through mintIntelligenceItem(); a direct INSERT bypasses the
// congruence + dedup + relevance gate (the drain-first-fetch direct-mint that produced the 38 polluters).
import { fitnessFunction as F13 } from './functions/F13-single-mint-chokepoint.mjs';

export const fitnessFunctions = [
  F2,
  F6,
  F8,
  F9,
  F10,
  F11,
  F12,
  F13,
];

export function getFunctionById(id) {
  return fitnessFunctions.find((f) => f.id === id);
}
