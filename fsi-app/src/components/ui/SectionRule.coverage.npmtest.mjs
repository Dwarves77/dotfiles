// Repo-coverage regression test for GAP G1 (2026-09-07, TRAIN-57 dispatch): "Mount SectionRule on
// EVERY section/panel card in the product ... remove every remaining border-bottom under a section
// title." This lane's write set covers the detail architecture (DetailShell.tsx: DetailHeader,
// DetailExposure, DetailTimeline, DetailSection, AtAGlanceCard, RailLegend, ImpactRailCard,
// InThisListStat), the shared ui/Masthead, the list-surface Card (ListSurfaceShell.tsx — covers all
// four ledgers, which mount ListSurfaceShell), AccountCard (account/settings), the map register/
// regulatory-map Card+CardHead (MapPageView.tsx), and WatchlistSurface's own card. Admin cards, the
// community table card, and auth/onboarding panels were NOT reached this pass — logged in
// DEVIATION-LOG.md as a named follow-up rather than left silently incomplete (CLAUDE.md rule 13).
//
// This test locks the files this pass DID touch: each must mount a real `<SectionRule />` JSX
// element, and the specific `borderBottom` this pass removed must not have returned.
//
// UPDATED (fix58-lists, 2026-09-07, design audit B163/B165/B170): the list-surface rail cards
// (LegendRailCard/RailCard, ListSurfaceRailCards.tsx) and ListSurfaceShell's own facets card(s)
// were NOT BUILT per this audit — no `<SectionRule/>` at all — and are fixed here, additive to
// the coverage this file already locked (ListSurfaceShell's per-ledger Card mount, unchanged).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
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

const FILES_EXPECTING_SECTION_RULE = [
  ["components/detail/DetailShell.tsx", 7], // DetailHeader, DetailExposure, DetailTimeline, DetailSection, AtAGlanceCard, RailLegend, ImpactRailCard, InThisListStat = 8 sites, but DetailMasthead's own SectionRule comes from Masthead.tsx itself (not a second mount here) — see the exact-count test below for the real number.
  ["components/ui/Masthead.tsx", 1],
  ["components/list-surface/ListSurfaceShell.tsx", 1],
  ["components/account/AccountPrimitives.tsx", 1],
  ["components/map/MapPageView.tsx", 1],
  ["components/watchlist/WatchlistSurface.tsx", 1],
  ["components/dashboard/DashboardBrief.tsx", 1],
  ["components/list-surface/ListSurfaceRailCards.tsx", 1],
];

test("every file this pass touched for GAP G1 mounts at least one real <SectionRule />", () => {
  for (const [rel] of FILES_EXPECTING_SECTION_RULE) {
    const text = readFileSync(resolve(ROOT, rel), "utf8");
    const mounts = countRealMounts(text);
    assert.ok(mounts >= 1, `${rel}: expected at least one <SectionRule /> mount, found ${mounts}`);
  }
});

test("DetailShell.tsx mounts SectionRule exactly 8 times (DetailHeader, DetailExposure, DetailTimeline, DetailSection, AtAGlanceCard, RailLegend, ImpactRailCard, InThisListStat)", () => {
  const text = readFileSync(resolve(ROOT, "components/detail/DetailShell.tsx"), "utf8");
  assert.equal(countRealMounts(text), 8);
});

test("ListSurfaceShell's per-band Card skips SectionRule (noRule) to avoid stacking two 3px top rules on the band-colour accent, logged in the component's own doc comment", () => {
  const text = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceShell.tsx"), "utf8");
  assert.match(text, /noRule\?/);
  assert.match(text, /<Card key=\{section\.band\.key\} noRule>/);
});

test("ListSurfaceShell.tsx mounts SectionRule 3 times (the per-ledger Card, and the primary + secondary facets cards)", () => {
  const text = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceShell.tsx"), "utf8");
  assert.equal(countRealMounts(text), 3);
});

const NO_BORDER_BOTTOM_UNDER_TITLE = [
  // [file, text that must not appear — the exact removed borderBottom declaration]
  ["components/account/AccountPrimitives.tsx", 'borderBottom: "1px solid var(--color-border-subtle)",\n          display: "flex"'],
  ["components/map/MapPageView.tsx", 'padding: "11px 16px", borderBottom: "1px solid var(--line-2)"'],
  ["components/watchlist/WatchlistSurface.tsx", 'padding: "10px 16px", borderBottom: "1px solid var(--line-2)" }}>\n              <span style={{ fontFamily'],
];

test("the specific title-row borderBottom this pass removed has not returned", () => {
  for (const [rel, needle] of NO_BORDER_BOTTOM_UNDER_TITLE) {
    const text = readFileSync(resolve(ROOT, rel), "utf8");
    assert.ok(!text.includes(needle), `${rel}: the removed borderBottom-under-title returned`);
  }
});
