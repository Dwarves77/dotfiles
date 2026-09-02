// admissible-for.ts — the pollution barrier (docs/specs/08-flywheel-design.md §3.3, exact). Lane
// DP-ENGINE, system-completion train, 2026-09-02.
//
// "One gate function. Every consumer calls it; nothing reads `derived_values` directly." (spec §3.3).
// F31 (.discipline/fitness/functions/F31-derived-values-gate.mjs) is the SECOND enforcement point spec
// names beyond RLS (migration 285): it fails CI on any `.from("derived_values")` / raw SQL read of
// `derived_values` outside this directory. `derived_values_admissible` (the view) is exempt everywhere —
// it has ALREADY applied this gate's stale/falsified/obsolete exclusion at the DB layer, so reading it is
// reading admitted data, not bypassing the gate.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS, NO NPM PACKAGE AT MODULE SCOPE — see types.ts's header for why
// (Node-native type stripping, no jiti). `FLOOR` comes from src/lib/entities/decisions.mjs (ADR-024
// decision 3), `isContractable` from src/lib/contracts/envelope.mjs, `isMissing` from
// src/lib/contracts/vocabularies.mjs — all three already-shipped, plain-ESM, zero-dependency modules
// (DP-SPINE's own header note for decisions.mjs: "importable from a fitness function, a script, or a
// Next.js component with no npm install and no bundler"). Imported here, never re-implemented.

// @ts-ignore — decisions.mjs/envelope.mjs/vocabularies.mjs are plain .mjs with JSDoc types, not .d.ts;
// tsc's `checkJs`/`allowJs` posture for this repo does not type-check .mjs imports from a .ts file by
// default. The VALUES imported are used only at runtime (FLOOR as a lookup table, the two predicates as
// plain functions), so this does not weaken any compile-time guarantee this file itself provides.
import { FLOOR } from "../entities/decisions.mjs";
// @ts-ignore — see note above.
import { isContractable } from "../contracts/envelope.mjs";
// @ts-ignore — see note above.
import { isMissing } from "../contracts/vocabularies.mjs";
import { effectiveConfidence } from "./effective-confidence.mjs";
import type { Value, Use, Verdict, OriginClass } from "./types.ts";

function refuse(reason: string): Verdict {
  return { ok: false, reason };
}

/**
 * The pollution barrier (spec §3.3, transcribed exactly, ported to TS types). `now` is injected
 * (`Date`), never read internally — same discipline every pure function in this engine follows.
 *
 * Order of checks matches spec's own body precisely:
 *   1. lifecycle falsified/obsolete -> refuse
 *   2. admissibility stale -> refuse (pending recompute)
 *   3. HARD, non-overridable floor: community/community-corroborated is NEVER admissible in
 *      calculation/filing, at ANY corroboration level
 *   4. missing (obs_status) is never admissible in calculation/filing ("missing is not zero")
 *   5. filing additionally requires a contractable derivation
 *   6. decayed effective confidence must clear FLOOR[use] for every use except display
 */
export function admissibleFor(v: Value, use: Use, now: Date): Verdict {
  if (v.lifecycle === "falsified" || v.lifecycle === "obsolete") return refuse("lifecycle");
  if (v.admissibility === "stale") return refuse("pending recompute");

  if (use === "filing" || use === "calculation") {
    if (v.originClass === "community" || v.originClass === ("community-corroborated" as OriginClass)) {
      return refuse("community is never admissible in a calculation, at any corroboration level");
    }
    if (v.obsStatus && isMissing(v.obsStatus)) return refuse("missing is not zero");
  }
  if (use === "filing" && !isContractable(v.derivation)) return refuse("non-contractable derivation");

  const eff = effectiveConfidence(v.baseConfidence, v.assertedAt, v.halfLifeDays, now.toISOString());
  if (use !== "display" && eff < FLOOR[use]) return refuse(`decayed below floor (${eff})`);
  return { ok: true, effectiveConfidence: eff, mustLabel: v.originClass };
}
