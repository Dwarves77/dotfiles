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
//
// UPDATED AGAIN (lane layoutguard, 2026-09-08), and this is a STRENGTHENING, not a relaxation.
// Four files carried a byte-for-byte identical local `function Card()`, each mounting its own
// `<SectionRule/>`: DashboardBrief, ListSurfaceShell, MapPageView and WatchlistSurface. That
// duplication is what CLAUDE.md rule 13 forbids and what made the operator's L6 ("every card gets
// its 3px top rule") unenforceable - with four definitions there was no one place a card's chrome
// could be asserted. There is one now: `components/ui/Card.tsx`. So the four files no longer mount
// the rule THEMSELVES; they mount `<Card>`, which mounts it. The invariant this file exists to
// protect is unchanged and is now guaranteed by construction rather than by four coincidences, and
// the assertions below say so: each of those files must mount the shared Card, and Card.tsx must
// mount exactly one SectionRule. A file that goes back to drawing its own card div fails here.
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
  ["components/account/AccountPrimitives.tsx", 1],
  ["components/list-surface/ListSurfaceRailCards.tsx", 1],
  // THE ONE CARD (lane layoutguard, 2026-09-08). The four surfaces that used to carry their own
  // copy are asserted below instead, by the part they now mount.
  ["components/ui/Card.tsx", 1],
];

/** The four that used to define their own `Card` and now mount the shared one. */
const FILES_MOUNTING_THE_SHARED_CARD = [
  "components/list-surface/ListSurfaceShell.tsx",
  "components/map/MapPageView.tsx",
  "components/watchlist/WatchlistSurface.tsx",
  "components/dashboard/DashboardBrief.tsx",
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

test("the four surfaces that used to define their own Card now mount the shared one, and define none of their own", () => {
  for (const rel of FILES_MOUNTING_THE_SHARED_CARD) {
    const text = readFileSync(resolve(ROOT, rel), "utf8");
    assert.match(text, /import \{ Card \} from "@\/components\/ui\/Card";/, `${rel}: does not mount the shared Card`);
    assert.doesNotMatch(text, /function Card\(/, `${rel}: has gone back to defining its own card`);
    assert.equal(countRealMounts(text), 0, `${rel}: mounts a SectionRule of its own instead of taking it from Card`);
  }
});

test("Card.tsx mounts exactly one SectionRule, so every card in the product carries exactly one", () => {
  const text = readFileSync(resolve(ROOT, "components/ui/Card.tsx"), "utf8");
  assert.equal(countRealMounts(text), 1);
  // The chrome the operator's L6 names, all four parts, in the one place they can be asserted.
  for (const decl of [/border: "1px solid var\(--line-1\)"/, /borderRadius: "var\(--radius-card\)"/, /boxShadow: "var\(--shadow-card\)"/]) {
    assert.match(text, decl);
  }
});

test("ListSurfaceShell's per-band Card still skips SectionRule (noRule) rather than stacking two 3px top rules on the band-colour accent", () => {
  const shell = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceShell.tsx"), "utf8");
  assert.match(shell, /<Card key=\{section\.band\.key\} noRule>/);
  // The prop moved to the shared component with its caller; it is not a dropped capability.
  assert.match(readFileSync(resolve(ROOT, "components/ui/Card.tsx"), "utf8"), /noRule\?/);
});

// UPDATED (lane comp-11, 2026-09-08). This assertion had been RED on the branch since the
// filters-to-the-rail relocation (operator audit 2026-09-07, "the filters were not above the
// regulations, they were on the right"): that change deleted ListSurfaceShell's two content-column
// facets cards, so the file's three mounts became one — the per-ledger Card — and the two the
// facets cards used to carry now live on FiltersRailCard in ListSurfaceRailCards.tsx, which the
// list above already locks. The test described the old structure; it now describes the product.
// UPDATED (lane layoutguard, 2026-09-08): the shell's one mount became zero when its local Card
// definition was replaced by the shared one. What the assertion was protecting - that the shell
// still mounts the rail card carrying the facets, so the rules that left the content column are
// still drawn - is kept verbatim.
test("ListSurfaceShell.tsx still mounts the rail card that carries the facets rules", () => {
  const text = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceShell.tsx"), "utf8");
  assert.match(text, /<FiltersRailCard/);
});

// Lane comp-11 (2026-09-08): the two card heads on artboard 11 are the shared SectionHeading, and
// the cards around them are the shared `Card` (WatchlistSurface's own helper until lane
// layoutguard, 2026-09-08) - the card mounts the rule, the heading sits under it.
test("SectionHeading emits no rule of its own (the card mounts SectionRule; the heading sits under it)", () => {
  const text = readFileSync(resolve(ROOT, "components/ui/SectionHeading.tsx"), "utf8");
  assert.equal(countRealMounts(text), 0);
  // Ruling 4.1/5.1: no divider below a section title, in the shared component this time.
  assert.doesNotMatch(text, /borderBottom:/);
});

// Lane comp-oblig (2026-09-08): the rail file mounts the rule twice — RailCard, which every
// titled rail card (Obligations, Coverage, Legend) wraps itself in, and FiltersRailCard.
test("ListSurfaceRailCards.tsx mounts SectionRule twice (RailCard, which every titled rail card uses, and FiltersRailCard)", () => {
  const text = readFileSync(resolve(ROOT, "components/list-surface/ListSurfaceRailCards.tsx"), "utf8");
  assert.equal(countRealMounts(text), 2);
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
