// authority-score.test.mjs -- fixture-based, zero network, zero DB credential (lane L3 brief, "Tests,
// and the fire-once requirement"). Pure-function tests only; nothing here touches openalex-client.mjs's
// fetch path.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRoleClass,
  computeInstitutionalStanding,
  computeAuthorStanding,
  computeFundingIndependence,
  computeReception,
  computeIntegrity,
  bucketForSource,
  scoreOpenAlexSource,
  scoreGreyLiteratureSource,
  scoreSource,
  aggregateAuthorityDistribution,
  ROLE_CLASSES,
} from "./authority-score.mjs";

// ── role class ───────────────────────────────────────────────────────────────────────────────────────

test("classifyRoleClass maps OpenAlex/ROR institution types onto the spec vocabulary", () => {
  assert.equal(classifyRoleClass({ type: "education" }), "university");
  assert.equal(classifyRoleClass({ type: "company" }), "vendor");
  assert.equal(classifyRoleClass({ type: "nonprofit" }), "institute_ngo");
  assert.equal(classifyRoleClass({ type: "facility" }), "national_lab");
});

test("classifyRoleClass returns unknown for an unmapped type, never a guess", () => {
  assert.equal(classifyRoleClass({ type: "healthcare" }), "unknown");
  assert.equal(classifyRoleClass({}), "unknown");
  assert.equal(classifyRoleClass(null), "unknown");
});

test("classifyRoleClass applies named-body overrides for grey-literature institutions OpenAlex's generic type would mis-sort", () => {
  assert.equal(classifyRoleClass({ displayName: "International Maritime Organization", type: "government" }), "intergovernmental");
  assert.equal(classifyRoleClass({ displayName: "International Energy Agency" }), "intergovernmental");
  assert.equal(classifyRoleClass({ displayName: "International Council on Clean Transportation", type: "nonprofit" }), "institute_ngo");
});

test("classifyRoleClass honors an explicit roleClass field over any inference", () => {
  assert.equal(classifyRoleClass({ type: "company", roleClass: "standards_body" }), "standards_body");
});

test("ROLE_CLASSES carries the spec's exact nine-plus-unknown vocabulary", () => {
  for (const r of ["university", "national_lab", "standards_body", "intergovernmental", "journal", "institute_ngo", "industry_association", "vendor", "analytical_press", "unknown"]) {
    assert.ok(ROLE_CLASSES.includes(r), `missing role class: ${r}`);
  }
});

// ── institutional / author standing (topic-scoped, never brand-level) ──────────────────────────────

test("computeInstitutionalStanding returns null (honest absence) with no topic-scoped data, never a brand-level fallback", () => {
  assert.equal(computeInstitutionalStanding(null), null);
  assert.equal(computeInstitutionalStanding({}), null);
});

test("computeInstitutionalStanding passes through topic-scoped figures when present", () => {
  const result = computeInstitutionalStanding({ inTopicFwci: 1.8, inTopicWorksCount: 12, topicShare: 0.04 });
  assert.deepEqual(result, { inTopicFwci: 1.8, inTopicWorksCount: 12, topicShare: 0.04 });
});

test("computeAuthorStanding returns null with no author record", () => {
  assert.equal(computeAuthorStanding(null), null);
});

test("computeAuthorStanding reads h-index and in-topic fwci from summary_stats, and recency from counts_by_year", () => {
  const currentYear = new Date().getFullYear();
  const author = {
    summary_stats: { h_index: 14, fwci: 2.1 },
    counts_by_year: [{ year: currentYear, works_count: 3 }, { year: currentYear - 5, works_count: 9 }],
  };
  const result = computeAuthorStanding(author);
  assert.equal(result.hIndex, 14);
  assert.equal(result.inTopicFwci, 2.1);
  assert.equal(result.recentWorksCount, 3);
});

// ── funding independence: three states, never collapsed ────────────────────────────────────────────

test("computeFundingIndependence: public competitive funding scores independent", () => {
  assert.equal(computeFundingIndependence({ disclosed: true, funderIsCommercialBeneficiary: false }), "independent");
});

test("computeFundingIndependence: vendor-funded scores dependent", () => {
  assert.equal(computeFundingIndependence({ disclosed: true, funderIsCommercialBeneficiary: true }), "dependent");
});

test("computeFundingIndependence: undisclosed scores unknown, NEVER collapsed into dependent or independent", () => {
  assert.equal(computeFundingIndependence(null), "unknown");
  assert.equal(computeFundingIndependence({ disclosed: false }), "unknown");
  assert.equal(computeFundingIndependence({ disclosed: true, funderIsCommercialBeneficiary: null }), "unknown");
  // The specific regression this negative test guards: unknown must never equal either real state.
  assert.notEqual(computeFundingIndependence({ disclosed: false }), "independent");
  assert.notEqual(computeFundingIndependence({ disclosed: false }), "dependent");
});

// ── reception: FWCI suppression under 24 months, velocity substitute, never raw cited_by_count ────

test("computeReception uses fwci for a work 24+ months old", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const work = { publicationDate: "2024-01-01", fwci: 1.6, citedByCount: 40 };
  const result = computeReception(work, now);
  assert.equal(result.metric, "fwci");
  assert.equal(result.value, 1.6);
});

test("computeReception prefers citation_normalized_percentile over fwci when both are present on an old-enough work", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const work = { publicationDate: "2020-01-01", fwci: 1.6, citationNormalizedPercentile: 0.91 };
  const result = computeReception(work, now);
  assert.equal(result.metric, "citation_normalized_percentile");
  assert.equal(result.value, 0.91);
});

test("computeReception SUPPRESSES fwci under 24 months and substitutes a velocity measure instead", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  // Published 10 months before `now`, carries a high fwci that must NOT surface.
  const work = { publicationDate: "2025-12-01", fwci: 3.4, citedByCount: 8 };
  const result = computeReception(work, now);
  assert.equal(result.metric, "velocity");
  assert.ok(result.value > 0, "velocity value should be a positive citations-per-month rate");
  assert.notEqual(result.value, 3.4, "the suppressed fwci value must not leak through as the velocity value");
  assert.match(result.method, /suppressed under 24 months/);
});

test("computeReception under 24 months with no citation count returns unknown, never a fabricated zero velocity", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const work = { publicationDate: "2026-06-01" };
  const result = computeReception(work, now);
  assert.equal(result.metric, "unknown");
  assert.equal(result.value, null);
});

test("computeReception never renders raw cited_by_count as the credibility signal (negative test, keys and values)", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const oldWork = { publicationDate: "2020-01-01", fwci: 1.6, citedByCount: 999 };
  const newWork = { publicationDate: "2026-01-01", citedByCount: 999 };
  for (const work of [oldWork, newWork, null]) {
    const result = computeReception(work, now);
    const keys = Object.keys(result);
    assert.ok(!keys.some((k) => /cited.?by.?count/i.test(k)), `output must never carry a cited_by_count-shaped key: ${keys.join(",")}`);
    assert.notEqual(result.value, 999, "the raw cited_by_count value must never pass through unmodified as the reception value");
  }
});

// ── integrity ────────────────────────────────────────────────────────────────────────────────────────

test("computeIntegrity reads explicit booleans and defaults predatoryVenue to unknown, never false", () => {
  assert.deepEqual(computeIntegrity(null), { isRetracted: false, hasCorrections: false, predatoryVenue: "unknown" });
  assert.deepEqual(computeIntegrity({ isRetracted: true, hasCorrections: true, predatoryVenue: false }), {
    isRetracted: true,
    hasCorrections: true,
    predatoryVenue: false,
  });
});

// ── bucketing ────────────────────────────────────────────────────────────────────────────────────────

test("bucketForSource: vendor and industry_association are always vendorFlagged, never excluded, never promoted", () => {
  assert.equal(bucketForSource({ roleClass: "vendor", fundingIndependence: "independent", integrity: { isRetracted: false } }), "vendorFlagged");
  assert.equal(bucketForSource({ roleClass: "industry_association", fundingIndependence: "independent", integrity: { isRetracted: false } }), "vendorFlagged");
});

test("bucketForSource: unknown role class is unknown, never defaulted to medium", () => {
  assert.equal(bucketForSource({ roleClass: "unknown", fundingIndependence: "independent", integrity: { isRetracted: false } }), "unknown");
});

test("bucketForSource: high-authority role + independent funding + no integrity concern = highAuthorityIndependent", () => {
  for (const roleClass of ["university", "national_lab", "standards_body", "intergovernmental"]) {
    assert.equal(bucketForSource({ roleClass, fundingIndependence: "independent", integrity: { isRetracted: false } }), "highAuthorityIndependent");
  }
});

test("bucketForSource: high-authority role with dependent or unknown funding caps at medium", () => {
  assert.equal(bucketForSource({ roleClass: "university", fundingIndependence: "dependent", integrity: { isRetracted: false } }), "medium");
  assert.equal(bucketForSource({ roleClass: "university", fundingIndependence: "unknown", integrity: { isRetracted: false } }), "medium");
});

test("bucketForSource: a retracted high-authority source never reaches highAuthorityIndependent", () => {
  assert.equal(bucketForSource({ roleClass: "national_lab", fundingIndependence: "independent", integrity: { isRetracted: true } }), "medium");
});

test("bucketForSource: journal and analytical_press roles are medium regardless of funding", () => {
  assert.equal(bucketForSource({ roleClass: "journal", fundingIndependence: "independent", integrity: { isRetracted: false } }), "medium");
  assert.equal(bucketForSource({ roleClass: "analytical_press", fundingIndependence: "independent", integrity: { isRetracted: false } }), "medium");
});

// ── integration: a full OpenAlex-resolved source ────────────────────────────────────────────────────

test("scoreOpenAlexSource assembles a full profile for a high-authority, independently-funded, in-topic institution", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const record = {
    sourceId: "src-1",
    kind: "openalex",
    institution: { displayName: "National Renewable Energy Laboratory", type: "facility", inTopicFwci: 2.4, inTopicWorksCount: 30, topicShare: 0.08 },
    author: { summary_stats: { h_index: 22, fwci: 2.0 }, counts_by_year: [] },
    work: { publicationDate: "2023-01-01", fwci: 2.2 },
    funding: { disclosed: true, funderIsCommercialBeneficiary: false },
  };
  const result = scoreOpenAlexSource(record, { now });
  assert.equal(result.sourceId, "src-1");
  assert.equal(result.roleClass, "national_lab");
  assert.equal(result.fundingIndependence, "independent");
  assert.equal(result.bucket, "highAuthorityIndependent");
  assert.equal(result.institutionalStanding.inTopicFwci, 2.4);
  assert.equal(result.reception.metric, "fwci");
});

test("scoreOpenAlexSource flags a vendor-funded source as vendorFlagged even with strong reception numbers", () => {
  const record = {
    sourceId: "src-2",
    kind: "openalex",
    institution: { displayName: "Acme Battery Co", type: "company" },
    work: { publicationDate: "2020-01-01", fwci: 5.0 },
    funding: { disclosed: true, funderIsCommercialBeneficiary: true },
  };
  const result = scoreOpenAlexSource(record);
  assert.equal(result.bucket, "vendorFlagged");
});

// ── integration: the grey-literature, non-citation path ────────────────────────────────────────────

test("scoreGreyLiteratureSource reaches highAuthorityIndependent on institutional mandate alone, with zero citation signal", () => {
  const record = {
    sourceId: "src-3",
    kind: "grey_literature",
    displayName: "International Maritime Organization",
    institutionalMandate: true,
    methodTransparent: true,
    independentlyReplicated: true,
    citedByIndexedLiterature: true,
    funding: { disclosed: true, funderIsCommercialBeneficiary: false },
  };
  const result = scoreGreyLiteratureSource(record);
  assert.equal(result.roleClass, "intergovernmental");
  assert.equal(result.bucket, "highAuthorityIndependent");
  assert.equal(result.reception.metric, "unknown");
  assert.match(result.reception.method, /coverage artefact, not a quality signal/);
});

test("scoreGreyLiteratureSource never defaults methodTransparent/independentlyReplicated to a guessed boolean", () => {
  const record = { sourceId: "src-4", kind: "grey_literature", displayName: "Smart Freight Centre" };
  const result = scoreGreyLiteratureSource(record);
  assert.equal(result.greyLiterature.methodTransparent, "unknown");
  assert.equal(result.greyLiterature.independentlyReplicated, "unknown");
  assert.equal(result.greyLiterature.citedByIndexedLiterature, "unknown");
});

test("scoreSource dispatches on record.kind and rejects an unrecognized kind rather than guessing a path", () => {
  assert.equal(scoreSource({ sourceId: "s", kind: "openalex" }).bucket, "unknown");
  assert.equal(scoreSource({ sourceId: "s", kind: "grey_literature" }).bucket, "unknown");
  assert.throws(() => scoreSource({ sourceId: "s", kind: "mystery" }), /unknown record\.kind/);
  assert.throws(() => scoreSource({ kind: "openalex" }), /requires a record with a sourceId/);
});

// ── aggregation: a distribution, NEVER a mean ───────────────────────────────────────────────────────

test("aggregateAuthorityDistribution returns bucket counts, matching the spec's own worked example shape", () => {
  const sources = [
    { sourceId: "a", bucket: "highAuthorityIndependent", integrity: { isRetracted: false } },
    { sourceId: "b", bucket: "highAuthorityIndependent", integrity: { isRetracted: false } },
    { sourceId: "c", bucket: "highAuthorityIndependent", integrity: { isRetracted: false } },
    { sourceId: "d", bucket: "medium", integrity: { isRetracted: false } },
    { sourceId: "e", bucket: "vendorFlagged", integrity: { isRetracted: false } },
    { sourceId: "f", bucket: "vendorFlagged", integrity: { isRetracted: false } },
  ];
  const dist = aggregateAuthorityDistribution(sources);
  assert.equal(dist.highAuthorityIndependent, 3);
  assert.equal(dist.medium, 1);
  assert.equal(dist.vendorFlagged, 2);
  assert.equal(dist.unknown, 0);
  // Never a mean: there is no single numeric "score" field anywhere on the aggregate.
  assert.equal("score" in dist, false);
  assert.equal("average" in dist, false);
  assert.equal("mean" in dist, false);
});

test("aggregateAuthorityDistribution surfaces a retraction as a visible cross-cutting count, never silently absorbed", () => {
  const sources = [
    { sourceId: "a", bucket: "medium", integrity: { isRetracted: true } },
    { sourceId: "b", bucket: "medium", integrity: { isRetracted: false } },
  ];
  const dist = aggregateAuthorityDistribution(sources);
  assert.equal(dist.medium, 2);
  assert.equal(dist.integrityFlagged, 1);
});

test("aggregateAuthorityDistribution handles an empty set honestly (all zero, no crash)", () => {
  const dist = aggregateAuthorityDistribution([]);
  assert.equal(dist.highAuthorityIndependent, 0);
  assert.equal(dist.sources.length, 0);
});

test("aggregateAuthorityDistribution keeps the per-source detail array for the dissent panel (a later lane's consumer)", () => {
  const sources = [{ sourceId: "a", bucket: "medium", integrity: { isRetracted: false } }];
  const dist = aggregateAuthorityDistribution(sources);
  assert.equal(dist.sources, sources);
});
