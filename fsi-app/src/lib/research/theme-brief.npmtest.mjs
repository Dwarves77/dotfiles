// theme-brief.npmtest.mjs — proof for the pure theme-brief view-model (WO-25).
//
// Named *.npmtest.mjs (not *.test.mjs) deliberately: fsi-app/src/lib/research/ matches no glob in
// .discipline/run-test-suite.sh (that list is explicit, not a directory scan), so a *.test.mjs here
// would be an ORPHANED PROOF — green locally, executed by nothing in CI, exactly the class F23
// (governed-surface-coverage) exists to catch. `git ls-files 'fsi-app/src/**/*.npmtest.mjs'` is a
// directory-agnostic glob wired into discipline.yml's "App unit tests requiring npm deps" job
// (execution-wiring.mjs surface 2), so this naming — not editing run-test-suite.sh or discipline.yml —
// is what makes the proof actually run. The module under test has no npm dependency itself; the name
// is chosen for wiring, not because `npm ci` is required to execute it.
//
// Covers exactly the four cases WO-25's spec names: a fresh brief renders; a stale brief renders WITH
// stale:true (content still present — never silently dropped); an item in no theme yields null (honest
// omission); a theme_briefs row whose theme_id matches no live connection_themes row (orphaned per
// migration 266) never surfaces for ANY item, proven structurally rather than by a special-cased check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { findThemeForItem, selectThemeBriefForItem } from "./theme-brief.mjs";

// Mirrors brief-staleness.mjs's exact recipe (sort, empty-join, md5) so fixtures can construct a
// "hash matches live membership" brief without importing internals — same fixture-construction
// approach brief-staleness.test.mjs itself uses.
function hashOf(ids) {
  return createHash("md5").update([...ids].sort().join("")).digest("hex");
}

test("theme-brief: fresh brief renders as current, not stale", () => {
  const themes = [{ id: "theme-1", member_ids: ["a", "b", "c"] }];
  const briefs = [
    {
      theme_id: "theme-1",
      title: "Maritime decarbonisation",
      brief_md: "Cluster-level synthesis text.",
      member_hash: hashOf(["a", "b", "c"]),
      generated_at: "2026-08-20T00:00:00Z",
    },
  ];
  const view = selectThemeBriefForItem("a", themes, briefs);
  assert.ok(view, "expected a view-model for an item in a briefed theme");
  assert.equal(view.stale, false);
  assert.equal(view.title, "Maritime decarbonisation");
  assert.equal(view.briefMd, "Cluster-level synthesis text.");
  assert.equal(view.memberCount, 3);
  assert.equal(view.themeId, "theme-1");
});

test("theme-brief: stale brief still returns content, flagged stale (never silently current)", () => {
  const themes = [{ id: "theme-1", member_ids: ["a", "b", "c", "d"] }]; // membership grew since generation
  const briefs = [
    {
      theme_id: "theme-1",
      title: "Maritime decarbonisation",
      brief_md: "Written against the 3-member cluster.",
      member_hash: hashOf(["a", "b", "c"]), // stored against the OLD membership
      generated_at: "2026-08-01T00:00:00Z",
    },
  ];
  const view = selectThemeBriefForItem("a", themes, briefs);
  assert.ok(view, "a stale brief must still render — never silently omitted in favor of nothing");
  assert.equal(view.stale, true);
  // Content is NOT nulled out when stale — the caller is responsible for the visible STALE badge;
  // this module never launders a stale brief into an empty one, and never launders it into a
  // brief that LOOKS current either.
  assert.equal(view.briefMd, "Written against the 3-member cluster.");
});

test("theme-brief: item in no live theme -> null (honest omission, no card)", () => {
  const themes = [{ id: "theme-1", member_ids: ["x", "y"] }];
  const briefs = [
    {
      theme_id: "theme-1",
      title: "Some other cluster",
      brief_md: "...",
      member_hash: hashOf(["x", "y"]),
      generated_at: "2026-08-20T00:00:00Z",
    },
  ];
  assert.equal(selectThemeBriefForItem("not-a-member", themes, briefs), null);
  assert.equal(findThemeForItem("not-a-member", themes), null);
});

test("theme-brief: item in a live theme with no brief row yet -> null", () => {
  const themes = [{ id: "theme-1", member_ids: ["a", "b"] }];
  const view = selectThemeBriefForItem("a", themes, /* briefs */ []);
  assert.equal(view, null);
});

test("theme-brief: orphaned brief (theme_id matches no live theme) never surfaces for any item", () => {
  // theme-1 is live and has NO brief. "ghost-theme" has a brief but no longer exists in
  // connection_themes (it was re-clustered away) — migration 266's own contract: hidden by the
  // join, kept as history, never invented into the UI. This is proven structurally: the orphan
  // brief is simply unreachable from any item, because lookup always starts from the live themes
  // array, never from the briefs array directly.
  const themes = [{ id: "theme-1", member_ids: ["a", "b"] }];
  const briefs = [
    {
      theme_id: "ghost-theme",
      title: "Stale cluster, since re-clustered away",
      brief_md: "Orphaned history.",
      member_hash: hashOf(["a", "b", "z"]),
      generated_at: "2026-07-01T00:00:00Z",
    },
  ];
  // Neither member of the live theme picks up the orphaned brief...
  assert.equal(selectThemeBriefForItem("a", themes, briefs), null);
  assert.equal(selectThemeBriefForItem("b", themes, briefs), null);
  // ...nor does any id that happens to appear in the orphan's own stale member list, because that
  // list is not read from a live connection_themes row at all.
  assert.equal(selectThemeBriefForItem("z", themes, briefs), null);
});

test("theme-brief: multiple theme matches (clustering anomaly) takes the first rather than merging", () => {
  const themes = [
    { id: "theme-1", member_ids: ["a"] },
    { id: "theme-2", member_ids: ["a"] },
  ];
  const found = findThemeForItem("a", themes);
  assert.equal(found.id, "theme-1");
});

test("theme-brief: defensive on missing/malformed inputs", () => {
  assert.equal(selectThemeBriefForItem("a", [], []), null);
  assert.equal(selectThemeBriefForItem("a", null, null), null);
  assert.equal(selectThemeBriefForItem("", [{ id: "t", member_ids: ["a"] }], []), null);
});
