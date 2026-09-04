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
// `unesco.org` added 2026-08-11 (UN specialised agency — the same class as un.org, already listed).
const GOV_INTERGOV = /(^|\.)(europa\.eu|un\.org|unesco\.org|oecd\.org|imo\.org|icao\.int|iea\.org|who\.int|wto\.org|unfccc\.int|worldbank\.org|ipcc\.ch)$/;
// Government / regulator TLD stems -> T2 (regulator-guidance authority). `(^|\.)` so both the bare
// registrable domain (gov.uk) and a subdomain (service.gov.uk) match.
// `canada.ca` added 2026-08-11: it is the Government of Canada's SINGLE official web presence (the GoC
// consolidated its departments onto it), so it is a government stem in fact though it carries no gov label —
// exactly the standing `.gc.ca` already has here.
const GOV_TLD = /(^|\.)gov$|(^|\.)gov\.[a-z]{2,3}$|(^|\.)gob\.[a-z]{2,3}$|(^|\.)gouv\.[a-z]{2,3}$|(^|\.)govt\.[a-z]{2,3}$|(^|\.)go\.[a-z]{2}$|(^|\.)gc\.ca$|(^|\.)canada\.ca$/;

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
// host stays null → worklist (unchanged SC-13 guarantee). The T4 classes (verifier/academic/association/
// standards_body) can pass the research floor (=4), so they demand a HIGH-CONFIDENCE signal (accredited-CAB
// list / .edu-.ac TLD / a curated association or standards-body allowlist) — never a fuzzy .org. The sub-floor
// classes (analysis T6, lawfirm/news T7) never pass any floor, so a mis-fire only under-credits (recoverable),
// never hollow-passes. No LLM guess, no default: still SC-13. `standards_body` added 2026-09-04 (operator
// ruling, `institution-canonicalize` Part C — see STANDARDS_BODY_ALLOW below) — same posture, one more class.
//
//   class-table (ruled):  legal→1  gov→2  verifier/academic/association/standards_body→4  analysis→6  lawfirm/news→7
//   permanent worklist:   encyclopedia / aggregator / DOI-resolver / legal-aggregator (justia/legiscan) / unknown
//                         — never auto-registered; a span attributing to one is a re-attribution instruction.

/** Accredited conformity-assessment bodies (class-society / verifier precedent: DNV/ClassNK/SGS/TÜV/Intertek/
 *  Verifavia/Bureau Veritas/Lloyd's Register) → T4. NOT Big-4/advisory (pwc etc.) — those read as commentary (T7). */
const VERIFIER_CAB = /(^|\.)(dnv|classnk|sgs|tuvsud|tuv|intertek|verifavia|normecverifavia|bureauveritas|lloydsregister)\.[a-z.]+$/;
/** Universities / academic institutions → T4 (research role). */
const ACADEMIC_TLD = /(\.edu|\.edu\.[a-z]{2}|\.ac\.[a-z]{2})$/;
/** Industry-body / trade-association ALLOWLIST (cer.be precedent) → T4. Curated — never a fuzzy .org rule. */
const ASSOCIATION_ALLOW = new Set([
  "cer.be", "usasean.org", "wbcsd.org", "intercargo.org", "seacargocharter.org",
  // 2026-08-11 batched ruling: standard-setter / industry body, same class as cer.be.
  "ieta.org", "goldstandard.org",
]);
/** Standards / framework bodies whose OWN text companies report against → T4 (the SAME class as
 *  SKILL.md §3's "Industry body / classification society" row — a standard-setter is classified by the
 *  act of publishing a standard/framework, the same act that puts an accredited CAB's official acts at
 *  T4, never T1/T2/T3: it does not ISSUE binding law (T1) or regulator guidance (T2), and it is not an
 *  intergovernmental analysis body informing policy from outside industry (T3)). Operator ruling
 *  2026-09-04 (`institution-canonicalize` Part C `ruling_needed`: ifrs.org / cdp.net /
 *  sciencebasedtargets.org sat at T5 against this class's own T4 floor — verbatim, "you know how to
 *  classify, fix it … T4"): ISSB/IFRS Foundation, CDP, SBTi are the three named hosts; GHG Protocol, ISO,
 *  GRI and TNFD are the SAME class and live in `sources` today (WBCSD is already in ASSOCIATION_ALLOW
 *  above; WRI's OWN site stays ANALYSIS below — WRI co-authors GHG Protocol at ghgprotocol.org, but wri.org
 *  itself is WRI's think-tank output, a different act). Curated — never a fuzzy .org rule, the same
 *  posture as ASSOCIATION_ALLOW (no derivable TLD/domain signal distinguishes a standards body from any
 *  other .org). A host already ruled BELOW T4 for a documented reason (ghgprotocol.org / tnfd.global at
 *  T3, sciencebasedtargetsnetwork.org at T3, efrag.org at T2 — see institution-canonicalize.mjs Part C
 *  header) stays listed here too: classTierForHost only ever fires for a host with NO existing
 *  institution-tier match (decidePoolHostRegistration's `inherit` branch always wins first when one
 *  exists), so listing an already-lower-ruled host here never regresses that ruling — it only closes the
 *  worklist gap the NEXT not-yet-registered pool host of the same body would otherwise hit. */
const STANDARDS_BODY_ALLOW = new Set([
  "ifrs.org", "cdp.net", "sciencebasedtargets.org", // the three named ruling_needed hosts
  "ghgprotocol.org", "iso.org", "globalreporting.org", "tnfd.global", // same rule, live in `sources` today
]);
/** Law firms → T7 commentary. */
const LAWFIRM = /(bakermckenzie|bracewell|cliffordchance|mayerbrown|proskauer|slaughterandmay|kennedyslaw|globalelr|fenechlaw|klalaw|tauilchequer|nortonrose|whitecase|hoganlovells|(^|\.)lw\.com$|(^|\.)wfw\.com$|aoshearman|trenchrossi|(^|\.)cms\.law$|(^|\.)blakes\.com$|garrigues|dlapiper|linklaters|morihamada|allbrightlaw)/;
/** News / trade press → T7. */
const NEWS = /(reuters|freightwaves|loadstar|(^|\.)joc\.com$|(^|\.)tpm\.joc\.com$|lloydslist|maritime-executive|greenairnews|motortransport|logistics-manager|safety4sea|rivieramm|calmatters|plasticsnews|supplychainbrain|esgnews|theartnewspaper|fadmagazine|thomsonreuters|balkangreenenergynews|ceenergynews|china-briefing|cyprusshippingnews|sundancetimes|sustainable-bus|ishkaglobal)/;
/** Analysis / think-tank → T6 (Research feedstock, sub-floor). */
const ANALYSIS = /(carbonbrief|carbon-direct|carbon-transparency|ammoniaenergy|cleanenergywire|climatepolicydatabase|climatecatalyst|renewable-carbon|sustainable-ships|(^|\.)rmi\.org$|theicct|(^|\.)wri\.org$|ccarbon\.info|now-gmbh|influencemap|circularactionhub|caneurope|climatecooperation|clientearth|platformelectromobility|energyadvicehub|(^|\.)igsd\.org$|nautilusint|international-climate-initiative|oneplanetnetwork|inderscience)/;
/** LEGAL AGGREGATORS (operator ruling #3: justia / legiscan / Cornell LII class) → PERMANENT worklist (null).
 *  They republish statutes but are NOT the official publisher — a span is a re-attribution instruction. This
 *  fires BEFORE the academic .edu rule so a legal-info-institute on .edu (law.cornell.edu) is NOT minted T4.
 *  `mondaq` (republishes law-firm commentary) and `up.codes` (republishes building codes) added 2026-08-11. */
const LEGAL_AGGREGATOR = /(law\.justia|(^|\.)justia\.com$|legiscan|law\.cornell\.edu|practiceguides\.chambers|npcobserver|legalclarity|(^|\.)mondaq\.com$|(^|\.)up\.codes$)/;
/** HOSTING PLATFORMS (2026-08-11 ruling) → PERMANENT worklist (null). A third-party SaaS that hosts someone
 *  else's publication (Citizen Space hosts UK departmental consultations) is not the publisher either — the
 *  same re-attribution instruction as an aggregator, arrived at from the hosting side rather than the
 *  republishing side. Kept a SEPARATE constant so the two reasons stay legible in the flag wording. */
const HOSTING_PLATFORM = /(^|\.)citizenspace\.com$|(^|\.)commentworks\.co\.uk$/;

// ── RULED HOST INSTANCES (2026-08-11 batched ruling) ────────────────────────────────────────────────────────
// The class regexes above generalise: they carry a rule that a NEW host of the same class also matches. A few
// ruled hosts carry NO such derivable signal — an Indian ministry programme on a bare `.in`, a vendor or a
// carrier's corporate site — and inventing a fuzzy rule for them (".com selling software → T7") would be the
// exact guess SC-13 forbids. Those are recorded here as RULED INSTANCES: a closed, per-host map, sourced from
// `scripts/_ruling/null-tier-host-ruling.mjs`. A host NOT in this map and matching no class regex still
// worklists — the SC-13 no-guess guarantee is unchanged, this map only records rulings already made.
const RULED_HOST_TIER: ReadonlyMap<string, number> = new Map([
  ["moefcc-gcp.in", 2],            // India MoEFCC Green Credit Programme — ministry programme on a bare .in
  ["infineuminsight.com", 7],      // Infineum corporate publication
  ["searoutes.com", 7],            // routing/emissions SaaS vendor
  ["shipzero.com", 7],             // carbon-accounting SaaS vendor
  ["senken.io", 7],                // carbon-credit marketplace vendor
  ["envigilance.com", 7],          // regulatory-intelligence vendor
  ["en.reach24h.com", 7],          // REACH24H regulatory consultancy
  ["freightcourse.com", 7],        // commercial trade-education content
  ["newyorktruckingonline.com", 7],// commercial trucking-compliance content
  ["onewaybit.com", 7],            // commercial compliance content
  ["nyk.com", 7],                  // NYK Line — carrier corporate site
  ["atoshipping.com", 7],          // shipping company corporate site
  ["dromon.com", 7],               // Dromon Bureau of Shipping — NOT on the accredited-CAB allowlist, so T7
]);                                //   under-credits deliberately rather than mint T4 on an unverified signal

/** The class of a host that is ruled NEVER-REGISTERABLE, or null. An aggregator REPUBLISHES someone else's
 *  text and a hosting platform HOSTS it; either way the host is not the publisher, so minting it any tier
 *  would credit the republisher for the publisher's authority. A FACT span attributing to one of these is a
 *  RE-ATTRIBUTION instruction, not a registration backlog item — which is why the null-tier host flag must
 *  say something different about them (see summarizeNullTierAggregate). */
export type PermanentWorklistClass = "aggregator" | "platform";
export function permanentlyUnregisteredClass(host: string | null | undefined): PermanentWorklistClass | null {
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  if (LEGAL_AGGREGATOR.test(h)) return "aggregator";
  if (HOSTING_PLATFORM.test(h)) return "platform";
  return null;
}

/** THE register-at-grounding class tier for a host — the SC-13 codified rule EXTENDED with the ruled class table,
 *  or NULL (worklist) for an unrecognized/permanent-worklist host. Deterministic, pattern-based, no guess/default. */
export function classTierForHost(host: string | null | undefined): number | null {
  // PERMANENT WORKLIST FIRST — before the codified legal/gov rule, not after it. A republisher does not
  // acquire the publisher's authority by sitting on an authoritative TLD, so the never-register ruling has to
  // outrank every tier rule below it, not merely the academic one.
  if (permanentlyUnregisteredClass(host) != null) return null;
  const codified = codifiedTierForHost(host);
  if (codified != null) return codified; // legal 1 / gov 2 (conservative, unchanged)
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  const ruled = RULED_HOST_TIER.get(h);
  if (ruled != null) return ruled; // a ruling already made, recorded — not a rule inferred
  if (VERIFIER_CAB.test(h)) return 4;
  if (ACADEMIC_TLD.test(h)) return 4;
  if (ASSOCIATION_ALLOW.has(h)) return 4;
  if (STANDARDS_BODY_ALLOW.has(h)) return 4;
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
