// theme-delta.test.mjs — synthetic prior/new theme sets proving every classification bucket:
// persisted, renamed, split, merged, dissolved, appeared.
import test from "node:test";
import assert from "node:assert/strict";
import { diffThemes } from "./theme-delta.mjs";

const T = (id, members) => ({ id, member_ids: members });

test("persisted: exact id match, membership delta reported", () => {
  const prior = [T("a", ["a", "b", "c"])];
  const fresh = [T("a", ["a", "b", "d"])]; // c dropped, d added
  const d = diffThemes(prior, fresh);
  assert.equal(d.persisted.length, 1);
  assert.equal(d.persisted[0].prior_id, "a");
  assert.equal(d.persisted[0].new_id, "a");
  assert.deepEqual(d.persisted[0].added, ["d"]);
  assert.deepEqual(d.persisted[0].removed, ["c"]);
  assert.equal(d.renamed.length, 0);
  assert.equal(d.dissolved.length, 0);
  assert.equal(d.appeared.length, 0);
});

test("renamed: same real-world cluster, anchor id shifted (>= 0.5 overlap, mutual best)", () => {
  // prior anchor 'a' (smallest member); new theme's smallest member is now 'b' (a archived) but
  // b,c,d carry over — overlap coefficient = |{b,c}| / min(3,3) = 2/3 >= 0.5.
  const prior = [T("a", ["a", "b", "c"])];
  const fresh = [T("b", ["b", "c", "d"])];
  const d = diffThemes(prior, fresh);
  assert.equal(d.renamed.length, 1);
  assert.equal(d.renamed[0].prior_id, "a");
  assert.equal(d.renamed[0].new_id, "b");
  assert.deepEqual(d.renamed[0].added, ["d"]);
  assert.deepEqual(d.renamed[0].removed, ["a"]);
  assert.equal(d.persisted.length, 0);
});

test("dissolved: prior theme's members scatter below overlap threshold everywhere", () => {
  const prior = [T("a", ["a", "b"])];
  const fresh = [T("c", ["c", "d"])]; // zero overlap
  const d = diffThemes(prior, fresh);
  assert.deepEqual(d.dissolved, ["a"]);
  assert.deepEqual(d.appeared, ["c"]);
  assert.equal(d.persisted.length, 0);
  assert.equal(d.renamed.length, 0);
});

test("appeared: a genuinely new theme with no prior match", () => {
  const prior = [];
  const fresh = [T("x", ["x", "y"])];
  const d = diffThemes(prior, fresh);
  assert.deepEqual(d.appeared, ["x"]);
  assert.equal(d.summary.appeared, 1);
});

test("merged: two prior themes collapse into one new theme (>= 0.5 overlap each)", () => {
  const prior = [T("a", ["a", "b"]), T("c", ["c", "d"])];
  const fresh = [T("a", ["a", "b", "c", "d"])]; // both priors fully contained
  const d = diffThemes(prior, fresh);
  assert.equal(d.merged.length, 1);
  assert.equal(d.merged[0].new_id, "a");
  assert.deepEqual(d.merged[0].prior_ids, ["a", "c"]);
  assert.equal(d.persisted.length, 0, "priors absorbed into a merge are not double-counted as persisted");
  assert.equal(d.dissolved.length, 0);
});

test("split: one prior theme's members spread across two new themes (>= 0.5 overlap each)", () => {
  const prior = [T("a", ["a", "b", "c", "d"])];
  const fresh = [T("a", ["a", "b"]), T("c", ["c", "d"])]; // each new theme holds half of prior 'a'
  const d = diffThemes(prior, fresh);
  assert.equal(d.split.length, 1);
  assert.equal(d.split[0].prior_id, "a");
  assert.deepEqual(d.split[0].new_ids, ["a", "c"]);
  assert.equal(d.appeared.length, 0, "the new themes absorbing a split are not double-counted as appeared");
});

test("stable corpus, unchanged themes: every theme persists with empty deltas", () => {
  const themes = [T("a", ["a", "b"]), T("c", ["c", "d", "e"])];
  const d = diffThemes(themes, themes);
  assert.equal(d.persisted.length, 2);
  for (const p of d.persisted) {
    assert.deepEqual(p.added, []);
    assert.deepEqual(p.removed, []);
  }
  assert.equal(d.dissolved.length, 0);
  assert.equal(d.appeared.length, 0);
});

test("empty prior set: everything appeared", () => {
  const d = diffThemes([], [T("a", ["a", "b"]), T("c", ["c", "d"])]);
  assert.deepEqual(d.appeared, ["a", "c"]);
  assert.equal(d.summary.prior_count, 0);
  assert.equal(d.summary.new_count, 2);
});

test("empty new set: everything dissolved", () => {
  const d = diffThemes([T("a", ["a", "b"])], []);
  assert.deepEqual(d.dissolved, ["a"]);
});

test("both empty: no-op diff, zeroed summary", () => {
  const d = diffThemes([], []);
  assert.deepEqual(d.summary, { prior_count: 0, new_count: 0, persisted: 0, renamed: 0, split: 0, merged: 0, dissolved: 0, appeared: 0 });
});

test("below-threshold overlap does not count as a match (0.5 floor)", () => {
  // prior 'a' has 4 members; new 'a' shares only 1 -> coefficient 1/4 = 0.25 < 0.5 -> dissolved/appeared
  const prior = [T("a", ["a", "b", "c", "d"])];
  const fresh = [T("a", ["a", "x", "y", "z"])];
  const d = diffThemes(prior, fresh);
  assert.deepEqual(d.dissolved, ["a"]);
  assert.deepEqual(d.appeared, ["a"]);
  assert.equal(d.persisted.length, 0);
  assert.equal(d.renamed.length, 0);
});

test("accepts members OR member_ids field name (tolerant input shape)", () => {
  const d = diffThemes([{ id: "a", members: ["a", "b"] }], [{ id: "a", members: ["a", "b"] }]);
  assert.equal(d.persisted.length, 1);
});

test("malformed rows are dropped, not thrown", () => {
  const d = diffThemes([null, { id: 5 }, T("a", ["a", "b"])], [undefined, T("a", ["a", "b"])]);
  assert.equal(d.persisted.length, 1);
});
