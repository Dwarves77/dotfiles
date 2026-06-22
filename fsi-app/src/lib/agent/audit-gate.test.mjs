// Unit tests for the Layer B cross-item audit gate pure cores (no DB). Run: node --test.
// Covers: scoreItemClaims (unregistered-span + claims-tier honesty), hostTierViolationCount
// (one-tier-per-host), hasValidWaiver (Layer C disposition: time never clears red, only a dated waiver).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { scoreItemClaims, hostTierViolationCount, hasValidWaiver } = await jiti.import("./audit-gate.ts");
const { buildResolver } = await jiti.import("../sources/institution.ts");

// A registry: europa.eu @ tier 1, example.com @ tier 5. (super-domain exception keeps europa subdomains distinct,
// but both rows below share the eur-lex.europa.eu host so they group to one institution.)
const SOURCES = [
  { id: "s1", url: "https://eur-lex.europa.eu/legal", base_tier: 1, tier_override: null },
  { id: "s2", url: "https://www.example.com/report", base_tier: 5, tier_override: null },
];
const resolver = buildResolver(SOURCES);

test("scoreItemClaims: clean item — registered FACT span, correct tier stamp, NULL non-FACT", () => {
  const claims = [
    { id: "c1aaaaaa", claim_kind: "FACT", search_result_id: "r1", source_tier_at_grounding: 1 },
    { id: "c2aaaaaa", claim_kind: "ANALYSIS", search_result_id: null, source_tier_at_grounding: null },
  ];
  const urls = new Map([["r1", "https://eur-lex.europa.eu/legal/doc"]]);
  const m = scoreItemClaims(claims, urls, resolver);
  assert.equal(m.unregisteredSpanFacts, 0);
  assert.equal(m.claimsTierMismatches, 0);
});

test("scoreItemClaims: FACT grounded on an UNREGISTERED host -> unregistered-span + tier mismatch", () => {
  const claims = [
    { id: "c3aaaaaa", claim_kind: "FACT", search_result_id: "r2", source_tier_at_grounding: 2 },
  ];
  const urls = new Map([["r2", "https://random-unregistered-host.xyz/page"]]);
  const m = scoreItemClaims(claims, urls, resolver);
  assert.equal(m.unregisteredSpanFacts, 1, "host resolves to no tier -> counts as unregistered span");
  assert.equal(m.claimsTierMismatches, 1, "stored=2 but expected=NULL -> claims-tier mismatch");
});

test("scoreItemClaims: FACT stamped with the WRONG registered tier -> claims-tier mismatch only", () => {
  const claims = [
    { id: "c4aaaaaa", claim_kind: "FACT", search_result_id: "r3", source_tier_at_grounding: 5 },
  ];
  const urls = new Map([["r3", "https://eur-lex.europa.eu/legal/x"]]); // resolves to tier 1, not 5
  const m = scoreItemClaims(claims, urls, resolver);
  assert.equal(m.unregisteredSpanFacts, 0, "host IS registered, so not an unregistered span");
  assert.equal(m.claimsTierMismatches, 1, "stored=5 expected=1");
});

test("scoreItemClaims: a non-FACT claim carrying a tier stamp is a violation (must be NULL)", () => {
  const claims = [
    { id: "c5aaaaaa", claim_kind: "GAP", search_result_id: null, source_tier_at_grounding: 3 },
  ];
  const m = scoreItemClaims(claims, new Map(), resolver);
  assert.equal(m.claimsTierMismatches, 1);
  assert.equal(m.unregisteredSpanFacts, 0);
});

test("hostTierViolationCount: one tier per host -> 0; same host two tiers -> 1; override exempt", () => {
  assert.equal(hostTierViolationCount(SOURCES), 0, "two distinct hosts, one tier each");
  const conflict = [
    { id: "a", url: "https://iea.org/a", base_tier: 3, tier_override: null },
    { id: "b", url: "https://iea.org/b", base_tier: 6, tier_override: null },
  ];
  assert.equal(hostTierViolationCount(conflict), 1, "same institution, two base tiers, no override");
  const withOverride = [
    { id: "a", url: "https://iea.org/a", base_tier: 3, tier_override: null },
    { id: "b", url: "https://iea.org/b", base_tier: 6, tier_override: 6 },
  ];
  assert.equal(hostTierViolationCount(withOverride), 0, "the second row's explicit override exempts it");
});

test("hasValidWaiver: only a non-expired dated waiver disposes; time alone never clears red", () => {
  const now = new Date("2026-06-21T00:00:00Z");
  assert.equal(hasValidWaiver(null, now), false);
  assert.equal(hasValidWaiver({ id: "f", recommended_actions: [] }, now), false, "open block, no waiver -> blocked");
  assert.equal(
    hasValidWaiver({ id: "f", recommended_actions: [{ action: "waiver", until: "2026-06-30" }] }, now),
    true,
    "future-dated waiver -> allowed",
  );
  assert.equal(
    hasValidWaiver({ id: "f", recommended_actions: [{ action: "waiver", until: "2026-06-01" }] }, now),
    false,
    "expired waiver -> blocked (time did not clear it)",
  );
  assert.equal(
    hasValidWaiver({ id: "f", recommended_actions: [{ action: "investigate", until: "2026-12-31" }] }, now),
    false,
    "a non-waiver action does not dispose",
  );
});
