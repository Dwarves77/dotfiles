import { FLOOR } from "../entities/decisions.mjs";
import { isContractable } from "../contracts/envelope.mjs";
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
