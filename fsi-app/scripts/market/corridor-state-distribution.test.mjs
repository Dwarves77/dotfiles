// Run: node --test scripts/market/corridor-state-distribution.test.mjs - no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, tallyCorridorStates } from "./corridor-state-distribution.mjs";
import { candidatesFromCorridorEntities } from "../../src/lib/market/resolve-item-corridor.mjs";

// The real live fallback corridor set (ADR example + three WCI-named lanes), expressed as the
// {entity_id, canonical_name} shape a live `entities WHERE kind='corridor'` read returns - never a
// mock shape, the same convention seed-corridors.mjs itself writes.
const CORRIDOR_ROWS = [
  { entity_id: "cl:corridor:nlrtm", canonical_name: "CNSHA-NLRTM:ocean" },
  { entity_id: "cl:corridor:itgoa", canonical_name: "CNSHA-ITGOA:ocean" },
  { entity_id: "cl:corridor:usnyc", canonical_name: "CNSHA-USNYC:ocean" },
  { entity_id: "cl:corridor:uslax", canonical_name: "CNSHA-USLAX:ocean" },
];

// -- tallyCorridorStates (pure) ----------------------------------------------------------------------

test("tallyCorridorStates: resolved, ambiguous and no_corridor_identity all tally correctly against the real corridor shape", () => {
  const { candidates } = candidatesFromCorridorEntities(CORRIDOR_ROWS);
  const items = [
    { id: "a", legacy_id: null, title: "Shanghai-Rotterdam lane", jurisdiction_iso: ["CN", "NL"], transport_modes: ["ocean"] },
    { id: "b", legacy_id: "l-1", title: "Shanghai-US lane", jurisdiction_iso: ["CN", "US"], transport_modes: ["ocean"] },
    { id: "c", legacy_id: null, title: "Single-country signal", jurisdiction_iso: ["DE"], transport_modes: ["road"] },
    { id: "d", legacy_id: null, title: "Global signal", jurisdiction_iso: ["GLOBAL"], transport_modes: [] },
  ];
  const { counts, total, resolvedItems, ambiguousItems } = tallyCorridorStates(items, candidates);
  assert.equal(total, 4);
  assert.equal(counts.resolved, 1);
  assert.equal(counts.ambiguous, 1);
  assert.equal(counts.no_corridor_identity, 2);
  assert.equal(resolvedItems.length, 1);
  assert.equal(resolvedItems[0].id, "a");
  assert.deepEqual(resolvedItems[0].corridor, { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  assert.equal(ambiguousItems.length, 1);
  assert.equal(ambiguousItems[0].id, "b");
  assert.equal(ambiguousItems[0].matchedCandidateIds.length, 2); // USNYC + USLAX, both {CN,US}
});

test("tallyCorridorStates: empty item list -> all-zero counts, never throws", () => {
  const { counts, total } = tallyCorridorStates([], []);
  assert.equal(total, 0);
  assert.deepEqual(counts, { resolved: 0, ambiguous: 0, no_corridor_identity: 0 });
});

// -- main() with an injected fake client (no DB) -----------------------------------------------------

test("main(): injected readAll, no DB - reads both tables once each and returns the real tally", async () => {
  const calls = [];
  const readAll = async (table, columns, opts) => {
    calls.push({ table, columns, opts });
    if (table === "intelligence_items") {
      return [
        { id: "a", legacy_id: null, title: "Shanghai-Rotterdam lane", jurisdiction_iso: ["CN", "NL"], transport_modes: ["ocean"] },
        { id: "b", legacy_id: null, title: "No-op signal", jurisdiction_iso: ["SG"], transport_modes: [] },
      ];
    }
    if (table === "entities") return CORRIDOR_ROWS;
    throw new Error(`unexpected table ${table}`);
  };

  const result = await main({}, { readAll });
  assert.equal(result.total, 2);
  assert.equal(result.candidateCount, 4);
  assert.equal(result.counts.resolved, 1);
  assert.equal(result.counts.no_corridor_identity, 1);
  assert.equal(result.corridorSkipped, 0);

  // Confirm this script makes exactly two reads (no second fetch pattern, no N+1) and reads the exact
  // tables/eligibility this file's own header documents.
  assert.equal(calls.length, 2);
  assert.ok(calls.some((c) => c.table === "intelligence_items"));
  assert.ok(calls.some((c) => c.table === "entities"));
});

test("main(): a corridor row with an unparsable canonical_name is skipped and reported, never crashes the run", async () => {
  const readAll = async (table) => {
    if (table === "intelligence_items") return [];
    if (table === "entities") return [...CORRIDOR_ROWS, { entity_id: "cl:corridor:bad", canonical_name: "garbage" }];
    return [];
  };
  const result = await main({}, { readAll });
  assert.equal(result.candidateCount, 4);
  assert.equal(result.corridorSkipped, 1);
});
