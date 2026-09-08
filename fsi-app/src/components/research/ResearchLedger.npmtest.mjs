// Structural regression test for src/components/research/ResearchLedger.tsx's row anatomy and its
// artboard-06 page composition (lane comp-06, 2026-09-08).
//
// README §0.4: "Market and Research rows add a signal-kind tag after the type — a tag, never a
// band." MarketIntelLedger.tsx does this with its `signalKindLabel` TagChip; ResearchLedger does
// it with the row's SEVERITY, which is the string artboard 06/id="p6" actually draws in that chip
// ("Cost alert", "Background"), with the theme in the meta TEXT beside it ("Finding ·
// Last-mile electrification · Road"). A previous lane (fix58-lists, 2026-09-07) put the THEME in
// the chip and left the severity unrendered; the artboard is the authority and this test now
// describes what it draws.
//
// Text-level, same convention as ListRow.npmtest.mjs's own header explains (no JSX mount infra
// for plain `node --test`; the audit harness and the rendering guard's smoke specs are the
// real-DOM check, exercised live via market-research-rows.json's `research-row` fixture).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ResearchLedger.tsx"),
  "utf8"
);

// UPDATED (fold 62, 2026-09-08). This page no longer composes the chip itself, and that is
// operator item B1: lane listrow moved the kind chip INTO `ListRow`, which renders it from the
// `kind` prop at the artboard's row size and without the border the chip family had grown, so a
// surface cannot drift from that family by composing its own. The invariant is unchanged, the
// severity still comes from the shared classifier and still reaches the row as a chip; what moved
// is where the chip is built. The rendered chip is measured by listrow.json and by compose-06.
test("the severity chip reaches the row through ListRow's own `kind` prop, never composed here", () => {
  assert.match(SOURCE, /const severityLabel = \(SEVERITY_LABELS as Record<string, string>\)\[/);
  assert.match(SOURCE, /deriveSeverity\(/);
  assert.match(SOURCE, /kind: severityLabel \|\| undefined,/);
  // The page-local composition and its wrapper span are gone, not merely unused.
  assert.doesNotMatch(SOURCE, /<TagChip>\{severityLabel\}<\/TagChip>/);
});

test("the theme sits in the row's meta text, in the artboard's own order (type · theme · kind)", () => {
  assert.match(SOURCE, /const metaText = \[r\.type, themeLabel, r\.sub \|\| \(r\.modes \?\? \[\]\)\.join\(", "\)\]\.filter\(Boolean\)\.join\(" · "\);/);
});

test("the theme facet is the theme CARD row (aboveRows), never also a rail facet group, one control per facet", () => {
  assert.match(SOURCE, /aboveRows=\{<ResearchThemeCards themes=\{themeCards\} selected=\{theme\} onSelect=\{setTheme\} \/>\}/);
  assert.doesNotMatch(SOURCE, /key: "theme", label: "Theme"/);
});

test("the Window row is the SHARED ListSurfaceSortRow with controlLabel Window, not a research-local row", () => {
  assert.match(SOURCE, /import \{ ListSurfaceSortRow \} from "@\/components\/list-surface\/ListSurfaceSortRow";/);
  assert.match(SOURCE, /controlLabel="Window"/);
  assert.match(SOURCE, /options=\{WINDOW_OPTIONS\.map/);
});

test("the masthead scope line and command-bar placeholder are the artboard's own strings", () => {
  assert.match(SOURCE, /active findings · /);
  assert.match(SOURCE, /Search findings and themes/);
  assert.match(SOURCE, /searchPlaceholder=\{SEARCH_PLACEHOLDER\}/);
});

test("meta stays a single row cell (one `meta:` field on the row object), the tag augments it rather than forking a new row shape", () => {
  const metaFieldMatches = SOURCE.match(/\n\s*meta,\n/g) || [];
  assert.equal(metaFieldMatches.length, 1, "exactly one row object carries `meta` — the tag is composed into its value, not a sibling field");
});
