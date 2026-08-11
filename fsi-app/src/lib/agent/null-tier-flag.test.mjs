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

// ── THE TWO FLAG SHAPES (ruling 2026-08-11) ────────────────────────────────────────────────────────────────
// An UNRULED null-tier host is a registration backlog item. A RULED aggregator/platform is not: it is a
// re-attribution instruction, and telling the operator to register it would re-mint, on every grounding run,
// the exact error the SC-13 ruling forbids.
const AGG = mergeNullTierAggregate(null, "item-a", { factCount: 4, samples: [] });

test("UNRULED host -> register_source, and the wording is unchanged from the 2026-07-04 ruling", () => {
  const { description, action, rationale } = summarizeNullTierAggregate("lovdata.no", AGG, null);
  assert.equal(action, "register_source");
  assert.match(description, /^Unregistered host lovdata\.no:/);
  assert.match(description, /register at its canonical institutional tier IF an authoritative primary/);
  assert.match(description, /4c relabel/);
  assert.match(rationale, /Register lovdata\.no at its canonical institutional tier/);
  // The floor caveat must survive: a null-tier FACT on a LOW/exempt item is not "below floor".
  assert.match(description, /Floor-subject only for CRITICAL\/HIGH non-exempt items/);
});

test("RULED aggregator -> reattribute_to_publisher, and NEVER an instruction to register it", () => {
  const { description, action, rationale } = summarizeNullTierAggregate("law.cornell.edu", AGG, "aggregator");
  assert.equal(action, "reattribute_to_publisher");
  assert.match(description, /^Re-attribution required for law\.cornell\.edu \(ruled aggregator, never registerable\)/);
  assert.match(description, /republishes text it did not publish/);
  assert.match(description, /4 FACT span\(s\) across 1 item\(s\)/);
  // THE point of the shape: no register-at-tier instruction anywhere in what the operator reads.
  assert.doesNotMatch(description, /register at its canonical institutional tier/);
  assert.doesNotMatch(rationale, /Register law\.cornell\.edu at/);
  assert.match(rationale, /Do not register this host/);
});

test("RULED hosting platform -> the same shape, hosting reason not republishing reason", () => {
  const { description, action } = summarizeNullTierAggregate("energygovuk.citizenspace.com", AGG, "platform");
  assert.equal(action, "reattribute_to_publisher");
  assert.match(description, /ruled platform, never registerable/);
  assert.match(description, /hosts a publication it did not publish/);
  assert.doesNotMatch(description, /register at its canonical institutional tier/);
});

test("both shapes fit the integrity_flags.description column (480 chars) WITHOUT being truncated", () => {
  // The caller does description.slice(0, 480). A shape that only fits after truncation would silently drop
  // its own instruction — which for the re-attribution shape is the entire content of the flag.
  const big = mergeNullTierAggregate(null, "item-a", { factCount: 999999, samples: [] });
  const longHost = "a-very-long-subdomain.another-long-label.example-institution-name.example";
  for (const cls of [null, "aggregator", "platform"]) {
    const { description } = summarizeNullTierAggregate(longHost, big, cls);
    assert.ok(description.length <= 480, `${cls}: ${description.length} chars exceeds the column budget`);
  }
});
