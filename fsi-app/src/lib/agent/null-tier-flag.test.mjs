// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeNullTierAggregate, summarizeNullTierAggregate } from "./null-tier-flag.mjs";

test("fresh aggregate from a single item", () => {
  const agg = mergeNullTierAggregate(null, "item-a", { factCount: 3, samples: ["span1", "span2"] });
  assert.deepEqual(agg.perItemFacts, { "item-a": 3 });
  assert.deepEqual(agg.sampleSpans, ["span1", "span2"]);
});

test("adds a second item, sums across items", () => {
  let agg = mergeNullTierAggregate(null, "item-a", { factCount: 3, samples: ["s1"] });
  agg = mergeNullTierAggregate(agg, "item-b", { factCount: 2, samples: ["s2"] });
  const { itemCount, factCount } = summarizeNullTierAggregate("lovdata.no", agg);
  assert.equal(itemCount, 2);
  assert.equal(factCount, 5);
});

test("IDEMPOTENT on re-ground: re-merging the same item OVERWRITES, never double-counts", () => {
  let agg = mergeNullTierAggregate(null, "item-a", { factCount: 3, samples: ["s1"] });
  agg = mergeNullTierAggregate(agg, "item-b", { factCount: 2, samples: ["s2"] });
  // re-ground item-a with a DIFFERENT fact count — must replace 3, not add
  agg = mergeNullTierAggregate(agg, "item-a", { factCount: 5, samples: ["s1"] });
  const { itemCount, factCount } = summarizeNullTierAggregate("h", agg);
  assert.equal(itemCount, 2);       // still just a + b
  assert.equal(factCount, 7);       // 5 (new a) + 2 (b), NOT 3+2+5
});

test("sample spans dedupe and cap at 5", () => {
  let agg = null;
  for (let i = 0; i < 8; i++) agg = mergeNullTierAggregate(agg, `item-${i}`, { factCount: 1, samples: [`span-${i}`, "dupe"] });
  assert.equal(agg.sampleSpans.length, 5);
  assert.equal(agg.sampleSpans.filter((s) => s === "dupe").length, 1);
});

test("summary description names host, fact count, item count", () => {
  const agg = mergeNullTierAggregate(null, "x", { factCount: 4, samples: [] });
  const { description } = summarizeNullTierAggregate("lovdata.no", agg);
  assert.match(description, /lovdata\.no/);
  assert.match(description, /4 FACT/);
  assert.match(description, /1 item/);
});
