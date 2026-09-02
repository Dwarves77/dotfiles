// Run: node --test scripts/review/lib/digest-core.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortGroups, buildGroup, partitionBy, latestIso, renderMarkdown, buildRulingFile } from "./digest-core.mjs";

test("sortGroups: descending count, then key ascending — deterministic regardless of input order", () => {
  const a = [{ key: "b", count: 2 }, { key: "a", count: 5 }, { key: "c", count: 2 }];
  const b = [{ key: "c", count: 2 }, { key: "a", count: 5 }, { key: "b", count: 2 }];
  const outA = sortGroups(a).map((g) => g.key);
  const outB = sortGroups(b).map((g) => g.key);
  assert.deepEqual(outA, ["a", "b", "c"]);
  assert.deepEqual(outA, outB); // same result no matter the input order
});

test("partitionBy: groups rows by key function, preserving row order within a bucket", () => {
  const rows = [{ id: 1, k: "x" }, { id: 2, k: "y" }, { id: 3, k: "x" }];
  const m = partitionBy(rows, (r) => r.k);
  assert.deepEqual([...m.get("x").map((r) => r.id)], [1, 3]);
  assert.deepEqual([...m.get("y").map((r) => r.id)], [2]);
});

test("buildGroup: shape, count, row_ids, decision/rationale start null, examples capped at 3", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const g = buildGroup({
    key: "k1",
    rows,
    idOf: (r) => r.id,
    recommendedDecision: "keep",
    exampleOf: (r) => ({ id: r.id, title: r.id, url: `https://x/${r.id}` }),
  });
  assert.equal(g.key, "k1");
  assert.equal(g.count, 4);
  assert.deepEqual(g.row_ids, ["a", "b", "c", "d"]);
  assert.equal(g.recommended_decision, "keep");
  assert.equal(g.decision, null);
  assert.equal(g.rationale, null);
  assert.equal(g.examples.length, 3);
});

test("latestIso: max of present timestamps, ignores nullish/invalid, null when none valid", () => {
  assert.equal(latestIso(["2026-01-01T00:00:00Z", null, "2026-06-01T00:00:00Z", undefined]), "2026-06-01T00:00:00.000Z");
  assert.equal(latestIso([null, undefined]), null);
  assert.equal(latestIso(["not-a-date"]), null);
});

test("renderMarkdown + buildRulingFile: round-trip shape, contains queue id and every group key", () => {
  const groups = [buildGroup({ key: "k1", rows: [{ id: "a" }], idOf: (r) => r.id, recommendedDecision: "keep", exampleOf: (r) => ({ id: r.id, title: "T", url: "https://x" }) })];
  const ruling = buildRulingFile({ queueId: "q1", generatedAt: "2026-09-02T00:00:00Z", groups });
  assert.equal(ruling.queue, "q1");
  assert.equal(ruling.groups.length, 1);
  const md = renderMarkdown({
    queueLabel: "Q1 Label",
    queueId: "q1",
    generatedAt: ruling.generated_at,
    totalRows: 1,
    groups,
    decisionVocab: ["keep", "suspend", "skip"],
    applyScript: "scripts/review/apply-q1.mjs",
    maintStep: "review-apply-q1",
  });
  assert.match(md, /Q1 Label/);
  assert.match(md, /## k1/);
  assert.match(md, /apply-q1\.mjs/);
  assert.match(md, /review-apply-q1/);
});
