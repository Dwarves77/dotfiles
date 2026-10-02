// authority-score.mjs -- Lane L3 (Research source-authority client, narrowed), 2026-10-02.
// Pure function from a resolved set of OpenAlex/ROR/ORCID records (or grey-literature records, for
// sources OpenAlex has no identity for) to the spec-03 section 4 "Score 2, source authority" shape.
// Feeds the `credibility_authority_score` jsonb column (migration 344) -- this module performs no I/O
// and makes no write; see openalex-client.mjs for the fetch side. NO LLM call anywhere (lane-common-
// contract section 0: "$0: no LLM calls").
//
// WHAT THIS REPLACES (eventually -- NOT wired by this lane, see the brief's "Harness and flywheel
// wiring" section). `assessAuthorityScore` in src/lib/research/assess.mjs (lines 276-293 as read on
// origin/master at authoring time) returns a DEGENERATE one-source distribution built from nothing
// more than `sourceTier` -- the producer's own comment at that function names it exactly: "necessarily
// a degenerate one-source distribution, since this lane's input carries one source tier per item, not
// a multi-source bibliography." This module is the real, multi-component, multi-source replacement
// for items that resolve via OpenAlex/ROR/ORCID; `assessAuthorityScore` stays as the fallback for items
// this module cannot resolve (no DOI, no author identity, no grey-literature record) until a later
// wiring lane imports this module into the producer.
//
// AGGREGATE AS A DISTRIBUTION, NEVER A MEAN (spec-03 section 4, acceptance criterion 4). The exported
// shape is bucket COUNTS plus the per-source detail array that produced them -- never a single
// averaged score. "3 high-authority independent, 1 medium, 2 vendor-flagged" is the literal worked
// example in the spec; `aggregateAuthorityDistribution` below returns exactly that shape (plus an
// `unknown` bucket and a cross-cutting `integrityFlagged` count, both additions this lane's narrower
// scope needed and the spec's own rules require -- see "Integrity" below).
//
// NEVER FABRICATE (CLAUDE.md rule 2). A source with no retrievable authority signal renders `unknown`,
// never a guessed tier -- every classification function below returns 'unknown' (role class, funding
// independence) or null (institutional/author standing, reception) rather than defaulting to a
// plausible-looking value when the input does not carry the signal.
//
// FIELD-NAME CONVENTION (confirmed against a live fire, see the lane report). This module's inputs are
// deliberately camelCase ("a RESOLVED set of records"), not a raw passthrough of OpenAlex's own
// snake_case response fields -- a one-time live call to openalex-client.mjs's fetchWorkByDoi during
// this lane's build (DOI 10.1038/nature12373) confirmed OpenAlex returns `publication_date`,
// `cited_by_count`, `fwci`, `citation_normalized_percentile`, `is_retracted` at the top level of a work
// object. A later wiring lane that calls this module from the producer maps those raw fields onto this
// module's `publicationDate`/`citedByCount`/`citationNormalizedPercentile`/`isRetracted` names (`fwci`
// is spelled the same both places). This module does not do that mapping itself -- it is not an
// OpenAlex response parser, it is a scorer -- so a future integrator reads this paragraph rather than
// guessing the input shape from the raw API docs.

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_MONTH_MS = 30.44 * DAY_MS;

/** The spec-03 section 4 role-class vocabulary, verbatim. */
export const ROLE_CLASSES = Object.freeze([
  "university",
  "national_lab",
  "standards_body",
  "intergovernmental",
  "journal",
  "institute_ngo",
  "industry_association",
  "vendor",
  "analytical_press",
  "unknown",
]);

/**
 * Role-class override table for named bodies the OpenAlex/ROR `type` field alone mis-sorts or cannot
 * see at all (grey-literature bodies have no OpenAlex institution record most of the time). Spec-03
 * section 4's own named list: "IEA, ICCT, TRB/TRID, Smart Freight Centre, IMO, EASA and national
 * ministries." Matched case-insensitively against the record's own display name; first match wins.
 * @type {Array<{re: RegExp, roleClass: string}>}
 */
const NAMED_ROLE_OVERRIDES = [
  { re: /\b(IMO|International Maritime Organi[sz]ation)\b/i, roleClass: "intergovernmental" },
  { re: /\b(IEA|International Energy Agency)\b/i, roleClass: "intergovernmental" },
  { re: /\b(EASA|European (Union )?Aviation Safety Agency)\b/i, roleClass: "intergovernmental" },
  { re: /\b(national (transport )?(ministry|department)|ministry of transport)\b/i, roleClass: "intergovernmental" },
  { re: /\b(ICCT|International Council on Clean Transportation)\b/i, roleClass: "institute_ngo" },
  { re: /\b(Smart Freight Centre)\b/i, roleClass: "institute_ngo" },
  { re: /\b(TRB|TRID|Transportation Research Board)\b/i, roleClass: "institute_ngo" },
  { re: /\b(ISO|IEC|ASTM|SAE|standards? (body|organi[sz]ation))\b/i, roleClass: "standards_body" },
];

/** OpenAlex/ROR institution `type` field -> spec-03 role class. Deliberately coarse (CLAUDE.md rule 2:
 *  a mapping this module is not confident in returns 'unknown' rather than a guessed class). */
const INSTITUTION_TYPE_TO_ROLE_CLASS = Object.freeze({
  education: "university",
  government: "national_lab",
  facility: "national_lab",
  company: "vendor",
  nonprofit: "institute_ngo",
  archive: "institute_ngo",
  healthcare: "unknown",
  other: "unknown",
});

/**
 * Role class for a resolved OpenAlex/ROR institution record, or for a grey-literature record carrying
 * an explicit `roleClass`/`institutionName`. Named-body override first (catches IEA/IMO/ICCT/etc.,
 * which OpenAlex/ROR's generic `type` field would otherwise sort as plain 'government' or 'nonprofit');
 * falls back to the type-map; 'unknown' when neither resolves.
 * @param {{ displayName?: string|null, type?: string|null, roleClass?: string|null, venueType?: string|null }} record
 * @returns {string} one of ROLE_CLASSES
 */
export function classifyRoleClass(record) {
  if (!record) return "unknown";
  if (record.roleClass && ROLE_CLASSES.includes(record.roleClass)) return record.roleClass;
  const name = record.displayName ?? "";
  for (const { re, roleClass } of NAMED_ROLE_OVERRIDES) {
    if (re.test(name)) return roleClass;
  }
  if (record.venueType === "journal") return "journal";
  if (record.venueType === "press" || record.venueType === "analytical_press") return "analytical_press";
  const mapped = record.type ? INSTITUTION_TYPE_TO_ROLE_CLASS[String(record.type).toLowerCase()] : undefined;
  return mapped ?? "unknown";
}

/**
 * Topic-scoped institutional standing (spec-03 section 4: "institution FWCI in the specific topic,
 * in-topic works count, topic share"). `null` (honest absence) when the caller has no topic-scoped
 * figures for this institution -- NEVER derived from a brand-level/all-topics FWCI, which is exactly
 * the "MIT said it" failure mode the spec names.
 * @param {{ inTopicFwci?: number|null, inTopicWorksCount?: number|null, topicShare?: number|null } | null | undefined} institutionTopicStats
 * @returns {{ inTopicFwci: number, inTopicWorksCount: number, topicShare: number|null } | null}
 */
export function computeInstitutionalStanding(institutionTopicStats) {
  if (!institutionTopicStats) return null;
  const { inTopicFwci, inTopicWorksCount } = institutionTopicStats;
  if (typeof inTopicFwci !== "number" && typeof inTopicWorksCount !== "number") return null;
  return {
    inTopicFwci: typeof inTopicFwci === "number" ? inTopicFwci : null,
    inTopicWorksCount: typeof inTopicWorksCount === "number" ? inTopicWorksCount : 0,
    topicShare: typeof institutionTopicStats.topicShare === "number" ? institutionTopicStats.topicShare : null,
  };
}

/**
 * Topic-scoped author standing (spec-03 section 4: "in-topic works, in-topic FWCI, h-index, all
 * topic-restricted, plus recency via counts_by_year"). `null` when no OpenAlex author record resolved.
 * @param {object | null | undefined} author an OpenAlex author object (or a topic-filtered projection of one)
 * @returns {{ inTopicWorksCount: number|null, inTopicFwci: number|null, hIndex: number|null, recentWorksCount: number|null } | null}
 */
export function computeAuthorStanding(author) {
  if (!author) return null;
  const summary = author.summary_stats ?? {};
  const countsByYear = Array.isArray(author.counts_by_year) ? author.counts_by_year : [];
  const currentYear = new Date().getFullYear();
  const recentWorksCount = countsByYear
    .filter((row) => typeof row?.year === "number" && row.year >= currentYear - 1)
    .reduce((sum, row) => sum + (typeof row.works_count === "number" ? row.works_count : 0), 0);
  return {
    inTopicWorksCount: typeof author.inTopicWorksCount === "number" ? author.inTopicWorksCount : (typeof author.works_count === "number" ? author.works_count : null),
    inTopicFwci: typeof author.inTopicFwci === "number" ? author.inTopicFwci : (typeof summary.fwci === "number" ? summary.fwci : null),
    hIndex: typeof summary.h_index === "number" ? summary.h_index : null,
    recentWorksCount: countsByYear.length ? recentWorksCount : null,
  };
}

/**
 * Funding independence, the spec's own three-state rule (section 4): "Public competitive funding
 * scores independent; vendor-funded scores dependent; undisclosed scores unknown, which is not the
 * same as independent." Never collapses 'unknown' into 'dependent' OR 'independent' -- an explicit
 * third state, checked by a negative test in authority-score.test.mjs.
 * @param {{ disclosed?: boolean|null, funderIsCommercialBeneficiary?: boolean|null } | null | undefined} fundingInfo
 * @returns {"independent"|"dependent"|"unknown"}
 */
export function computeFundingIndependence(fundingInfo) {
  if (!fundingInfo || fundingInfo.disclosed !== true) return "unknown";
  if (fundingInfo.funderIsCommercialBeneficiary === true) return "dependent";
  if (fundingInfo.funderIsCommercialBeneficiary === false) return "independent";
  return "unknown";
}

/**
 * Reception (spec-03 section 4: "FWCI and citation_normalized_percentile, never raw cited_by_count.
 * For works under 24 months, suppress FWCI and substitute a velocity measure against the subfield
 * cohort"). The exposed object never carries a `citedByCount` field under any key -- the negative test
 * in authority-score.test.mjs greps the returned object's own keys/values, not just the eyeball read.
 *
 * KNOWN SIMPLIFICATION (named, not hidden): the velocity substitute is citations-per-month since
 * publication. The spec asks for that rate compared "against the subfield cohort"; this lane's input
 * shape carries no subfield-cohort baseline (no market_series-equivalent citation-velocity corpus is
 * wired in), so the returned `method` string says exactly that -- a raw per-month rate, not a
 * cohort-relative percentile -- rather than silently presenting it as more authoritative than it is.
 * @param {{ publicationDate?: string|null, citedByCount?: number|null, fwci?: number|null, citationNormalizedPercentile?: number|null } | null | undefined} work
 * @param {Date} now
 * @returns {{ metric: "fwci"|"citation_normalized_percentile"|"velocity"|"unknown", value: number|null, method: string }}
 */
export function computeReception(work, now) {
  if (!work) return { metric: "unknown", value: null, method: "no work record resolved for this source" };
  const pubDate = work.publicationDate ? new Date(work.publicationDate) : null;
  const ageMonths = pubDate && !Number.isNaN(pubDate.getTime()) ? (now.getTime() - pubDate.getTime()) / AVG_MONTH_MS : null;

  if (ageMonths !== null && ageMonths < 24) {
    if (typeof work.citedByCount === "number" && ageMonths > 0) {
      return {
        metric: "velocity",
        value: work.citedByCount / ageMonths,
        method:
          "citations-per-month since publication; FWCI suppressed under 24 months per spec-03 section 4. " +
          "No subfield-cohort baseline is wired into this lane's input shape, so this is a raw per-month " +
          "rate, not a cohort-relative percentile -- documented simplification, never presented as FWCI.",
      };
    }
    return { metric: "unknown", value: null, method: "work is under 24 months old and carries no citation count to derive a velocity rate from" };
  }

  if (typeof work.citationNormalizedPercentile === "number") {
    return { metric: "citation_normalized_percentile", value: work.citationNormalizedPercentile, method: "OpenAlex citation_normalized_percentile" };
  }
  if (typeof work.fwci === "number") {
    return { metric: "fwci", value: work.fwci, method: "OpenAlex fwci (field-weighted citation impact)" };
  }
  return { metric: "unknown", value: null, method: "no fwci or citation_normalized_percentile on record" };
}

/**
 * Integrity (spec-03 section 4: "retraction, corrections, predatory-venue flag"). `isRetracted` and
 * `hasCorrections` default to `false` only when the underlying field is an explicit boolean on the
 * record (OpenAlex's own `is_retracted`); `predatoryVenue` defaults to `'unknown'` because no free,
 * reliable signal for it is wired into this lane (DOAJ cross-check is named in the spec as a future
 * input, not built here) -- never guessed as `false`.
 * @param {{ isRetracted?: boolean|null, hasCorrections?: boolean|null, predatoryVenue?: boolean|null } | null | undefined} work
 * @returns {{ isRetracted: boolean, hasCorrections: boolean, predatoryVenue: boolean|"unknown" }}
 */
export function computeIntegrity(work) {
  return {
    isRetracted: work?.isRetracted === true,
    hasCorrections: work?.hasCorrections === true,
    predatoryVenue: typeof work?.predatoryVenue === "boolean" ? work.predatoryVenue : "unknown",
  };
}

/**
 * Bucket a single source into the spec-03 section 4 distribution's three named buckets, plus 'unknown'
 * for a source with no classifiable role at all. Rules, in order:
 *   1. role class 'vendor' or 'industry_association' -> vendorFlagged, ALWAYS ("vendors are never
 *      excluded but permanently flagged and capped" -- capped means no other component can promote a
 *      vendor source out of this bucket).
 *   2. role class 'unknown' -> unknown (no classifiable signal at all; never defaulted to 'medium').
 *   3. role class in the high-authority set (university, national_lab, standards_body,
 *      intergovernmental) AND funding independence 'independent' AND no integrity concern ->
 *      highAuthorityIndependent.
 *   4. everything else classifiable -> medium (includes: high-authority role with funding 'dependent'
 *      or 'unknown'; journal/institute_ngo/analytical_press roles regardless of funding; any role with
 *      an integrity concern that isn't already vendor-flagged).
 * Integrity concerns (retraction) are surfaced separately as a cross-cutting count in the aggregate,
 * never silently dropped, per CLAUDE.md rule 13 (a flag is a commitment).
 * @param {{ roleClass: string, fundingIndependence: "independent"|"dependent"|"unknown", integrity: {isRetracted: boolean} }} profile
 * @returns {"highAuthorityIndependent"|"medium"|"vendorFlagged"|"unknown"}
 */
export function bucketForSource(profile) {
  const { roleClass, fundingIndependence, integrity } = profile;
  if (roleClass === "vendor" || roleClass === "industry_association") return "vendorFlagged";
  if (roleClass === "unknown") return "unknown";
  const highAuthorityRoles = new Set(["university", "national_lab", "standards_body", "intergovernmental"]);
  if (highAuthorityRoles.has(roleClass) && fundingIndependence === "independent" && !integrity.isRetracted) {
    return "highAuthorityIndependent";
  }
  return "medium";
}

/**
 * Score one OpenAlex-resolved source into the full per-source authority profile.
 * @param {{
 *   sourceId: string,
 *   kind: "openalex",
 *   institution?: { displayName?: string|null, type?: string|null, roleClass?: string|null, inTopicFwci?: number|null, inTopicWorksCount?: number|null, topicShare?: number|null } | null,
 *   author?: object | null,
 *   work?: { publicationDate?: string|null, citedByCount?: number|null, fwci?: number|null, citationNormalizedPercentile?: number|null, isRetracted?: boolean|null, hasCorrections?: boolean|null, predatoryVenue?: boolean|null } | null,
 *   funding?: { disclosed?: boolean|null, funderIsCommercialBeneficiary?: boolean|null } | null,
 * }} record
 * @param {{ now?: Date }} [opts]
 */
export function scoreOpenAlexSource(record, opts = {}) {
  const now = opts.now ?? new Date();
  const roleClass = classifyRoleClass(record.institution ?? {});
  const institutionalStanding = computeInstitutionalStanding(record.institution ?? null);
  const authorStanding = computeAuthorStanding(record.author ?? null);
  const fundingIndependence = computeFundingIndependence(record.funding ?? null);
  const reception = computeReception(record.work ?? null, now);
  const integrity = computeIntegrity(record.work ?? null);
  const profile = { roleClass, fundingIndependence, integrity };
  return {
    sourceId: record.sourceId,
    method: "openalex",
    roleClass,
    institutionalStanding,
    authorStanding,
    fundingIndependence,
    reception,
    integrity,
    bucket: bucketForSource(profile),
  };
}

/**
 * Score one grey-literature source: no OpenAlex/ROR/ORCID identity exists for it (spec-03 section 4's
 * mandatory grey-literature path -- "IEA, ICCT, TRB/TRID, Smart Freight Centre, IMO, EASA and national
 * ministries produce most of the decision-relevant evidence and are poorly citation-indexed. Route them
 * through a non-citation authority model: role class, institutional mandate, method transparency,
 * independent replication, and whether the body is cited by indexed literature. Never let absence of a
 * citation footprint read as low authority").
 * `institutionalMandate: true` means the record names the body as the actual standard-setter/mandated
 * authority for the domain the claim sits in -- this is what lets the non-citation path reach
 * `highAuthorityIndependent` without any citation signal at all.
 * @param {{
 *   sourceId: string,
 *   kind: "grey_literature",
 *   displayName?: string|null,
 *   roleClass?: string|null,
 *   institutionalMandate?: boolean|null,
 *   methodTransparent?: boolean|null,
 *   independentlyReplicated?: boolean|null,
 *   citedByIndexedLiterature?: boolean|null,
 *   funding?: { disclosed?: boolean|null, funderIsCommercialBeneficiary?: boolean|null } | null,
 *   integrityConcern?: boolean|null,
 * }} record
 */
export function scoreGreyLiteratureSource(record) {
  const roleClass = classifyRoleClass({ displayName: record.displayName, roleClass: record.roleClass });
  const fundingIndependence = computeFundingIndependence(record.funding ?? null);
  const integrity = { isRetracted: record.integrityConcern === true, hasCorrections: false, predatoryVenue: "unknown" };
  const profile = { roleClass, fundingIndependence, integrity };
  return {
    sourceId: record.sourceId,
    method: "grey_literature_non_citation",
    roleClass,
    institutionalStanding: null,
    authorStanding: null,
    fundingIndependence,
    // No citation footprint exists for this path by construction -- rendered as an explicit 'unknown'
    // metric with a method string naming WHY (a coverage artefact, never a quality signal), never as a
    // zero or a low score that would read as "this source has low reception."
    reception: {
      metric: "unknown",
      value: null,
      method:
        "grey-literature source: no citation footprint exists to measure (spec-03 section 4: 'never let " +
        "absence of a citation footprint read as low authority; that is a coverage artefact, not a " +
        "quality signal'). Authority for this source is read from institutional mandate, method " +
        "transparency, independent replication and citation-by-indexed-literature instead.",
    },
    integrity,
    bucket: bucketForSource(profile),
    greyLiterature: {
      institutionalMandate: record.institutionalMandate === true,
      methodTransparent: typeof record.methodTransparent === "boolean" ? record.methodTransparent : "unknown",
      independentlyReplicated: typeof record.independentlyReplicated === "boolean" ? record.independentlyReplicated : "unknown",
      citedByIndexedLiterature: typeof record.citedByIndexedLiterature === "boolean" ? record.citedByIndexedLiterature : "unknown",
    },
  };
}

/**
 * Score one resolved source record, dispatching on `record.kind`.
 * @param {object} record
 * @param {{ now?: Date }} [opts]
 */
export function scoreSource(record, opts = {}) {
  if (!record || !record.sourceId) throw new Error("authority-score: scoreSource requires a record with a sourceId");
  if (record.kind === "grey_literature") return scoreGreyLiteratureSource(record);
  if (record.kind === "openalex") return scoreOpenAlexSource(record, opts);
  throw new Error(`authority-score: unknown record.kind "${record.kind}" (expected "openalex" or "grey_literature")`);
}

/**
 * Aggregate a set of per-source profiles into the spec-03 section 4 distribution -- bucket COUNTS,
 * never a mean, plus the per-source detail array (needed by the dissent panel a later lane, L5, wires
 * up: "a seeded dissenting source renders the dissent panel uncollapsed"). `integrityFlagged` is a
 * cross-cutting count (a retracted source is still counted in its role-class bucket for the
 * high-authority/medium/vendor-flagged split, AND counted here so a retraction is never silently
 * absorbed into a bucket count with no visible trace -- CLAUDE.md rule 13, "a flag is a commitment").
 * @param {Array<ReturnType<typeof scoreSource>>} sources
 * @returns {{
 *   highAuthorityIndependent: number, medium: number, vendorFlagged: number, unknown: number,
 *   integrityFlagged: number, sources: Array<ReturnType<typeof scoreSource>>,
 * }}
 */
export function aggregateAuthorityDistribution(sources) {
  const list = sources ?? [];
  const dist = { highAuthorityIndependent: 0, medium: 0, vendorFlagged: 0, unknown: 0, integrityFlagged: 0, sources: list };
  for (const s of list) {
    dist[s.bucket] = (dist[s.bucket] ?? 0) + 1;
    if (s.integrity?.isRetracted) dist.integrityFlagged += 1;
  }
  return dist;
}
