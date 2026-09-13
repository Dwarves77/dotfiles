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
// Curated legal-publisher allowlist (defect D14, docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12):
// each host IS the official publisher of that jurisdiction's enacted law / official gazette -- the SAME
// "enacted primary legal text" class LEGAL_PRIMARY above already codifies for
// legislation.gov.uk/eur-lex.europa.eu/federalregister.gov/ecfr.gov/govinfo.gov -> T1. Curated, never a
// fuzzy country-TLD or gov-label rule: a jurisdiction's LAW PORTAL is a distinct institution from its
// ministries (T2, GOV_TLD below), a distinction that matters here because several of these hosts sit on a
// hostname the GOV_TLD label rule below would otherwise also match (legifrance.gouv.fr has a "gouv" label,
// wetten.overheid.nl has an "overheid" label) -- checked FIRST in codifiedTierForHost, same "legal beats
// gov" order as the standing legislation.gov.uk-vs-gov.uk precedent, so the more specific T1 institution
// always wins over the coarser T2 stem.
const LEGAL_PUBLISHER_ALLOW = new Set([
  "irishstatutebook.ie",     // Irish Statute Book, Office of the Attorney General
  "legifrance.gouv.fr",      // Legifrance
  "gesetze-im-internet.de",  // German federal law, Federal Ministry of Justice
  "retsinformation.dk",      // Danish legal information
  "wetten.overheid.nl",      // Dutch legislation
  "boe.es",                  // Spanish official gazette
  "normattiva.it",           // Italian legislation
  "lovdata.no",              // Norwegian legislation
  "finlex.fi",               // Finnish legislation
  "legislation.gov.au",      // Australian federal legislation
  "laws-lois.justice.gc.ca", // Canadian federal legislation
  "fedlex.admin.ch",         // Swiss federal law
  "ris.bka.gv.at",           // Austrian legal information system
  // D14 residue ruling (coordinator, 2026-09-13, defect-fix-plan-2026-09-12.md D14, "Residue ruling",
  // rule 1): "the host allowlist gains the 17 the artifact names with their institutions" -- the 12
  // named literally plus 5 more the artifact's names surface as the same class (LegisQuebec, the Slovak
  // and Slovenian official gazettes, and the Nevada/Florida legislature statute portals), each of which
  // the general name-keyword rule below (RESIDUE_LEGAL_WORDS) either cannot derive on its own (Law
  // Wales's and Gazette officielle du Quebec's own recorded names use none of those words) or duplicates
  // for a curated, traceable record.
  "bclaws.gov.bc.ca",                // BC Laws (Queen's Printer / Official Gazette for BC Statutes)
  "dre.pt",                          // Diario da Republica Eletronico -- Portugal's official gazette
  "e-sbirka.cz",                     // e-Sbirka -- Czech Official Gazette / Collection of Laws
  "gazzettaufficiale.it",            // Gazzetta Ufficiale della Repubblica Italiana
  "law.gov.wales",                   // Law Wales -- Legislation of Wales Portal
  "laws.yukon.ca",                   // Yukon Legislation Registry
  "legilux.public.lu",               // Memorial -- Official Gazette of the Grand Duchy of Luxembourg
  "legislation.mt",                  // Laws of Malta -- Official Consolidated Legislation Portal
  "magyarkozlony.hu",                // Magyar Kozlony -- Hungarian Official Gazette
  "narodne-novine.nn.hr",            // Narodne novine -- Official Gazette of the Republic of Croatia
  "njt.hu",                          // Nemzeti Jogszabalytar -- Hungarian National Legal Register
  "publicationsduquebec.gouv.qc.ca", // Gazette officielle du Quebec
  "leg.state.nv.us",                 // Nevada Legislature -- Nevada Revised Statutes
  "leg.state.fl.us",                 // Florida Legislature -- Online Sunshine (Statutes & Session Laws)
  "legisquebec.gouv.qc.ca",          // LegisQuebec -- official consolidation of Quebec statutes
  "slov-lex.sk",                     // SLOV-LEX -- Slovak legislative portal / official gazette
  "uradni-list.si",                  // Uradni list Republike Slovenije -- Official Gazette of Slovenia
]);
// Intergovernmental / official bodies acting in an authoritative capacity -> T2.
// `unesco.org` added 2026-08-11 (UN specialised agency — the same class as un.org, already listed).
const GOV_INTERGOV = /(^|\.)(europa\.eu|un\.org|unesco\.org|oecd\.org|imo\.org|icao\.int|iea\.org|who\.int|wto\.org|unfccc\.int|worldbank\.org|ipcc\.ch)$/;
// Government second-level label list (defect D14, docs/plans/defect-fix-plan-2026-09-12.md): a
// government stem registrable AS the label directly under a two-letter country-code TLD (gov.uk) or as
// the label a subdomain registers under (service.gov.uk) -> T2. The list started at
// gov/gob/gouv/govt/go/gc (2026-07-13 SC-13 extension) and is widened here with the labels the 489-row
// pending-provisional audit surfaced (2026-09-12): `gv` (Austria, bmluk.gv.at -- one of the D13-evidence
// hosts rule c wrongly rejected), `admin` (Switzerland), `bund` (Germany), `overheid` (Netherlands),
// `gouvernement` (France), `regeringen` (Sweden/Denmark/Norway), `riksdagen` (Sweden). The suffix is
// EXACTLY two letters, never 2-3: every real ISO 3166-1 alpha-2 ccTLD is exactly two letters, so widening
// to three would only ever admit a commercial gTLD lookalike (gov.com, admin.info), never a real country
// -- this closes the exact hole the pre-D14 `[a-z]{2,3}` width left open (a `gov` label ending in a
// 3-letter TLD would have matched a lookalike). `(^|\.)` so both the bare registrable domain (gov.uk) and
// a subdomain (service.gov.uk, assets.publishing.service.gov.uk) match; a lookalike like
// `gov.example.com` never matches either form, since "example.com" is not itself a two-letter suffix.
const GOV_LABELS = ["gov", "gouv", "gob", "gc", "go", "gv", "govt", "admin", "bund", "overheid", "gouvernement", "regeringen", "riksdagen"];
const GOV_LABEL_UNDER_CC_TLD = new RegExp(`(^|\\.)(${GOV_LABELS.join("|")})\\.[a-z]{2}$`);
// Government / regulator TLD stems -> T2 (regulator-guidance authority): the bare US-style `.gov` TLD
// (no country suffix), the generalized government-label-under-country-TLD rule above (subsumes the prior
// explicit `gc\.ca$`/`go\.[a-z]{2}$` special cases -- `gc` and `go` are now list entries), plus
// `canada.ca` (added 2026-08-11: the Government of Canada's SINGLE official web presence (the GoC
// consolidated its departments onto it), so it is a government stem in fact though it carries no gov
// label under it, a full-domain exception, not a label-under-TLD pattern, so it stays a separate
// alternative rather than a GOV_LABELS entry).
const GOV_TLD = new RegExp(`(^|\\.)gov$|${GOV_LABEL_UNDER_CC_TLD.source}|(^|\\.)canada\\.ca$`);

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
  // Defect D14: LEGAL_PUBLISHER_ALLOW is checked in the SAME branch as LEGAL_PRIMARY, before GOV_TLD --
  // several of its hosts (legifrance.gouv.fr, wetten.overheid.nl) also carry a GOV_LABEL_UNDER_CC_TLD
  // label, so T1 must win here, the same "legal beats gov" order legislation.gov.uk already relies on.
  if (LEGAL_PRIMARY.test(h) || LEGAL_PUBLISHER_ALLOW.has(h)) return 1;
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
  // D14 residue ruling (2026-09-13, rule 3): ACEA's own recorded names ("ACEA -- European Automobile
  // Manufacturers", "ACEA / HDV CO2 Amendment Industry Statement") never spell out the word
  // "Association" the abbreviation stands for, so the general name-keyword rule below cannot derive it
  // -- curated, same posture as the entries above.
  "acea.auto", // European Automobile Manufacturers' Association
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
/** Big-4 / advisory-firm hosts (D14 residue ruling, 2026-09-13, rule 6) → T6, the SAME class as ANALYSIS
 *  above: corporate advisory commentary, not an independent analysis body. Anchored per-label (unlike
 *  ANALYSIS's loose substrings above) because several of these stems (ey, bcg) are too short to risk as
 *  an unanchored substring match. */
const BIG4_ADVISORY_HOST = /(^|\.)(pwc|deloitte|ey|kpmg|mckinsey|bcg|bain|accenture|guidehouse|rolandberger)\.[a-z.]+$/;
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

// ── D14 RESIDUE RULING (coordinator, 2026-09-13, defect-fix-plan-2026-09-12.md D14, "Residue ruling") ──
// From the enumerate-unclassified-hosts artifact (628 hosts, 672 rows, run 34728958591, after PR #657
// landed D14 part 1): a name-keyword tally over the stored registry NAMES classified 147 as government
// bodies, 17 as legal publishers, 76 as associations/standards bodies, 23 as news/press, 2 as academic,
// leaving 363 corporate or unnamed. This block codifies that tally into the 8 deterministic rules below,
// run in this FIXED precedence, over the stored registry NAME plus the host -- never a model guess
// (SC-13, source-credibility-model SKILL.md Section 3). It is a FALLBACK ONLY: every existing curated
// allowlist / pattern above (LEGAL_PRIMARY, LEGAL_PUBLISHER_ALLOW, GOV_INTERGOV/GOV_TLD, RULED_HOST_TIER,
// VERIFIER_CAB, ACADEMIC_TLD, ASSOCIATION_ALLOW, STANDARDS_BODY_ALLOW, ANALYSIS, BIG4_ADVISORY_HOST,
// LAWFIRM, NEWS) is checked by classTierForHost FIRST -- this block only runs for a host none of them
// resolve. `name` is the ONE stored registry name for the row being decided (resolve-provisional-
// sources.mjs and enumerate-unclassified-hosts.mjs thread their own row's `name` column here; a caller
// with no name available passes none, and only the host-based branches below can then fire -- never a
// behaviour change for a caller that does not thread a name).

/** Lowercases and strips combining diacritics (Közlöny -> kozlony, Mémorial -> memorial, Ministère ->
 *  ministere) so the word lists below need only their base-Latin spelling. */
function normalizeRegistryName(name: string | null | undefined): string {
  return String(name || "")
    .normalize("NFKD")
    .replace(new RegExp(String.fromCharCode(91,0x0300,45,0x036f,93), "g"), "")
    .toLowerCase();
}

/** Whole word / whole multi-word phrase match on already-normalized text -- `phrase` must sit on a
 *  non-alphanumeric boundary at both ends, so "council" never matches inside "councillor" and "news"
 *  never matches inside "newsroom" (SC-13's no-guess posture extends to no over-matching a substring). */
function nameHasWord(text: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(text);
}
function nameHasAnyWord(text: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => nameHasWord(text, p));
}

// Rule 1 (T1, legal publisher): the curated 17-host allowlist for this class lives in the EXISTING
// LEGAL_PUBLISHER_ALLOW set above (checked well before this block ever runs); this is the GENERAL
// fallback for a not-yet-curated official-gazette / consolidated-statutes host, derived from its name.
const RESIDUE_LEGAL_WORDS: readonly string[] = [
  "official gazette", "official journal", "legislation registry", "statutes", "laws of", "legal register",
  "journal officiel", "diario oficial", "gazzetta ufficiale", "sbirka", "kozlony", "narodne novine", "memorial",
];

// Rule 2 (T4, academic): the existing .edu/.ac TLD rule (ACADEMIC_TLD above) is checked first; this adds
// a name-derived signal for an academic host on any other TLD.
const RESIDUE_ACADEMIC_WORDS: readonly string[] = [
  "college", "polytechnic", "academy of sciences", "research institute",
];
// "universit" is a deliberate stem (not a whole word): it PREFIX-matches "university", "universite"
// (Universite, normalized from Université), "universitat", "universita", "universiteit" etc. in one
// pattern, since a whole-word match would miss every non-English inflection.
const UNIVERSITY_PREFIX = /(?:^|[^a-z0-9])universit/;

// Rule 3 (T4, association / standards body): the existing curated allowlists (ASSOCIATION_ALLOW,
// STANDARDS_BODY_ALLOW above) are checked first ("the existing curated allowlists stay first"); this is
// the general name-keyword fallback. "council" is handled separately below -- it is an association word
// ONLY when the host is not ALSO a government host by rule 4 (a "county council" or "city council" is
// government, not an association).
const RESIDUE_ASSOCIATION_WORDS: readonly string[] = [
  "association", "federation", "alliance", "consortium", "chamber of commerce", "standards",
  "normalisation", "institute of",
];

// Rule 4 (T2, government): a host-label branch and a name-noun branch, with the think-tank exclusion
// carved out of BOTH (a think tank is not a government body even when it sits on a name that would
// otherwise match, or -- vanishingly rarely -- a host that would otherwise match).
//
// Host-label branch: "the host carries a gov, gouv, gob, gc, govt or parliament label anywhere" -- wider
// than the existing GOV_LABEL_UNDER_CC_TLD rule above, which anchors on an EXACT two-letter ccTLD suffix
// (gov.uk, admin.ch) and so never reaches a real government host on a longer vanity suffix (gov.scot,
// gov.wales -- Scotland's and Wales's own geographic TLDs, not two-letter country codes). "Anywhere" is
// bounded, not literal substring matching: the label must be the SECOND-TO-LAST dot-separated segment
// (immediately followed by exactly one more segment to the end of the host), and that trailing segment
// must NOT be one of the well-known generic top-level domains in RESIDUE_GENERIC_TLD_EXCLUDE below --
// this is exactly what keeps D14's own required negatives refused (attacker.gov.com, bund.info: "gov"/
// "bund" sit immediately before a real but GENERIC gTLD, never a jurisdiction) while accepting gov.scot,
// gov.wales and commonslibrary.parliament.uk (their trailing segment is a real, non-generic suffix).
// gov.example.com stays refused for a DIFFERENT structural reason: "gov" there is the THIRD-from-last
// segment (two segments, "example" and "com", follow it), never the second-to-last.
const RESIDUE_GOV_HOST_LABELS: readonly string[] = ["gov", "gouv", "gob", "gc", "govt", "parliament"];
const RESIDUE_GOV_LABEL_ANYWHERE = new RegExp(`(^|\\.)(${RESIDUE_GOV_HOST_LABELS.join("|")})\\.([a-z]+)$`);
const RESIDUE_GENERIC_TLD_EXCLUDE = new Set([
  "com", "net", "org", "info", "biz", "io", "co", "edu", "gov", "mil", "int", "name", "pro", "app", "dev",
]);
function residueGovHostLabelMatch(host: string): boolean {
  const m = RESIDUE_GOV_LABEL_ANYWHERE.exec(host);
  return m != null && !RESIDUE_GENERIC_TLD_EXCLUDE.has(m[3]);
}

// Name-noun branch: "ministry and its French, Spanish, Portuguese, Italian, Dutch, German, Romanian and
// Scandinavian forms" plus the fixed institutional-noun list from the ruling text.
const RESIDUE_GOV_NOUN_WORDS: readonly string[] = [
  "ministry", "ministerio", "ministerium", "ministerie", "ministero", "ministere", "ministerul", "ministerstvo",
  "departementet", // Swedish/Norwegian ministry-equivalent ("Miljodepartementet" etc.)
  "department of", "government", "agency", "authority", "commission", "office of", "bureau", "parliament",
  "legislature", "assembly", "senate", "regulator", "inspectorate", "directorate", "secretariat",
  "municipality", "county", "city of", "port authority", "customs", "revenue", "treasury", "central bank",
  "environment agency", "emissions authority", "environment corporation",
  // Fix round 1 for L9b (review-l9b.md finding F2, defect-fix-plan-2026-09-12.md D14): the "council"
  // carve-out below already routes "county council" to government via the bare "county" noun, but a
  // "city council" (a real city government's legislative body, e.g. Philadelphia's) had no matching noun
  // -- "city of" is a different phrase. These seven explicit "<noun> council" phrases close that gap;
  // "council on" (a think tank, e.g. "Council on Foreign Relations") stays excluded below.
  "city council", "county council", "borough council", "town council", "regional council",
  "district council", "municipal council",
];
// "A think tank is not a government body": these words route to rule 6 (analysis) BEFORE rule 4 fires,
// for both the host-label and the name-noun branch.
const RESIDUE_THINK_TANK_WORDS: readonly string[] = [
  "center for", "centre for", "institute for", "council on", "foundation",
];
function residueGovernmentTier(host: string, normName: string): number | null {
  if (nameHasAnyWord(normName, RESIDUE_THINK_TANK_WORDS)) return null;
  if (residueGovHostLabelMatch(host)) return 2;
  if (nameHasAnyWord(normName, RESIDUE_GOV_NOUN_WORDS)) return 2;
  return null;
}

// Rule 3's "council" carve-out lives here (needs residueGovernmentTier, defined just above): "council"
// counts as an association word only when the host is NOT a government host by rule 4 AND the name is
// not itself a think-tank name. The second guard is fix round 1 for L9b (review-l9b.md finding F2): a
// bare `residueGovernmentTier(...) == null` is ALSO true for "Council on Foreign Relations" (its "council
// on" phrase is itself a think-tank word, so residueGovernmentTier returns null via ITS OWN think-tank
// exclusion) -- without checking the think-tank words directly here too, that name would wrongly resolve
// association (T4) via the "council" carve-out instead of falling through to analysis (T6), where the
// SAME "council on" phrase is also listed in RESIDUE_ANALYSIS_WORDS.
function residueAssociationTier(normName: string, host: string): number | null {
  if (nameHasAnyWord(normName, RESIDUE_ASSOCIATION_WORDS)) return 4;
  if (nameHasWord(normName, "council")) {
    if (nameHasAnyWord(normName, RESIDUE_THINK_TANK_WORDS)) return null;
    if (residueGovernmentTier(host, normName) == null) return 4;
  }
  return null;
}

// Rule 5 (T7, news/press): a corporate press room ("newsroom", "press release", "media information") is
// rule 7 (company), never news -- checked first so "press"/"media" inside one of those phrases cannot
// leak a false news classification.
const RESIDUE_NEWS_WORDS: readonly string[] = [
  "news", "times", "post", "herald", "magazine", "daily", "weekly", "press", "media", "broadcast", "tribune",
];
const RESIDUE_CORPORATE_PRESSROOM_WORDS: readonly string[] = ["newsroom", "press release", "media information"];
function residueNewsTier(host: string, normName: string): number | null {
  if (nameHasAnyWord(normName, RESIDUE_CORPORATE_PRESSROOM_WORDS)) return null;
  if (nameHasAnyWord(normName, RESIDUE_NEWS_WORDS)) return 7;
  if (/\.news$/.test(host)) return 7;
  return null;
}

// Rule 6 (T6, analysis): the Big-4/advisory HOST check lives in the existing BIG4_ADVISORY_HOST pattern
// above (checked well before this block runs); this is the name-derived fallback.
const RESIDUE_ANALYSIS_WORDS: readonly string[] = [
  "center for", "centre for", "institute for", "council on", "foundation", "think tank", "research",
  "analysis", "consulting", "advisory", "insight",
];
function residueAnalysisTier(normName: string): number | null {
  return nameHasAnyWord(normName, RESIDUE_ANALYSIS_WORDS) ? 6 : null;
}

// Rule 7 (T7, company -- new class): any host with a stored name and no rule 1-6 match. Its own site is
// a primary only for its own announcements (market-signal corroboration counting) and never passes an
// authority floor; T7 weight 0 in the citation network (same posture as LAWFIRM/NEWS above). This class
// exists so a corporate host stops being a worklist question -- a mis-tier here under-credits and never
// over-credits (the same conservative guarantee every sub-floor class in this file already carries).
//
// Rule 8 (worklist): stays only for a host with NO stored name at all -- the true residue.
export type ResidueRuleId =
  | "legal" | "academic" | "association" | "government" | "news" | "analysis" | "company" | "worklist";
export interface ResidueClassification {
  tier: number | null;
  rule: ResidueRuleId;
}

/** Pure, per-host-and-name classification under the 8 D14 residue rules, in their fixed precedence.
 *  Exported (in addition to being folded into classTierForHost below) so a caller can assert WHICH rule
 *  fired, not merely the resulting tier -- the plan's own precedence proof ("a legal publisher with
 *  'government' in its name is T1; a think tank with 'institute for' is T6 not T2") needs that. */
export function classifyResidueRuling(host: string | null | undefined, name?: string | null): ResidueClassification {
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  const normName = normalizeRegistryName(name);
  if (h) {
    if (nameHasAnyWord(normName, RESIDUE_LEGAL_WORDS)) return { tier: 1, rule: "legal" };
    if (nameHasAnyWord(normName, RESIDUE_ACADEMIC_WORDS) || UNIVERSITY_PREFIX.test(normName)) {
      return { tier: 4, rule: "academic" };
    }
    const association = residueAssociationTier(normName, h);
    if (association != null) return { tier: association, rule: "association" };
    const government = residueGovernmentTier(h, normName);
    if (government != null) return { tier: government, rule: "government" };
    const news = residueNewsTier(h, normName);
    if (news != null) return { tier: news, rule: "news" };
    const analysis = residueAnalysisTier(normName);
    if (analysis != null) return { tier: analysis, rule: "analysis" };
  }
  if (name != null && String(name).trim() !== "") return { tier: 7, rule: "company" };
  return { tier: null, rule: "worklist" };
}

/** Every curated allowlist / pattern check that is HOST-ONLY (no stored NAME involved), in their fixed
 *  precedence, shared by `classTierForHost` (single name) and `classTierForHostAcrossNames` (F1 fix,
 *  below) so the two never drift out of sync with each other. Returns the tier these host-only rules
 *  resolve, or null when none of them fire (the residue ruling, over the NAME(S), decides from there).
 *  These checks are already order-independent with respect to any stored name, by construction -- they
 *  never read `name` at all -- so F1's "same host, name order should not matter" fix only ever needs to
 *  apply to the residue-ruling fallback underneath this. */
function preResidueTierForHost(host: string | null | undefined): number | null {
  // PERMANENT WORKLIST FIRST — before the codified legal/gov rule, not after it. A republisher does not
  // acquire the publisher's authority by sitting on an authoritative TLD, so the never-register ruling has to
  // outrank every tier rule below it, not merely the academic one.
  // PERMANENT WORKLIST is intentionally NOT checked here (moved to a separate, explicit check in
  // classTierForHost/classTierForHostAcrossNames below) -- this function's `null` return means "no
  // host-only rule resolved a tier, the residue ruling over the NAME(S) may still decide", a DIFFERENT
  // meaning from "permanently blocked, never resolve at all regardless of name". Folding the two into
  // one null very nearly shipped a real regression during the F1 fix round: a permanently-unregistered
  // aggregator/hosting-platform host WITH a stored name would incorrectly fall through to rule 7
  // (company) instead of staying null, since company fires for "any host with a stored name and no rule
  // 1-6 match" -- caught by re-running the fixture table-driven test before committing, never shipped.
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
  if (ANALYSIS.test(h) || BIG4_ADVISORY_HOST.test(h)) return 6;
  if (LAWFIRM.test(h) || NEWS.test(h)) return 7;
  return null;
}

/** THE register-at-grounding class tier for a host -- the SC-13 codified rule EXTENDED with the ruled class
 *  table and, as a final fallback, the D14 residue ruling over the stored registry NAME (2026-09-13) -- or
 *  NULL (worklist) for a host none of them resolve. Deterministic, pattern-based, no guess/default.
 *  `name` is optional and additive: every existing caller that does not pass one keeps its exact prior
 *  behaviour, since the residue-ruling fallback only ever WIDENS what resolves, never narrows it.
 *  Single-name form: a caller with only ONE name in scope (or none) for this host and this decision. A
 *  caller that sees MULTIPLE stored names for the SAME host in one run (e.g. resolve-provisional-
 *  sources.mjs, several provisional_sources/sources rows citing the same institution under different
 *  names) should use `classTierForHostAcrossNames` instead (fix round 1 for L9b, finding F1) so the
 *  decision does not depend on which row happens to be processed first. */
export function classTierForHost(host: string | null | undefined, name?: string | null): number | null {
  // PERMANENT WORKLIST FIRST, and an unconditional early return -- before even the residue ruling's own
  // rule 7 (company), which would otherwise mint a republisher/hosting-platform host a tier just because
  // it happens to carry a stored name (a name does not make a republisher the publisher).
  if (permanentlyUnregisteredClass(host) != null) return null;
  const pre = preResidueTierForHost(host);
  if (pre != null) return pre;
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  // D14 residue ruling (2026-09-13): the 8-rule fallback over the stored registry NAME + host, reached
  // only when every curated allowlist/pattern above already declined to classify this host.
  return classifyResidueRuling(h, name).tier;
}

/** The D14 residue ruling's 8 rules, ordered by precedence (1 = most authoritative). Used only to
 *  compare outcomes ACROSS several names for the SAME host (F1 fix); the single-name path
 *  (`classTierForHost`/`classifyResidueRuling`) never needs this, since its own if/else chain already
 *  IS the precedence for one name. */
const RESIDUE_RULE_PRECEDENCE: Readonly<Record<ResidueRuleId, number>> = {
  legal: 1,
  academic: 2,
  association: 3,
  government: 4,
  news: 5,
  analysis: 6,
  company: 7,
  worklist: 8,
};

/** Fix round 1 for L9b (review-l9b.md finding F1, defect-fix-plan-2026-09-12.md D14): the class decision
 *  for a host is computed ONCE PER RUN over the union of every stored name the run sees for that host,
 *  taking the rule with the LOWEST number (most authoritative) among the rules any of its names
 *  satisfies -- never the first-processed row's name alone, which made `resolve-provisional-
 *  sources.mjs`'s per-row loop order-dependent (the SAME host could permanently register at T7/company
 *  or T2/government depending purely on which of its several recorded citation names was processed
 *  first). Host-only checks (`preResidueTierForHost`) are unaffected by this fix by construction -- they
 *  never read a name at all, so they are already order-independent -- and are checked first, exactly as
 *  in `classTierForHost`. `names` may be empty, one, or many; an empty/absent list degrades to the
 *  single "no name" residue decision, the same as `classTierForHost(host)`. */
export function classTierForHostAcrossNames(
  host: string | null | undefined,
  names?: ReadonlyArray<string | null | undefined> | null,
): number | null {
  // PERMANENT WORKLIST FIRST, and an unconditional early return -- see the identical guard and comment
  // in classTierForHost above (the same regression this fix pre-empts: a republisher/hosting-platform
  // host must stay null regardless of ANY of its names, not just the first one checked).
  if (permanentlyUnregisteredClass(host) != null) return null;
  const pre = preResidueTierForHost(host);
  if (pre != null) return pre;
  const h = String(host || "").replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  const candidates = names && names.length ? names : [undefined];
  let bestTier: number | null = null;
  let bestRank = Infinity;
  for (const name of candidates) {
    const { tier, rule } = classifyResidueRuling(h, name);
    const rank = RESIDUE_RULE_PRECEDENCE[rule];
    if (rank < bestRank) {
      bestRank = rank;
      bestTier = tier;
    }
  }
  return bestTier;
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
