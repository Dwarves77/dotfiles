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
// Source role at birth (2026-08-11): F22 is F13 one table over — F13 makes the mint gate an invariant
// for intelligence_items, F22 makes role-at-birth an invariant for sources. classify-source-role.ts
// DECLARED the contract ("a source is never created with a NULL role") and nothing enforced it, so it
// held only in the three admin routes and was false on every automated creation path. 1,719 of 2,549
// rows were born role-less; a triage then read "no role" as inert and demoted 869 live regulators.
import { fitnessFunction as F22 } from './functions/F22-source-role-at-birth.mjs';
// Governed-surface coverage ratchet (2026-08-11, operator ruling): F23 WIRES coverage-scan.mjs, which was
// the only module in governance/ with zero inbound references — it produced a real gap list and ran only
// when a human remembered, the same defect class it exists to detect. Gap counts now hold to a committed
// per-category baseline that fails in BOTH directions, so closing gaps forces the ceiling down instead of
// leaving slack that silently reopens. FS-only: no network, no DB, no model call, no schedule.
import { fitnessFunction as F23 } from './functions/F23-governed-surface-coverage.mjs';
// DB-object migration home (2026-08-11): F24 sweeps the one layer no audit had ever touched — the
// database itself. 22 of 181 catalog objects exist in production with NO committed migration, the
// "out-of-repo DDL" class the 2026-07-19 structure audit named and never counted. Two live defects fell
// out of it: a four-function API left callable after migration 219 dropped its table, and a fifteen-
// function SQL re-implementation of Gate A that duplicates the TypeScript one and is called by nothing.
// Holds a committed read-only catalog snapshot against the migration tree — filesystem only, no
// credential, no schedule.
import { fitnessFunction as F24 } from './functions/F24-db-object-migration-home.mjs';
// Module liveness (2026-08-11): F25 mechanizes the last two classes the wiring census could only NAME
// (§A unimported src modules, §B scripts/lib with no consumer). Re-measured with a real import graph
// instead of basename matching: 54 modules with zero production importer, 13 of them carrying a green
// selftest — remediation-discipline category 21 in its literal form ("a capability having a test does
// not prove it is wired"). The graph's precision earned itself twice: it separated src/lib/verification.ts
// from src/lib/sources/verification.ts, and it forced the entry-point list to include Next 16's proxy.ts,
// which has no importers and gates auth for the whole application.
import { fitnessFunction as F25 } from './functions/F25-module-liveness.mjs';
// Storage-ceiling parity (2026-08-17): agent_run_searches.result_content_excerpt has TWO writers and,
// until now, one ceiling. The Deno capture-worker cannot import the Next.js config module, so ADR-016's
// 10M pathological-page bound was enforced on the pipeline path and absent on the worker path — three
// captures landed over it (17.8M / 12.6M / 10.4M chars), all AFTER the ruling, with no signal, because
// the unguarded path had nothing to fire. F26 asserts the two readers resolve the same env var with the
// same fallback literal, and that a worker bind is LOUD (warn + integrity_flags) rather than a quiet
// slice of the grounding pool. Parity, not presence: a hand-copied constant is the divergence itself.
import { fitnessFunction as F26 } from './functions/F26-storage-ceiling-parity.mjs';
// Producer seam proof (2026-08-30): F27 mechanizes "one proof imports every seam a producer composes",
// generalising the WO-17 buildEnvelopeRow miss (parser/planUpsert each proven, the orchestrator's call
// to buildEnvelopeRow proven by nothing, a NOT-NULL `value` never written) to every producer under
// scripts/producers/**. It caught the SAME gap one lane over the same day: eu-weekly-oil-bulletin.mjs's
// parser->planner seam was validated only by a live --apply, closed now by
// market-producer-composition.test.mjs. Filesystem only: no network, no DB, no model call.
import { fitnessFunction as F27 } from './functions/F27-producer-seam-proof.mjs';
// Harness-run integrity (2026-09-01, Wave MH-2): F28 is the meta-harness layer's own enforcement gate
// (build plan §2) — it fails CI when a harness family's (mint/screen/fetch-drain) code changed without a
// run artifact recording why, when a scripts/harness-runs/*/*.json artifact fails CONVENTION.md's schema,
// when a registered family has zero run history, or when a family with ≥2 runs has no proposer
// attestation naming its latest run. Reuses validateRunArtifact/hashHarnessVersion from Wave MH-1's
// scripts/lib/run-artifact.mjs rather than re-implementing the schema or the hash.
import { fitnessFunction as F28 } from './functions/F28-harness-run-integrity.mjs';

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
  F22,
  F23,
  F24,
  F25,
  F26,
  F27,
  F28,
];

export function getFunctionById(id) {
  return fitnessFunctions.find((f) => f.id === id);
}
