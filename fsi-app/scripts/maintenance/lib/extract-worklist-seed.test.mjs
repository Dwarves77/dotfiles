import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWorklistSeed } from "./extract-worklist-seed.mjs";

test("extractWorklistSeed: pulls no_candidate_url and unresolved source outcomes into {item_id, token} rows", () => {
  const summary = {
    per_item: [
      {
        id: "item-1",
        steps: {
          source: [
            { token: "€1,000", outcome: "no_candidate_url" },
            { token: "€2,000", outcome: "source_registered_and_grounded" }, // resolved — not orphan residue
            { token: "€3,000", outcome: "unresolved" },
          ],
        },
      },
      { id: "item-2", steps: { source: [{ token: "April 2026", outcome: "unresolved" }] } },
    ],
  };
  assert.deepEqual(extractWorklistSeed(summary), [
    { item_id: "item-1", token: "€1,000" },
    { item_id: "item-1", token: "€3,000" },
    { item_id: "item-2", token: "April 2026" },
  ]);
});

test("extractWorklistSeed: deduplicates the SAME (item_id, token) pair", () => {
  const summary = { per_item: [{ id: "item-1", steps: { source: [
    { token: "€1,000", outcome: "no_candidate_url" },
    { token: "€1,000", outcome: "unresolved" },
  ] } }] };
  assert.deepEqual(extractWorklistSeed(summary), [{ item_id: "item-1", token: "€1,000" }]);
});

test("extractWorklistSeed: deterministic order — item_id then token, both ascending, regardless of input order", () => {
  const summary = { per_item: [
    { id: "item-b", steps: { source: [{ token: "z", outcome: "unresolved" }] } },
    { id: "item-a", steps: { source: [{ token: "b", outcome: "unresolved" }, { token: "a", outcome: "no_candidate_url" }] } },
  ] };
  assert.deepEqual(extractWorklistSeed(summary), [
    { item_id: "item-a", token: "a" },
    { item_id: "item-a", token: "b" },
    { item_id: "item-b", token: "z" },
  ]);
});

test("extractWorklistSeed: empty/missing per_item -> [], never throws", () => {
  assert.deepEqual(extractWorklistSeed({}), []);
  assert.deepEqual(extractWorklistSeed({ per_item: [] }), []);
  assert.deepEqual(extractWorklistSeed(undefined), []);
});

test("extractWorklistSeed: an item with no steps.source at all is skipped, not an error", () => {
  const summary = { per_item: [{ id: "item-1", steps: {} }, { id: "item-2" }] };
  assert.deepEqual(extractWorklistSeed(summary), []);
});
