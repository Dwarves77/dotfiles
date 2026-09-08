// Repo-coverage regression test for the section rule.
//
// REWRITTEN (lane cardrule, 2026-09-08, operator item A1). This file used to lock a per-file TABLE
// of `<SectionRule />` mount counts: DetailShell exactly 8, ListSurfaceShell exactly 1,
// ListSurfaceRailCards exactly 2, and so on. That table described the structure the operator ruled
// wrong. His words: "The 3px graduated rule at the top of every card is MISSING on all pages except
// the band blocks. It is part of the card component, not a decoration". A per-caller mount count is
// precisely the design in which a caller can forget, and eighteen card types had.
//
// So the assertions move with the structure rather than being weakened. The rule is now mounted in
// exactly ONE place, `SectionCard.tsx`, unconditionally; what this file locks is that fact and its
// consequence: no product file outside the shared `ui/` layer mounts `<SectionRule />` itself any
// more, and every card component in the product renders `<SectionCard>`. The mechanical closure of
// the class (a hand-built card shell anywhere is RED) is fitness function F42, negative-tested in
// .discipline/fitness/functions/F42-card-shell-outside-section-card.test.mjs; the rendered proof
// (the rule's exact gradient on each named card, plus a forbid that fires on any card rendering no
// rule) is in the design audit's compose-* specs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");

function countRealMounts(text) {
  let count = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    if (/`<SectionRule/.test(line)) continue;
    if (/<SectionRule\s*\/>/.test(line)) count += 1;
  }
  return count;
}

function allTsx(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) allTsx(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("SectionCard is the ONE place the rule is mounted, and it mounts it in both of its layouts", () => {
  const text = readFileSync(resolve(here, "SectionCard.tsx"), "utf8");
  // Two mounts: the in-flow form (unpadded card) and the absolutely positioned form (padded card).
  // Which one is used is a layout choice the component makes from `padding`, never a caller's.
  assert.equal(countRealMounts(text), 2);
  // Neither is reachable without the rule: the only branch rendering nothing is ruling 5.2's
  // band-grouping card, named in the component's own prop.
  assert.match(text, /suppressRuleForBandGrouping \? null :/);
});

test("no file outside src/components/ui mounts <SectionRule /> itself any more", () => {
  const offenders = [];
  for (const file of allTsx(ROOT)) {
    const rel = relative(ROOT, file);
    if (rel.startsWith("components/ui/")) continue;
    if (countRealMounts(readFileSync(file, "utf8")) > 0) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `these files mount the rule by hand instead of rendering <SectionCard>: ${offenders.join(", ")}`
  );
});

test("every card component that used to mount the rule by hand now renders <SectionCard>", () => {
  // The files the pre-A1 table named, plus the ones item A1 added.
  const FILES = [
    "components/detail/DetailShell.tsx",
    "components/ui/Masthead.tsx",
    "components/list-surface/ListSurfaceShell.tsx",
    "components/list-surface/ListSurfaceRailCards.tsx",
    "components/account/AccountPrimitives.tsx",
    "components/map/MapPageView.tsx",
    "components/watchlist/WatchlistSurface.tsx",
    "components/dashboard/DashboardBrief.tsx",
    "components/community/CommunityRooms.tsx",
    "components/market/MarketComparativeRibbon.tsx",
    "components/operations/RegionDimensionMatrix.tsx",
    "components/operations/OperationsLedger.tsx",
    "components/operations/OperationsDetailSurface.tsx",
    "components/research/ResearchFindingDetailSurface.tsx",
    "components/pages/MarketSignalDetailSurface.tsx",
    "components/profile/UserProfilePage.tsx",
    "components/sources/ProvisionalReviewTable.tsx",
    "components/admin/AdminDashboard.tsx",
    "components/admin/redesign/AdminIssuesRail.tsx",
    "components/admin/redesign/WorkspacesUsageRow.tsx",
  ];
  for (const rel of FILES) {
    const text = readFileSync(resolve(ROOT, rel), "utf8");
    assert.match(text, /from "@\/components\/ui\/SectionCard"/, `${rel}: does not import SectionCard`);
    assert.match(text, /<SectionCard\b/, `${rel}: does not render SectionCard`);
  }
});

test("DetailShell's eight cards are eight SectionCards (the count moved from rules to cards)", () => {
  const text = readFileSync(resolve(ROOT, "components/detail/DetailShell.tsx"), "utf8");
  const opens = text.match(/^\s*<SectionCard\b/gm) ?? [];
  assert.equal(opens.length, 8);
});

// FOLD 62 (2026-09-08): the shell mounts `SectionCard` DIRECTLY at the band card rather than
// through a local `Card({ noRule })` wrapper of its own, because lane layoutguard had deleted that
// wrapper on the same day for rule 13. Same invariant, same one caller, real structure.
test("ruling 5.2's band-grouping card is the only caller that suppresses the rule", () => {
  const shell = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceShell.tsx"), "utf8");
  assert.match(shell, /<SectionCard key=\{section\.band\.key\} suppressRuleForBandGrouping>/);
  assert.doesNotMatch(shell, /function Card\(/, "the shell has gone back to defining its own card");
  const offenders = [];
  for (const file of allTsx(ROOT)) {
    const rel = relative(ROOT, file);
    if (rel === "components/list-surface/ListSurfaceShell.tsx") continue;
    if (rel === "components/ui/SectionCard.tsx") continue;
    if (/suppressRuleForBandGrouping/.test(readFileSync(file, "utf8"))) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test("SectionRule still renders the exact ruled dark-grey gradation, 3px", () => {
  const text = readFileSync(resolve(here, "SectionRule.tsx"), "utf8");
  assert.match(text, /"linear-gradient\(90deg,#5A5552,#5A5552 22%,rgba\(90,85,82,\.18\)\)"/);
  assert.match(text, /height: 3/);
});

test("SectionHeading emits no rule of its own (the card mounts it; the heading sits under it)", () => {
  const text = readFileSync(resolve(here, "SectionHeading.tsx"), "utf8");
  assert.equal(countRealMounts(text), 0);
  // Ruling 4.1/5.1: no divider below a section title.
  assert.doesNotMatch(text, /borderBottom:/);
});

const NO_BORDER_BOTTOM_UNDER_TITLE = [
  // [file, text that must not appear: the exact removed borderBottom declaration]
  ["components/map/MapPageView.tsx", 'padding: "11px 16px", borderBottom: "1px solid var(--line-2)"'],
  [
    "components/watchlist/WatchlistSurface.tsx",
    'padding: "10px 16px", borderBottom: "1px solid var(--line-2)" }}>\n              <span style={{ fontFamily',
  ],
];

test("the specific title-row borderBottom removed for ruling 4.1/5.1 has not returned", () => {
  for (const [rel, needle] of NO_BORDER_BOTTOM_UNDER_TITLE) {
    const text = readFileSync(resolve(ROOT, rel), "utf8");
    assert.ok(!text.includes(needle), `${rel}: the removed borderBottom-under-title returned`);
  }
});

// KEPT from lane layoutguard (2026-09-08), which had rewritten a stale comp-11 assertion rather
// than deleting it: the filters left the content column for the rail (operator audit 2026-09-07),
// so what has to stay true is that the shell still mounts the rail card carrying them.
test("ListSurfaceShell.tsx still mounts the rail card that carries the facets rules", () => {
  const text = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceShell.tsx"), "utf8");
  assert.match(text, /<FiltersRailCard/);
});
