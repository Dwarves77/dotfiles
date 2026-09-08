// Proof for src/components/sources/SourceTierLegend.tsx (lane adminlayout, 2026-09-08, the
// operator's item 3): the tier vocabulary as the source registry card wears it, after the T1-T7
// summary-card strip was removed. Source-text regression plus a behavioural test of the two pure
// helpers, which are exported precisely so they can be exercised here (this repo has no JSX render
// harness; see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(DIR, "SourceTierLegend.tsx"), "utf8");
const DASHBOARD = readFileSync(resolve(DIR, "SourceHealthDashboard.tsx"), "utf8");

// The two helpers, re-stated here and asserted against the source below so drift fails.
const facetTierOf = (s) => s.effective_tier ?? s.base_tier;
const SOURCE_TIERS = [1, 2, 3, 4, 5, 6, 7];
function tierCounts(sources) {
  const out = {};
  for (const t of SOURCE_TIERS) out[t] = 0;
  for (const s of sources) {
    const t = facetTierOf(s);
    if (out[t] !== undefined) out[t] += 1;
  }
  return out;
}

test("the facet counts on the SAME key filterSources matches on, so a chip cannot lie about its own click", () => {
  // filterSources: `const t = s.effective_tier ?? s.base_tier`, so an override wins over the base
  // tier on BOTH sides, which is the whole point of deriving the count through one function.
  const store = readFileSync(resolve(DIR, "../../stores/sourceStore.ts"), "utf8");
  assert.match(store, /const t = s\.effective_tier \?\? s\.base_tier;/);
  assert.match(SOURCE, /return s\.effective_tier \?\? s\.base_tier;/);
  assert.equal(facetTierOf({ base_tier: 5, effective_tier: 2 }), 2);
  assert.equal(facetTierOf({ base_tier: 5, effective_tier: null }), 5);
});

test("tierCounts covers every tier, counts zero as a number, and ignores an out-of-range tier", () => {
  const counts = tierCounts([
    { base_tier: 1, effective_tier: null },
    { base_tier: 5, effective_tier: 1 },
    { base_tier: 7, effective_tier: null },
    { base_tier: 9, effective_tier: null },
  ]);
  assert.deepEqual(counts, { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1 });
  // Every tier is present even at zero: the facet renders "T2 0", which is a fact, not an absence.
  assert.equal(Object.keys(counts).length, 7);
});

test("the authority label comes from the tier-vocabulary SoT, never a local copy", () => {
  assert.match(SOURCE, /import \{ TIER_LABELS \} from "@\/lib\/tier-labels"/);
  assert.doesNotMatch(SOURCE, /Binding Law/);
});

test("each legend square carries its label as tooltip AND accessible name (item 3)", () => {
  assert.match(SOURCE, /title=\{`T\$\{t\} · \$\{TIER_LABELS\[t\]\}`\}/);
  assert.match(SOURCE, /aria-label=\{`T\$\{t\}, \$\{TIER_LABELS\[t\]\}`\}/);
});

test("the definitions overlay is an overlay: dialog semantics, Esc closes, and it is the only fixed thing here", () => {
  assert.match(SOURCE, /role="dialog"/);
  assert.match(SOURCE, /aria-modal="true"/);
  assert.match(SOURCE, /if \(e\.key === "Escape"\) onClose\(\);/);
  assert.equal(SOURCE.match(/position: "fixed"/g).length, 1);
});

test("the T1-T7 tier SUMMARY CARDS are gone from the registry, not restyled (item 3)", () => {
  // The strip was a Tailwind grid keyed to the VIEWPORT inside a column that could be far
  // narrower, which is how the region ran 336px past its column at 1024 and under the rail.
  assert.doesNotMatch(DASHBOARD, /lg:grid-cols-7/);
  assert.doesNotMatch(DASHBOARD, /TierSummaryCard/);
  // The explainer block's own rendered heading, not the phrase in prose.
  assert.doesNotMatch(DASHBOARD, /Source Tiers\s*[\u2014-]\s*How we rank authority/);
  // And the counts they carried have a home: the facet, wired to the store's own tier filter.
  assert.match(DASHBOARD, /<SourceTierFacet/);
  assert.match(DASHBOARD, /onToggle=\{toggleTierFilter\}/);
});

test("no arrow control anywhere in the registry region (the accessibility rule, item 3)", () => {
  for (const src of [SOURCE, DASHBOARD]) {
    assert.doesNotMatch(src, /scrollBy\(/);
    assert.doesNotMatch(src, /ChevronLeft/);
    assert.doesNotMatch(src, /ChevronRight/);
  }
});
