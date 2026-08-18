// pair-view.test.mjs — proofs for the U3 intersections reader (pair assembly over the persisted
// graph). Runs under `node --test` via the src/lib/connections/*.test.mjs glob (execution-wired).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collapsePairs, assemblePairs, bandOf, BANDS } from "./pair-view.mjs";

const item = (id, extra = {}) => [id, { id, title: `T-${id}`, legacy_id: null, priority: "HIGH", intersection_summary: null, ...extra }];
const items = (...ids) => new Map(ids.map((id) => item(id)));

const pd = (s, t, score, basis = [{ signal: "shared_scenario", detail: "both touch x", weight: 0.3 }]) =>
  ({ source_item_id: s, target_item_id: t, origin: "provenance_discovery", score, basis });
const manual = (s, t) => ({ source_item_id: s, target_item_id: t, origin: "manual", score: null, basis: [] });

test("both directions collapse to ONE canonical pair, max score, basis deduped", () => {
  const basis = [{ signal: "shared_source", detail: "grounded in the same source", weight: 0.4 }];
  const pairs = collapsePairs([pd("b", "a", 0.4, basis), pd("a", "b", 0.4, basis)]);
  assert.equal(pairs.size, 1);
  const p = pairs.get("a|b");
  assert.equal(p.a, "a");
  assert.equal(p.b, "b");
  assert.equal(p.score, 0.4);
  assert.equal(p.basis.length, 1); // identical entry from both directions stored once
  assert.equal(p.explicitly_linked, false);
});

test("self-loops and rows with missing endpoints are dropped", () => {
  const pairs = collapsePairs([pd("a", "a", 0.9), { source_item_id: "a" }, null]);
  assert.equal(pairs.size, 0);
});

test("a manual edge marks the pair explicitly_linked without inventing a score", () => {
  const pairs = collapsePairs([manual("a", "b")]);
  const p = pairs.get("a|b");
  assert.equal(p.explicitly_linked, true);
  assert.equal(p.score, null);
});

test("bands follow the documented thresholds; null score is 'explicit'", () => {
  assert.equal(bandOf(0.95), "strong");
  assert.equal(bandOf(BANDS.strong), "strong");
  assert.equal(bandOf(0.6), "medium");
  assert.equal(bandOf(0.3), "weak");
  assert.equal(bandOf(null), "explicit");
});

test("assemblePairs: minScore filters scored pairs but never curated ones", () => {
  const rows = [pd("a", "b", 0.35), pd("c", "d", 0.9), manual("e", "f")];
  const { pairs, stats } = assemblePairs(rows, items("a", "b", "c", "d", "e", "f"), { minScore: 0.5 });
  const keys = pairs.map((r) => `${r.item_a_id}|${r.item_b_id}`);
  assert.deepEqual(keys, ["c|d", "e|f"]); // 0.35 filtered; explicit-only survives, ranked after scored
  assert.equal(stats.total, 2);
  assert.equal(stats.explicit_count, 1);
  assert.deepEqual(stats.by_band, { strong: 1, medium: 0, weak: 0, explicit: 1 });
});

test("assemblePairs: a pair with a missing item is dropped, not half-rendered", () => {
  const { pairs } = assemblePairs([pd("a", "b", 0.9)], items("a"), {});
  assert.equal(pairs.length, 0);
});

test("assemblePairs: deterministic rank — score desc, then ids; limit caps after ranking", () => {
  const rows = [pd("a", "b", 0.5), pd("a", "c", 0.9), pd("b", "c", 0.5)];
  const all = assemblePairs(rows, items("a", "b", "c"), { minScore: 0.3, limit: 100 }).pairs;
  assert.deepEqual(all.map((r) => `${r.item_a_id}|${r.item_b_id}`), ["a|c", "a|b", "b|c"]);
  const top = assemblePairs(rows, items("a", "b", "c"), { minScore: 0.3, limit: 1 }).pairs;
  assert.equal(top.length, 1);
  assert.equal(top[0].item_b_id, "c"); // the 0.9 pair survives the cap
});

test("a pair with neither score nor curation is not emitted (nothing grounds it)", () => {
  // A provenance_discovery row that arrives with a null score carries no grounded rank and the pair
  // has no curated edge — assemblePairs refuses to render it rather than invent a rank.
  const rows = [{ source_item_id: "a", target_item_id: "b", origin: "provenance_discovery", score: null, basis: [] }];
  const { pairs } = assemblePairs(rows, items("a", "b"), {});
  assert.equal(pairs.length, 0);
});
