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
// A2 half-slice detector (2026-07-03): F14 mechanizes the producer-consumer orphan check —
// a writer with no reader — that every prior audit found by hand. Maps to invariant RD-9.
import { fitnessFunction as F14 } from './functions/F14-producer-consumer-orphan.mjs';
// Spend chokepoint (2026-07-04): F15 mechanizes "no Anthropic API call outside the spend client" — the
// generation-side analog of dedup-before-ground. A2 shrinking allowlist for legacy sites. Maps to RD-10.
import { fitnessFunction as F15 } from './functions/F15-spend-chokepoint.mjs';
// Transport hold gate (2026-07-06): F16 mechanizes "scrape hold LIVE, zero fetches" at the single fetch
// primitive — assertFetchAllowed() throws while engaged; no raw Browserless fetch may bypass it. Maps to RD-11.
import { fitnessFunction as F16 } from './functions/F16-transport-hold-gate.mjs';
// Size-cap doctrine (2026-07-06): F17 is the size-axis analog of F15 — every cap on the grounding path is
// registered + classified (surfaced or never-binds); a new unregistered/silent cap is RED. Kills the silent-
// slice class (the GROUND_SECTION_MAX_CHARS=12000 category-2 defect). Maps to RD-12.
import { fitnessFunction as F17 } from './functions/F17-size-cap-doctrine.mjs';
// One-url-canonicalizer (2026-07-12, intake-correctness Step 1.3): F18 forbids the ad-hoc URL-identity
// normalizer class (bare scheme-strip / whole query-drop = the deleted intake `_normUrl` that produced the
// D1 EUR-Lex false-dedup). URL identity lives ONLY in canonicalizeUrl. Maps to invariant RD-13.
import { fitnessFunction as F18 } from './functions/F18-one-url-canonicalizer.mjs';
// No service→anon downgrade (2026-07-12, dead-code Ruling 2 C1): F19 forbids the `SUPABASE_SERVICE_ROLE_KEY ||
// …ANON_KEY` fail-open pattern anywhere in src (the coverage-gaps.ts live defect). Maps to invariant RD-15.
import { fitnessFunction as F19 } from './functions/F19-no-service-anon-downgrade.mjs';
// Pause-flag one-writer (2026-07-12, pause-flag structural enforcement): F20 forbids any direct write to
// system_state.global_processing_paused / scrape_cadence outside the sanctioned admin route (the RPC caller).
// Replaces the DEAD 2a operator-credential design — no manual step, no secret. Maps to invariant RD-23.
import { fitnessFunction as F20 } from './functions/F20-pause-flag-one-writer.mjs';
// Single grounding entry (2026-07-13, snapshot-first rebuild PR-2): F21 mechanizes "grounding acquisition has
// ONE entry" — the workflow over the canonical pipeline, via the verify-item entry point. No other production
// file may directly invoke generateBriefWorkflow / generateBrief / groundBrief (the old $65 bypass path). Maps
// to invariant RD-24.
import { fitnessFunction as F21 } from './functions/F21-single-grounding-entry.mjs';

export const fitnessFunctions = [
  F2,
  F6,
  F8,
  F9,
  F10,
  F11,
  F12,
  F13,
  F14,
  F15,
  F16,
  F17,
  F18,
  F19,
  F20,
  F21,
];

export function getFunctionById(id) {
  return fitnessFunctions.find((f) => f.id === id);
}
