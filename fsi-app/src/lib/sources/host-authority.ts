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

/** Sub-floor for reg-family (<=T2) AND research_finding (<=T4); identical to registerCitedSources'
 *  existing default, so extending registration to pool hosts is NOT a new aggressive behaviour. */
export const PROVISIONAL_DEFAULT_TIER = 5;

/** Deterministic source-TYPE tier for a host: legal-primary -> 1, gov/official/intergov -> 2, else
 *  the provisional sub-floor default. Returns a NUMBER the authority floor can evaluate (never null). */
export function defaultTierForHost(host: string | null | undefined): number {
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return PROVISIONAL_DEFAULT_TIER;
  if (LEGAL_PRIMARY.test(h)) return 1;
  if (GOV_INTERGOV.test(h) || GOV_TLD.test(h)) return 2;
  return PROVISIONAL_DEFAULT_TIER;
}
