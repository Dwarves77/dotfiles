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

// ── SC-13 CLASS-TABLE EXTENSION (operator ruling 2026-07-13, 124-host batch) ────────────────────────────────
// The codified rule above assigns only the floor-PASSING tiers (legal 1 / gov 2) — deliberately conservative,
// since a wrong high tier hollow-passes a floor. This extension adds the ruled SUB-FLOOR + T4 classes so a
// register-at-grounding host that classifies to a ruled class auto-registers at its class tier; an unrecognized
// host stays null → worklist (unchanged SC-13 guarantee). The T4 classes (verifier/academic/association) can pass
// the research floor (=4), so they demand a HIGH-CONFIDENCE signal (accredited-CAB list / .edu-.ac TLD / a curated
// association allowlist) — never a fuzzy .org. The sub-floor classes (analysis T6, lawfirm/news T7) never pass any
// floor, so a mis-fire only under-credits (recoverable), never hollow-passes. No LLM guess, no default: still SC-13.
//
//   class-table (ruled):  legal→1  gov→2  verifier/academic/association→4  analysis→6  lawfirm/news→7
//   permanent worklist:   encyclopedia / aggregator / DOI-resolver / legal-aggregator (justia/legiscan) / unknown
//                         — never auto-registered; a span attributing to one is a re-attribution instruction.

/** Accredited conformity-assessment bodies (class-society / verifier precedent: DNV/ClassNK/SGS/TÜV/Intertek/
 *  Verifavia/Bureau Veritas/Lloyd's Register) → T4. NOT Big-4/advisory (pwc etc.) — those read as commentary (T7). */
const VERIFIER_CAB = /(^|\.)(dnv|classnk|sgs|tuvsud|tuv|intertek|verifavia|normecverifavia|bureauveritas|lloydsregister)\.[a-z.]+$/;
/** Universities / academic institutions → T4 (research role). */
const ACADEMIC_TLD = /(\.edu|\.edu\.[a-z]{2}|\.ac\.[a-z]{2})$/;
/** Industry-body / trade-association ALLOWLIST (cer.be precedent) → T4. Curated — never a fuzzy .org rule. */
const ASSOCIATION_ALLOW = new Set(["cer.be", "usasean.org", "wbcsd.org", "intercargo.org", "seacargocharter.org"]);
/** Law firms → T7 commentary. */
const LAWFIRM = /(bakermckenzie|bracewell|cliffordchance|mayerbrown|proskauer|slaughterandmay|kennedyslaw|globalelr|fenechlaw|klalaw|tauilchequer|nortonrose|whitecase|hoganlovells|(^|\.)lw\.com$|(^|\.)wfw\.com$)/;
/** News / trade press → T7. */
const NEWS = /(reuters|freightwaves|loadstar|(^|\.)joc\.com$|(^|\.)tpm\.joc\.com$|lloydslist|maritime-executive|greenairnews|motortransport|logistics-manager|safety4sea|rivieramm|calmatters|plasticsnews|supplychainbrain|esgnews|theartnewspaper|fadmagazine|thomsonreuters)/;
/** Analysis / think-tank → T6 (Research feedstock, sub-floor). */
const ANALYSIS = /(carbonbrief|carbon-direct|carbon-transparency|ammoniaenergy|cleanenergywire|climatepolicydatabase|climatecatalyst|renewable-carbon|sustainable-ships|(^|\.)rmi\.org$|theicct|(^|\.)wri\.org$)/;

/** THE register-at-grounding class tier for a host — the SC-13 codified rule EXTENDED with the ruled class table,
 *  or NULL (worklist) for an unrecognized/permanent-worklist host. Deterministic, pattern-based, no guess/default. */
export function classTierForHost(host: string | null | undefined): number | null {
  const codified = codifiedTierForHost(host);
  if (codified != null) return codified; // legal 1 / gov 2 (conservative, unchanged)
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  if (VERIFIER_CAB.test(h)) return 4;
  if (ACADEMIC_TLD.test(h)) return 4;
  if (ASSOCIATION_ALLOW.has(h)) return 4;
  if (ANALYSIS.test(h)) return 6;
  if (LAWFIRM.test(h) || NEWS.test(h)) return 7;
  return null; // unknown / encyclopedia / aggregator / resolver / legal-aggregator → worklist
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
  const t = classTierForHost(host); // SC-13 codified rule EXTENDED with the ruled class table (2026-07-13)
  return t != null ? { action: "register", tier: t } : { action: "worklist", tier: null };
}
