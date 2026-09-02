// origin-class-mapping.test.mjs — Lane SURF, 2026-09-02 (coordinator follow-up).
//
// THE GAP: `Resource.originClass` (src/types/resource.ts) mirrors `intelligence_items.origin_class`
// (migration 267; vocabulary src/lib/contracts/vocabularies.mjs ORIGIN_CLASS — community |
// community-corroborated | modelled | derived | partner | verified | official). Before this change
// none of the three row mappers in supabase-server.ts that build a Resource set the field at all, so
// signal-promotion.mjs's fact/signal chip (src/lib/market/signal-promotion.mjs) could never see a real
// origin_class and MarketSignalDetailSurface.tsx read it through an ad hoc inline cast.
//
// This test pins two things, mirroring jurisdiction-iso-mapping.test.mjs's precedent (a module too
// tightly coupled to Supabase/Next runtime to unit-test by import):
//   1. All three Resource-mapper sites in supabase-server.ts (fetchWorkspaceResources's inline
//      mapper, rpcRowToResource, fetchIntelligenceItemUncached) set `originClass` via the same
//      `row.origin_class ?? undefined` dormant-passthrough idiom used for jurisdictionIso/itemGrade —
//      regression lock via source-text match count.
//   2. No mapper defaults `origin_class` to a truthy fallback value (the domain-laundering trap:
//      coalescing "column not selected" to a real classification would silently promote every
//      unclassified item to a citable-as-fact chip).
//
// WHAT THIS DOES NOT COVER: whether the 8 RPCs (get_workspace_intelligence/_slim/_dashboard/_listings,
// get_market_intel_items/get_research_items/get_operations_items/get_technology_items — all last
// redefined in migration 272) project `origin_class` in their RETURNS TABLE. Grepping migration 272 for
// `origin_class` returns zero hits, confirming they do not — so the first two mapper sites are
// currently dormant (row.origin_class reads undefined) until a future migration widens those RPCs. The
// third site (fetchIntelligenceItemUncached, `select("*")` against intelligence_items) is real today.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSupabaseServerSource() {
  return readFileSync(join(SRC, "lib/supabase-server.ts"), "utf8");
}

test("all 3 Resource-mapper sites in supabase-server.ts set originClass via the shared dormant-passthrough pattern", () => {
  const code = loadSupabaseServerSource();
  const callSites = code.match(/originClass:\s*row\.origin_class\s*\?\?\s*undefined/g) || [];
  // 3 sites: fetchWorkspaceResources's inline mapper, rpcRowToResource, and
  // fetchIntelligenceItemUncached's detail mapper. A count below 3 means one of the mappers regressed
  // back to omitting the field; a count above 3 means a 4th Resource-building mapper appeared that this
  // test (and the coordinator's grep) did not account for.
  assert.equal(
    callSites.length,
    3,
    `expected 3 mapper sites to set originClass: row.origin_class ?? undefined, found ${callSites.length}`
  );
});

test("no originClass mapping in supabase-server.ts coalesces a missing column to a truthy default", () => {
  const code = readFileSync(join(SRC, "lib/supabase-server.ts"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  // The domain-laundering trap, reproduced for this field: `row.origin_class || "..."` would turn
  // "column not selected" into a real classification — every RPC-backed item would silently render as
  // if it had been graded, when in fact no query has projected the column yet.
  const offenders = code.filter((l) => /originClass:\s*row\.origin_class\s*\|\|/.test(l));
  assert.deepEqual(offenders, [], `coalesced originClass mapping found: ${offenders.join(" | ")}`);
});

test("MarketSeriesDisplayRow declares the provenance-envelope fields series-board-view-model.mjs already returns", () => {
  const code = loadSupabaseServerSource();
  const interfaceMatch = code.match(/export interface MarketSeriesDisplayRow \{[\s\S]*?\n\}/);
  assert.ok(interfaceMatch, "MarketSeriesDisplayRow interface not found in supabase-server.ts");
  const body = interfaceMatch[0];
  for (const field of ["unit", "currency", "derivation", "originClass", "methodVersion", "nObservations"]) {
    assert.match(
      body,
      new RegExp(`\\b${field}\\??:\\s`),
      `MarketSeriesDisplayRow is missing declared field "${field}"`
    );
  }
});
