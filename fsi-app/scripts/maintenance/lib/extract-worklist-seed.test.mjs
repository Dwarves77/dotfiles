import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWorklistSeed } from "./extract-worklist-seed.mjs";

test("extractWorklistSeed: pulls no_candidate_url and unresolved SOURCE outcomes into rows (apply-run shape)", () => {
  const summary = {
    per_item: [
      {
        id: "item-1",
        steps: {
          source: [
            { token: "€1,000", class: "figure", outcome: "no_candidate_url", sentence: "The fee is €1,000." },
            { token: "€2,000", class: "figure", outcome: "source_registered_and_grounded" }, // resolved — not orphan residue
            { token: "€3,000", class: "figure", outcome: "unresolved", sentence: "Then €3,000 applies." },
          ],
        },
      },
      { id: "item-2", steps: { source: [{ token: "April 2026", class: "deadline", outcome: "unresolved", sentence: "Effective April 2026." }] } },
    ],
  };
  assert.deepEqual(extractWorklistSeed(summary), [
    { item_id: "item-1", token: "€1,000", class: "figure", sentence: "The fee is €1,000.", search_id: null },
    { item_id: "item-1", token: "€3,000", class: "figure", sentence: "Then €3,000 applies.", search_id: null },
    { item_id: "item-2", token: "April 2026", class: "deadline", sentence: "Effective April 2026.", search_id: null },
  ]);
});

// ── THE DEFECT, red-then-green (Lane SEED-FIX, 2026-09-06): a DRY provenance-heal run's STEP SOURCE
// never fetches, so steps.source[] outcomes are would_capture_and_ground / would_register_and_capture /
// bound_hit / item_bound_hit / worklist_ambiguous_host — never no_candidate_url/unresolved. The measured
// orphan residue lives under steps.orphans[], outcome "unprovable". Before the fix, this summary shape
// (cut from the real committed provenance-heal-34041907817.summary.json, see this repo's git history for
// the original 1.9MB file) produced ZERO seed rows; it must now produce exactly the two unprovable ones.
test("extractWorklistSeed: a DRY-run summary (no source[] no_candidate_url/unresolved at all) still yields rows, from steps.orphans[] unprovable", () => {
  const summary = {
    per_item: [
      {
        id: "053123bc-2c11-45ec-a5a1-83828b666b11",
        item_type: "regional_data",
        steps: {
          source: [
            { token: "$300", class: "figure", url: "https://www.antt.gov.br*", outcome: "would_capture_and_ground", class_tier: 2 },
            { token: "2023", class: "deadline", url: "https://globalsolaratlas.info.", outcome: "would_capture_and_ground", class_tier: 1 },
          ],
          orphans: [
            {
              token: "$300",
              class: "figure",
              outcome: "unprovable",
              fuzzy: { score: 0.09090909090909091, window: "s RNTRC 100% digital", search_id: "0ca904de-de68-4e2f-a1de-818871751f63" },
              sentence: "ANTT's 2025 management report references R$300 billion in projected concession investments and describes 2025 as the agency's highest-ever year for concession expansion.",
            },
          ],
        },
      },
      {
        id: "another-item",
        steps: {
          source: [],
          orphans: [
            { token: "1 May 2026", class: "deadline", outcome: "unprovable", fuzzy: { score: 0.2, window: "x", search_id: "s2" }, sentence: "The deadline is 1 May 2026." },
            { token: "2 May 2026", class: "deadline", outcome: "item_bound_hit" }, // budget cutoff, never tried — must NOT appear
            { token: "3 May 2026", class: "deadline", outcome: "would_ground", bucket: "b" }, // resolved — not residue
          ],
        },
      },
    ],
  };
  assert.deepEqual(extractWorklistSeed(summary), [
    {
      item_id: "053123bc-2c11-45ec-a5a1-83828b666b11",
      token: "$300",
      class: "figure",
      sentence: "ANTT's 2025 management report references R$300 billion in projected concession investments and describes 2025 as the agency's highest-ever year for concession expansion.",
      search_id: "0ca904de-de68-4e2f-a1de-818871751f63",
    },
    {
      item_id: "another-item",
      token: "1 May 2026",
      class: "deadline",
      sentence: "The deadline is 1 May 2026.",
      search_id: "s2",
    },
  ]);
});

test("extractWorklistSeed: item_bound_hit (both in source[] and orphans[]) is never included — an untried token is not exhausted residue", () => {
  const summary = {
    per_item: [
      {
        id: "item-1",
        steps: {
          source: [{ token: "€9", class: "figure", outcome: "item_bound_hit" }],
          orphans: [{ token: "€9", class: "figure", outcome: "item_bound_hit" }],
        },
      },
    ],
  };
  assert.deepEqual(extractWorklistSeed(summary), []);
});

test("extractWorklistSeed: deduplicates the SAME (item_id, token) pair, first occurrence wins its fields, across BOTH source[] and orphans[]", () => {
  const summary = {
    per_item: [
      {
        id: "item-1",
        steps: {
          source: [{ token: "€1,000", class: "figure", outcome: "no_candidate_url", sentence: "first" }],
          orphans: [{ token: "€1,000", class: "figure", outcome: "unprovable", sentence: "second", fuzzy: { search_id: "s" } }],
        },
      },
    ],
  };
  assert.deepEqual(extractWorklistSeed(summary), [
    { item_id: "item-1", token: "€1,000", class: "figure", sentence: "first", search_id: null },
  ]);
});

test("extractWorklistSeed: deterministic order — item_id then token, both ascending, regardless of input order", () => {
  const summary = {
    per_item: [
      { id: "item-b", steps: { orphans: [{ token: "z", class: "figure", outcome: "unprovable", sentence: "s" }] } },
      { id: "item-a", steps: { orphans: [
        { token: "b", class: "figure", outcome: "unprovable", sentence: "s" },
        { token: "a", class: "figure", outcome: "unprovable", sentence: "s" },
      ] } },
    ],
  };
  const seed = extractWorklistSeed(summary);
  assert.deepEqual(seed.map((r) => [r.item_id, r.token]), [
    ["item-a", "a"],
    ["item-a", "b"],
    ["item-b", "z"],
  ]);
});

test("extractWorklistSeed: empty/missing per_item -> [], never throws", () => {
  assert.deepEqual(extractWorklistSeed({}), []);
  assert.deepEqual(extractWorklistSeed({ per_item: [] }), []);
  assert.deepEqual(extractWorklistSeed(undefined), []);
});

test("extractWorklistSeed: an item with no steps.source or steps.orphans at all is skipped, not an error", () => {
  const summary = { per_item: [{ id: "item-1", steps: {} }, { id: "item-2" }] };
  assert.deepEqual(extractWorklistSeed(summary), []);
});
