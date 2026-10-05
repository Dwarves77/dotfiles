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

// ── density (lane details60, 2026-09-08) ────────────────────────────────────────────────────────
// Artboard 07's CLUSTER SYNTHESIS meta line reads "85 items · density 0.180". `density` is the
// cluster's intra-theme edge density, already stored on connection_themes and already selected by
// api/admin/themes/route.ts; the research detail's own read now selects it too. It is carried
// through the view-model, and it is NULL — never 0 — when the caller did not select it, so the card
// omits the segment rather than rendering a fabricated zero density.

test("density is carried through to the view-model when the theme row has one", () => {
  const members = ["item-1", "item-2"];
  const theme = { id: "t1", member_ids: members, density: 0.18 };
  const brief = {
    theme_id: "t1",
    title: "Maritime decarbonisation",
    brief_md: "body",
    member_hash: createHash("md5").update([...members].sort().join("")).digest("hex"),
    generated_at: "2026-05-01T00:00:00.000Z",
  };
  const view = selectThemeBriefForItem("item-1", [theme], [brief]);
  assert.equal(view.density, 0.18);
  assert.equal(view.memberCount, 2);
});

test("a theme row selected without density yields null, never 0", () => {
  const members = ["item-1"];
  const theme = { id: "t1", member_ids: members };
  const brief = {
    theme_id: "t1",
    title: "Maritime decarbonisation",
    brief_md: "body",
    member_hash: createHash("md5").update([...members].sort().join("")).digest("hex"),
    generated_at: "2026-05-01T00:00:00.000Z",
  };
  const view = selectThemeBriefForItem("item-1", [theme], [brief]);
  assert.equal(view.density, null);
  assert.notEqual(view.density, 0);
});

// ── brief continuity (lane S3-C): a theme whose smallest member changed finds its prior brief, as STALE ──
test("theme-brief: smallest member changed, the prior theme's brief is served stale with supersedesThemeId", () => {
  // The prior theme was anchored at "b" (b c d e); the corpus gained "a", so the live theme id is "a".
  const themes = [{ id: "a", member_ids: ["a", "b", "c", "d", "e"], density: 0.4 }];
  const briefs = [
    {
      theme_id: "b",
      title: "Prior cluster",
      brief_md: "Prior synthesis.",
      member_hash: hashOf(["b", "c", "d", "e"]),
      member_ids: ["b", "c", "d", "e"],
      generated_at: "2026-08-20T00:00:00Z",
    },
  ];
  const view = selectThemeBriefForItem("c", themes, briefs);
  assert.ok(view, "the prior brief is found, not orphaned");
  assert.equal(view.stale, true, "never served as current");
  assert.equal(view.supersedesThemeId, "b");
  assert.equal(view.themeId, "a");
  assert.equal(view.briefMd, "Prior synthesis.");
});

test("theme-brief: an exact-id brief carries supersedesThemeId null", () => {
  const themes = [{ id: "a", member_ids: ["a", "b"] }];
  const briefs = [{ theme_id: "a", title: "T", brief_md: "B", member_hash: hashOf(["a", "b"]), generated_at: "2026-08-20T00:00:00Z" }];
  assert.equal(selectThemeBriefForItem("a", themes, briefs).supersedesThemeId, null);
});

test("theme-brief: a brief belonging to a different live theme is not borrowed by this one", () => {
  const themes = [{ id: "a", member_ids: ["a", "b"] }, { id: "c", member_ids: ["c", "d", "e"] }];
  const briefs = [{ theme_id: "c", title: "C", brief_md: "C body", member_hash: hashOf(["c", "d", "e"]), member_ids: ["c", "d", "e"], generated_at: "2026-08-20T00:00:00Z" }];
  assert.equal(selectThemeBriefForItem("a", themes, briefs), null);
});

// ── lane S3-B: theme analysis on every page ─────────────────────────────────────────────────────────
import { buildThemeAnalysisView, MAX_MEMBERS_PER_PAGE } from "./theme-brief.mjs";
import { SURFACE_LABELS } from "../connections/connection-view-model.mjs";
import { SURFACE_HEADING } from "../../../scripts/turns/theme-briefs/schema.mjs";

const mem = (id, title, item_type, domain = null, legacy_id = null) => ({ id, title, item_type, domain, legacy_id });
const MEMBERS = [
  mem("a", "A regulation", "regulation", 1, "reg-a"),
  mem("b", "A market signal", "market_signal", 4),
  mem("c", "A research finding", "research_finding", 7),
  mem("d", "Another market signal", "market_signal", 4),
];
const STRUCTURED = {
  connection: "They share the ETS surrender scenario.",
  meaning: "Over the long term the surcharge is structural.",
  ramifications: "### Regulations\nFile the surrender.\n\n### Market Intel\nExpect the surcharge to persist.\n\n### Research\nWatch the trial results.",
  watch: "A consultation closes later.",
  gaps: "No operations coverage.",
};
const briefRow = (extra = {}) => ({
  theme_id: "a", title: "Surcharge theme", brief_md: "# Surcharge theme\n\nbody", member_hash: hashOf(["a", "b", "c", "d"]), generated_at: "2026-10-04T00:00:00Z",
  sections: STRUCTURED, member_ids: ["a", "b", "c", "d"], ...extra,
});
const THEMES = [{ id: "a", member_ids: ["a", "b", "c", "d"], density: 0.5, surfaces: ["regulations", "market", "research"], pivots: [{ id: "d", centrality: 2 }, { id: "b", centrality: 1 }] }];

test("S3-B: a Market Intel item gets the Market Intel ramifications subsection, not another page's", () => {
  const v = buildThemeAnalysisView({ itemId: "b", surface: "market", themes: THEMES, briefs: [briefRow()], members: MEMBERS });
  assert.equal(v.sections.forThisPage, "Expect the surcharge to persist.");
  assert.ok(!JSON.stringify(v).includes("File the surrender"), "the Regulations subsection must not travel to a Market item");
  assert.ok(!JSON.stringify(v).includes("Watch the trial results"));
  assert.equal(v.sections.meaning, STRUCTURED.meaning);
  assert.equal(v.sections.watch, STRUCTURED.watch);
  assert.equal(v.title, "Surcharge theme");
  assert.equal(v.hasBrief, true);
  assert.equal(v.stale, false);
});

test("S3-B: the same theme read from a Regulations item shows the Regulations subsection", () => {
  const v = buildThemeAnalysisView({ itemId: "a", surface: "regulations", themes: THEMES, briefs: [briefRow()], members: MEMBERS });
  assert.equal(v.sections.forThisPage, "File the surrender.");
});

test("S3-B: other members are grouped by page with links, other pages first, the item itself excluded", () => {
  const v = buildThemeAnalysisView({ itemId: "b", surface: "market", themes: THEMES, briefs: [briefRow()], members: MEMBERS });
  assert.deepEqual(v.membersByPage.map((g) => g.surface), ["regulations", "research", "market"]);
  const market = v.membersByPage.find((g) => g.surface === "market");
  assert.deepEqual(market.items.map((i) => i.title), ["Another market signal"]);
  assert.equal(market.samePage, true);
  const reg = v.membersByPage.find((g) => g.surface === "regulations");
  assert.equal(reg.items[0].href, "/regulations/reg-a", "link uses legacy id when present");
  assert.equal(v.membersByPage.flatMap((g) => g.items).some((i) => i.id === "b"), false);
  assert.deepEqual(v.pages.map((p) => p.label), ["Regulations", "Market Intel", "Research"]);
});

test("S3-B: a theme with no brief shows its members and names what is missing", () => {
  const v = buildThemeAnalysisView({ itemId: "b", surface: "market", themes: THEMES, briefs: [], members: MEMBERS });
  assert.equal(v.hasBrief, false);
  assert.equal(v.sections, null);
  assert.equal(v.title, null);
  assert.match(v.absence, /brief for this theme has not been written/i);
  assert.ok(v.membersByPage.length > 0);
});

test("S3-B: a drifted theme id still finds its prior brief, shown stale", () => {
  const themes = [{ id: "a", member_ids: ["a", "b", "c", "d", "e"], density: 0.4, pivots: [] }];
  const prior = briefRow({ theme_id: "b", member_hash: hashOf(["b", "c", "d", "e"]), member_ids: ["b", "c", "d", "e"] });
  const v = buildThemeAnalysisView({ itemId: "c", surface: "research", themes, briefs: [prior], members: MEMBERS });
  assert.equal(v.hasBrief, true);
  assert.equal(v.stale, true);
  assert.equal(v.supersedesThemeId, "b");
  assert.equal(v.sections.forThisPage, "Watch the trial results.");
});

test("S3-B: a brief written before migration 351 (no sections) carries its brief_md and no sections", () => {
  const v = buildThemeAnalysisView({ itemId: "b", surface: "market", themes: THEMES, briefs: [briefRow({ sections: undefined, member_ids: undefined })], members: MEMBERS });
  assert.equal(v.sections, null);
  assert.equal(v.briefMd, "# Surcharge theme\n\nbody");
  assert.equal(v.hasBrief, true);
  assert.equal(v.absence, null);
});

test("S3-B: a structured brief with no subsection for this page says so instead of showing another page's", () => {
  const sections = { ...STRUCTURED, ramifications: "### Regulations\nOnly this page." };
  const v = buildThemeAnalysisView({ itemId: "b", surface: "market", themes: THEMES, briefs: [briefRow({ sections })], members: MEMBERS });
  assert.equal(v.sections.forThisPage, null);
  assert.equal(v.ramificationsMissing, true);
});

test("S3-B: an item in no theme gives null, and bad input never throws", () => {
  assert.equal(buildThemeAnalysisView({ itemId: "zzz", surface: "market", themes: THEMES, briefs: [], members: [] }), null);
  assert.equal(buildThemeAnalysisView({ itemId: "a", surface: "market", themes: null, briefs: null, members: null }), null);
  assert.equal(buildThemeAnalysisView({}), null);
});

test("S3-B: a page's member list is capped and says how many more there are", () => {
  const ids = ["a", ...Array.from({ length: MAX_MEMBERS_PER_PAGE + 3 }, (_, i) => `m${i}`)];
  const members = [mem("a", "Self", "market_signal", 4), ...ids.slice(1).map((id, i) => mem(id, `Signal ${i}`, "regulation", 1))];
  const v = buildThemeAnalysisView({ itemId: "a", surface: "market", themes: [{ id: "a", member_ids: ids }], briefs: [], members });
  const reg = v.membersByPage.find((g) => g.surface === "regulations");
  assert.equal(reg.items.length, MAX_MEMBERS_PER_PAGE);
  assert.equal(reg.total, MAX_MEMBERS_PER_PAGE + 3);
});

test("S3-B: the surface labels agree with the theme-brief ramifications headings", () => {
  assert.deepEqual({ ...SURFACE_HEADING }, { ...SURFACE_LABELS });
});

// ── lane S3-B: theme chips for the four list strips and the dashboard ───────────────────────────────
import { buildThemeChips } from "./theme-brief.mjs";

const T1 = { id: "a", member_ids: ["a", "b", "c", "d"], convergence: 2, surfaces: ["regulations", "market", "research"], pivots: [{ id: "d", centrality: 2 }, { id: "a", centrality: 1 }] };
const T2 = { id: "x", member_ids: ["x", "y"], convergence: 3, surfaces: ["market"], pivots: [{ id: "x", centrality: 1 }] };
const ITEMS = [...MEMBERS, mem("x", "Only market one", "market_signal", 4), mem("y", "Only market two", "market_signal", 4)];

test("S3-B chips: a page's strip shows the themes with at least one item of that page, most convergent first", () => {
  const chips = buildThemeChips({ themes: [T1, T2], items: ITEMS, briefs: [], surface: "market", max: 6 });
  assert.deepEqual(chips.map((c) => c.themeId), ["x", "a"], "convergence 3 before 2");
  const regChips = buildThemeChips({ themes: [T1, T2], items: ITEMS, briefs: [], surface: "regulations", max: 6 });
  assert.deepEqual(regChips.map((c) => c.themeId), ["a"], "a market-only theme has nothing on Regulations");
});

test("S3-B chips: the chip opens the pivot item on THAT page, naming every page the theme spans", () => {
  const [chip] = buildThemeChips({ themes: [T1], items: ITEMS, briefs: [], surface: "regulations", max: 6 });
  assert.equal(chip.href, "/regulations/reg-a", "the only Regulations member is the link target");
  assert.equal(chip.itemTitle, "A regulation");
  assert.deepEqual(chip.pages.map((p) => p.label), ["Regulations", "Market Intel", "Research"]);
  const [mchip] = buildThemeChips({ themes: [T1], items: ITEMS, briefs: [], surface: "market", max: 6 });
  assert.equal(mchip.itemTitle, "Another market signal", "the higher-centrality pivot among the page's members");
});

test("S3-B chips: dashboard mode keeps only themes spanning two or more pages and links the top pivot", () => {
  const chips = buildThemeChips({ themes: [T1, T2], items: ITEMS, briefs: [], surface: null, minPages: 2, max: 6 });
  assert.deepEqual(chips.map((c) => c.themeId), ["a"]);
  assert.equal(chips[0].href, "/market/d");
});

test("S3-B chips: a brief gives its title and a stale flag; none gives hasBrief false; the cap holds", () => {
  const withBrief = buildThemeChips({ themes: [T1], items: ITEMS, briefs: [briefRow()], surface: "market", max: 6 })[0];
  assert.equal(withBrief.hasBrief, true);
  assert.equal(withBrief.briefTitle, "Surcharge theme");
  assert.equal(withBrief.stale, false);
  const none = buildThemeChips({ themes: [T1], items: ITEMS, briefs: [], surface: "market", max: 6 })[0];
  assert.equal(none.hasBrief, false);
  assert.equal(none.briefTitle, null);
  assert.equal(buildThemeChips({ themes: [T1, T2], items: ITEMS, briefs: [], surface: "market", max: 1 }).length, 1);
});

test("S3-B chips: empty or bad input gives no chips and never throws", () => {
  assert.deepEqual(buildThemeChips({}), []);
  assert.deepEqual(buildThemeChips({ themes: null, items: null, briefs: null, surface: "market" }), []);
});
