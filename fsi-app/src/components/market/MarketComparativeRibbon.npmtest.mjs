// Structural regression test for src/components/market/MarketComparativeRibbon.tsx's `embedded`
// prop — lane compose-lists, 2026-09-08: artboard 04/id="p4" nests the "Headline series" card
// inside ListSurfaceShell's content column (between the band tiles and the sort row), not as its
// own full-bleed page section. Source-text regression (no JSX render harness in this repo — see
// SectionRule.npmtest.mjs's own header for the established pattern).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(here, "MarketComparativeRibbon.tsx"), "utf8");
const LEDGER_SOURCE = readFileSync(resolve(here, "MarketIntelLedger.tsx"), "utf8");
const PAGE_SOURCE = readFileSync(
  resolve(here, "..", "..", "app", "market", "page.tsx"),
  "utf8"
);

test("MarketComparativeRibbon accepts an `embedded` prop, defaulting to false", () => {
  assert.match(SOURCE, /embedded\?:\s*boolean/);
  assert.match(SOURCE, /embedded\s*=\s*false/);
});

// UPDATED (fold 62, 2026-09-08): embedded mode no longer mounts the rule itself. Lane cardrule
// made the rule a property of the card (operator item A1), so the embedded form IS the shared
// `SectionCard` and the rule comes with it, along with the border, the radius and the shadow this
// ribbon used to draw without. Same invariant, stronger guarantee: a card that cannot be built
// without its rule cannot lose it, and the standalone form still draws no card chrome at all.
test("embedded mode renders the shared SectionCard (which mounts ruling 5.1's rule) and drops the standalone page-section chrome", () => {
  assert.match(SOURCE, /import \{ SectionCard \} from "@\/components\/ui\/SectionCard"/);
  assert.doesNotMatch(SOURCE, /import \{ SectionRule \}/);
  assert.match(SOURCE, /return embedded \? \(\s*\n\s*<SectionCard dataAudit="headline-series">/);
});

test("no borderBottom divider under the title row (ruling 5.1/4.1 — a divider below the title was the exact defect named)", () => {
  const titleRow = SOURCE.slice(SOURCE.indexOf("<h2"), SOURCE.indexOf("Headline series") + 40);
  assert.doesNotMatch(titleRow, /borderBottom:\s*"/);
  assert.doesNotMatch(SOURCE, /borderBottom:\s*"2px solid/);
});

test("title text matches the artboard exactly: 'Headline series', not the file's own 'Comparative ribbon' identity", () => {
  assert.match(SOURCE, />\s*Headline series\s*</);
  assert.doesNotMatch(SOURCE, />\s*Comparative ribbon\s*</);
});

// UPDATED (lane W10-NavCard, 2026-09-23, bundle ruling 6): the series board is now its own route,
// not an in-page anchor; the link is a Next <Link>, not a raw <a href="#...">.
test("summary line links to the /market/series route via next/link, never a raw URL in running text", () => {
  assert.match(SOURCE, /import Link from "next\/link";/);
  assert.match(SOURCE, /<Link href="\/market\/series"/);
  assert.doesNotMatch(SOURCE, /href="#market-series-board"/);
  assert.doesNotMatch(SOURCE, /https?:\/\//);
});

test("MarketIntelLedger accepts headlineSeries and wires it into ListSurfaceShell's aboveRows slot", () => {
  assert.match(LEDGER_SOURCE, /headlineSeries\?:\s*ReactNode/);
  assert.match(LEDGER_SOURCE, /aboveRows=\{headlineSeries\}/);
});

test("market/page.tsx passes the ribbon as headlineSeries (embedded), not as a standalone section", () => {
  assert.match(
    PAGE_SOURCE,
    /headlineSeries=\{<MarketComparativeRibbon board=\{seriesBoard\} embedded \/>\}/
  );
  const beforeLedger = PAGE_SOURCE.slice(0, PAGE_SOURCE.indexOf("<MarketIntelLedger"));
  assert.doesNotMatch(
    beforeLedger,
    /<MarketComparativeRibbon\b/,
    "the ribbon must not also render as its own standalone page section above/below the ledger"
  );
});

// UPDATED (lane W10-NavCard, 2026-09-23, bundle ruling 6): the inline board + its anchor id are
// gone from /market; the board renders at its own route, src/app/market/series/page.tsx.
test("market/page.tsx no longer mounts the inline series board or its anchor id", () => {
  assert.doesNotMatch(PAGE_SOURCE, /id="market-series-board"/);
  assert.doesNotMatch(PAGE_SOURCE, /<MarketSeriesBoard\b/);
});

test("market/series/page.tsx mounts MarketSeriesBoard against the same fetchMarketSeriesBoard() fetch", () => {
  const seriesPageSource = readFileSync(resolve(here, "..", "..", "app", "market", "series", "page.tsx"), "utf8");
  assert.match(seriesPageSource, /import \{ MarketSeriesBoard \} from "@\/components\/market\/MarketSeriesBoard";/);
  assert.match(seriesPageSource, /fetchMarketSeriesBoard\(\)/);
  assert.match(seriesPageSource, /title="Market \/ Series board"/);
});
