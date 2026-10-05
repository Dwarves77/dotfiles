// Tests for brief-staleness.mjs (flywheel U6). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob (run-test-suite.sh + CI, same pattern as theme-stats.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { computeMemberHash, isBriefStale } from "./brief-staleness.mjs";

// Reference implementation of the documented recipe, computed independently of the module under test,
// so this suite proves the recipe (sort lexicographically, join empty, md5 hex) rather than just
// re-asserting whatever computeMemberHash happens to do.
function referenceHash(ids) {
  const sorted = [...ids].sort();
  return createHash("md5").update(sorted.join("")).digest("hex");
}

test("computeMemberHash: matches the documented recipe — sorted, empty-joined, md5 hex", () => {
  const ids = ["b-id", "a-id", "c-id"];
  assert.equal(computeMemberHash(ids), referenceHash(ids));
  assert.equal(computeMemberHash(ids), createHash("md5").update("a-idb-idc-id").digest("hex"));
});

test("computeMemberHash: order-independent — input order never changes the hash", () => {
  const a = ["zzz", "aaa", "mmm"];
  const b = ["mmm", "zzz", "aaa"];
  assert.equal(computeMemberHash(a), computeMemberHash(b));
});

test("computeMemberHash: does not mutate the input array", () => {
  const ids = ["z", "a", "m"];
  const copy = [...ids];
  computeMemberHash(ids);
  assert.deepEqual(ids, copy);
});

test("computeMemberHash: degenerate input never throws", () => {
  assert.equal(computeMemberHash([]), createHash("md5").update("").digest("hex"));
  assert.equal(computeMemberHash(undefined), createHash("md5").update("").digest("hex"));
  assert.equal(computeMemberHash(null), createHash("md5").update("").digest("hex"));
});

test("isBriefStale: matching hash against current membership => fresh (false)", () => {
  const memberIds = ["item-3", "item-1", "item-2"];
  const storedHash = computeMemberHash(memberIds);
  assert.equal(isBriefStale(storedHash, memberIds), false);
});

test("isBriefStale: stored hash from a different membership => stale (true)", () => {
  const generatedAgainst = ["item-1", "item-2"];
  const storedHash = computeMemberHash(generatedAgainst);
  const liveMembers = ["item-1", "item-2", "item-3"]; // membership grew since generation
  assert.equal(isBriefStale(storedHash, liveMembers), true);
});

test("isBriefStale: same member set, different array order => still fresh", () => {
  const storedHash = computeMemberHash(["a", "b", "c"]);
  assert.equal(isBriefStale(storedHash, ["c", "a", "b"]), false);
});

test("isBriefStale: a member swapped out for another of the same count => stale", () => {
  const storedHash = computeMemberHash(["a", "b", "c"]);
  assert.equal(isBriefStale(storedHash, ["a", "b", "d"]), true);
});

// ── resolveBriefForTheme: brief continuity across theme-id drift (lane S3-C) ─────────────────────────
// A theme id is its smallest member id, so a membership change can move the id and orphan the brief. The
// resolver finds the best-overlapping prior brief (theme-delta's own overlap coefficient and threshold) and
// serves it as STALE, never as current.
import { resolveBriefForTheme } from "./brief-staleness.mjs";

const mkBrief = (theme_id, memberIds, extra = {}) => ({
  theme_id, member_hash: computeMemberHash(memberIds), member_ids: memberIds, title: `Brief ${theme_id}`, ...extra,
});

test("resolveBriefForTheme: exact id with matching hash is current, no supersession", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c"] };
  const r = resolveBriefForTheme(theme, [mkBrief("a", ["a", "b", "c"])]);
  assert.equal(r.match, "exact");
  assert.equal(r.stale, false);
  assert.equal(r.supersedes_theme_id, null);
});

test("resolveBriefForTheme: exact id with drifted membership is stale, no supersession", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c", "d"] };
  const r = resolveBriefForTheme(theme, [mkBrief("a", ["a", "b", "c"])]);
  assert.equal(r.match, "exact");
  assert.equal(r.stale, true);
  assert.equal(r.supersedes_theme_id, null);
});

test("resolveBriefForTheme: smallest member changed, brief found by overlap and served STALE", () => {
  // prior theme anchored at "b" (members b c d e); the corpus gained "a", so the new theme id is "a".
  const theme = { id: "a", member_ids: ["a", "b", "c", "d", "e"] };
  const r = resolveBriefForTheme(theme, [mkBrief("b", ["b", "c", "d", "e"])], { liveThemeIds: new Set(["a"]) });
  assert.equal(r.match, "overlap");
  assert.equal(r.stale, true, "an overlap-matched brief is never current");
  assert.equal(r.supersedes_theme_id, "b");
  assert.equal(r.brief.theme_id, "b");
});

test("resolveBriefForTheme: a brief that belongs to another LIVE theme is never borrowed", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c"] };
  const r = resolveBriefForTheme(theme, [mkBrief("b", ["b", "c", "x"])], { liveThemeIds: new Set(["a", "b"]) });
  assert.equal(r.brief, null);
  assert.equal(r.match, null);
});

test("resolveBriefForTheme: overlap below the theme-delta threshold finds nothing", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c", "d"] };
  const r = resolveBriefForTheme(theme, [mkBrief("x", ["x", "y", "z", "b"])], { liveThemeIds: new Set(["a"]) });
  assert.equal(r.brief, null);
});

test("resolveBriefForTheme: picks the best overlap, ties to the smallest prior theme id", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c", "d"] };
  const briefs = [mkBrief("z", ["z", "b", "c"]), mkBrief("m", ["m", "b", "c", "d"])];
  const r = resolveBriefForTheme(theme, briefs, { liveThemeIds: new Set(["a"]) });
  assert.equal(r.supersedes_theme_id, "m");
});

test("resolveBriefForTheme: a legacy brief with no stored members is found through the lineage list, stale", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c"] };
  const legacy = { theme_id: "b", member_hash: computeMemberHash(["b", "c"]), title: "legacy" };
  const r = resolveBriefForTheme(theme, [legacy], { liveThemeIds: new Set(["a"]), lineage: [{ prior_id: "b", new_id: "a" }] });
  assert.equal(r.match, "lineage");
  assert.equal(r.stale, true);
  assert.equal(r.supersedes_theme_id, "b");
});

test("resolveBriefForTheme: a legacy brief with no members and no lineage cannot be matched", () => {
  const theme = { id: "a", member_ids: ["a", "b", "c"] };
  const legacy = { theme_id: "b", member_hash: computeMemberHash(["b", "c"]), title: "legacy" };
  assert.equal(resolveBriefForTheme(theme, [legacy], { liveThemeIds: new Set(["a"]) }).brief, null);
});
