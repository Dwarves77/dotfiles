// src/lib/sources/host-authority.ts
//
// DETERMINISTIC default tier for a NEWLY-discovered source host, by source-TYPE (not reputation).
// Used at REGISTRATION so a grounding-pool corroborator gets a tier the authority floor can EVALUATE,
// instead of NULL — which escapes the floor entirely (the floor cannot compare `null <= T2`), the
// sub-floor-MASKING defect the unregistered-span-host audit surfaced (1034 FACT claims hidden behind
// NULL). This is the registration-time seed of the authority-origin axis (Design 3): enacted/official
// legal text and government/regulator/intergovernmental hosts are authoritative; everything else
// registers PROVISIONAL + sub-floor until classified/reviewed.
//
// FACTS-ONLY host-pattern matching; no content interpretation. CONSERVATIVE: an ambiguous host
// defaults to sub-floor (honest-quarantine > hollow-pass) — a wrongly-low tier is recoverable via
// operator override, a wrongly-HIGH tier would let a sub-floor fact pass (the masking we are fixing).

// Enacted primary legal text / official journals (binding law) -> T1.
const LEGAL_PRIMARY = /(^|\.)(eur-lex\.europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk)$/;
// Intergovernmental / official bodies acting in an authoritative capacity -> T2.
const GOV_INTERGOV = /(^|\.)(europa\.eu|un\.org|oecd\.org|imo\.org|icao\.int|iea\.org|who\.int|wto\.org|unfccc\.int|worldbank\.org|ipcc\.ch)$/;
// Government / regulator TLD stems -> T2 (regulator-guidance authority). `(^|\.)` so both the bare
// registrable domain (gov.uk) and a subdomain (service.gov.uk) match.
const GOV_TLD = /(^|\.)gov$|(^|\.)gov\.[a-z]{2,3}$|(^|\.)gob\.[a-z]{2,3}$|(^|\.)gouv\.[a-z]{2,3}$|(^|\.)govt\.[a-z]{2,3}$|(^|\.)go\.[a-z]{2}$|(^|\.)gc\.ca$/;

/** Sub-floor for reg-family (<=T2) AND research_finding (<=T4). Used only as the NON-grounding
 *  creation-time fallback (defaultTierForHost) — NEVER as a register-at-grounding tier (SC-13). */
export const PROVISIONAL_DEFAULT_TIER = 5;

/** THE deterministic CODIFIED source-TYPE tier for a host, or NULL when the host matches no codified
 *  rule (AMBIGUOUS). This is the moat-safe classifier (SC-13): it NEVER guesses and NEVER defaults —
 *  legal-primary -> 1, gov/regulator/intergov -> 2, everything else -> null. A null result means
 *  "the tier is not deterministically knowable — worklist it," it does NOT mean "assume sub-floor."
 *  The register-at-grounding step consumes THIS (via decidePoolHostRegistration): an ambiguous host is
 *  left UNREGISTERED so its FACT span NULL-stamps and walls the floor honestly (surfaced by
 *  surfaceNullTierHosts), rather than being minted a guessed tier that could hollow-pass a floor where
 *  the guess sits at/below the max (the technology floor=5 case). */
export function codifiedTierForHost(host: string | null | undefined): number | null {
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  if (LEGAL_PRIMARY.test(h)) return 1;
  if (GOV_INTERGOV.test(h) || GOV_TLD.test(h)) return 2;
  return null;
}

/** Deterministic source-TYPE tier WITH the provisional sub-floor default applied — codified rule OR the
 *  sub-floor fallback. Returns a NUMBER (never null), for callers that legitimately need a non-null
 *  creation-time value (e.g. `tier_at_creation`, a historical record NOT read by the grounding resolver)
 *  or the one-shot error-body repoint script. NOT the register-at-grounding tier — that is
 *  codifiedTierForHost (SC-13): this fallback would MINT a guessed tier into the grounding resolver. */
export function defaultTierForHost(host: string | null | undefined): number {
  return codifiedTierForHost(host) ?? PROVISIONAL_DEFAULT_TIER;
}

export type PoolHostRegisterAction = "inherit" | "register" | "worklist";
export interface PoolHostDecision {
  action: PoolHostRegisterAction;
  /** the deterministic tier to register/inherit at; null for `worklist` (never a guessed tier). */
  tier: number | null;
}

/** PURE register-at-grounding decision (SC-13). Given a pool-source host and the tier it ALREADY
 *  resolves to under the live sources registry (null = its institution is unregistered):
 *   - already resolves        -> `inherit` (an institution-group (eTLD+1) match already confers the tier;
 *                                no new row — never a per-row tier that could diverge from the institution)
 *   - codified host-class rule -> `register` at that DETERMINISTIC tier (legal->1, gov/intergov->2)
 *   - ambiguous (no codified)  -> `worklist` (do NOT register; the span NULL-stamps and surfaceNullTierHosts
 *                                aggregates the host for one batched operator look — never item-by-item
 *                                clicks, never an auto-judged tier)
 *  No LLM guess and no default tier ever enters this decision — that is the whole moat guarantee. */
export function decidePoolHostRegistration(
  host: string | null | undefined,
  alreadyResolvesTier: number | null,
): PoolHostDecision {
  if (alreadyResolvesTier != null) return { action: "inherit", tier: alreadyResolvesTier };
  const t = codifiedTierForHost(host);
  return t != null ? { action: "register", tier: t } : { action: "worklist", tier: null };
}
