// Structural regression test for src/components/research/ResearchLedger.tsx's row anatomy and its
// artboard-06 page composition (lane comp-06, 2026-09-08).
//
// README section 0.4: "Market and Research rows add a signal-kind tag after the type - a tag, never a
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
  assert.match(SOURCE, /\(SEVERITY_LABELS as Record<string, string>\)\[/);
  assert.match(SOURCE, /deriveSeverity\(/);
  assert.match(SOURCE, /kind: severityLabel \|\| undefined,/);
  // The page-local composition and its wrapper span are gone, not merely unused.
  assert.doesNotMatch(SOURCE, /<TagChip>\{severityLabel\}<\/TagChip>/);
});

// Coordinator check (2026-10-01): 1,757 live items have NULL severity (the backfill migration is
// retired; severity is set only by regeneration). `deriveSeverity`'s own doc comment says its
// severityColumn short-circuit never actually matches the real migration-102 enum, so it ALWAYS
// fell through to the text/date heuristic, which defaults to "background" ("Background" chip) -
// a confident-looking WRONG DEFAULT for a column that simply has not been regenerated yet. Fixture
// test: an item shaped like a real null-severity row (`{ severity: null, title: "...", added: null }`,
// matching the 1,757 live rows) must read "needs regeneration for severity" per the coordinator's
// exact phrase, checked BEFORE the classifier runs (so a null severity never reaches the heuristic
// and never gets classified as "Background").
test("a null-severity item (fixture: severity: null) shows the coordinator's exact needs-phrase, never a guessed 'Background' chip", () => {
  assert.match(SOURCE, /const severityLabel = r\.severity == null\s*\n\s*\? "needs regeneration for severity"\s*\n\s*: \(SEVERITY_LABELS as Record<string, string>\)\[/);
  // The null check runs BEFORE deriveSeverity is ever called for that row; a null-severity
  // fixture item never reaches the text/date heuristic that would otherwise guess "Background".
  const nullCheckIndex = SOURCE.indexOf("r.severity == null");
  const deriveCallIndex = SOURCE.indexOf("deriveSeverity([r.title");
  assert.ok(nullCheckIndex > -1 && deriveCallIndex > -1 && nullCheckIndex < deriveCallIndex);
});

test("the theme sits in the row's meta text, in the artboard's own order (type · theme · kind), with the horizon band (lane W2-R) appended last and omitted when unassessed", () => {
  assert.match(
    SOURCE,
    /const metaText = \[r\.type, themeLabel, r\.sub \|\| \(r\.modes \?\? \[\]\)\.join\(", "\), horizonLabel\]\.filter\(Boolean\)\.join\(" · "\);/,
  );
});

test("the theme facet is the theme CARD row (aboveRows), never also a rail facet group, one control per facet", () => {
  assert.match(
    SOURCE,
    /<ResearchThemeCards themes=\{themeCards\} selected=\{theme\} onSelect=\{setTheme\} unclassifiedCount=\{unclassifiedCount\} \/>/,
  );
  assert.doesNotMatch(SOURCE, /key: "theme", label: "Theme"/);
});

// Lane L8 (2026-10-02): the write-set-expansion wiring that makes ResearchThemeCards.tsx's Unclassified
// band (built same lane) actually live - closing spec 03 section 10's own-finding. Before this lane,
// ResearchThemeCards had no caller passing it a real unclassified count at all.
test("unclassifiedCount is derived over the same beforeTheme base the theme cards use, counting exactly the rows themeKeyOf drops from the theme-cards loop", () => {
  assert.match(
    SOURCE,
    /const unclassifiedCount = useMemo\(\(\) => beforeTheme\.filter\(\(r\) => !themeKeyOf\(r\)\)\.length, \[beforeTheme\]\);/,
  );
});

test("selecting the Unclassified pill (theme === \"unclassified\") filters the list to exactly the rows with no theme key, not a literal string match against themeKeyOf's real-key-or-null return", () => {
  assert.match(
    SOURCE,
    /theme === "unclassified"\s*\n\s*\? beforeTheme\.filter\(\(r\) => !themeKeyOf\(r\)\)/,
  );
});

test("the 'Clear theme'/empty-state label renders 'Unclassified' (capitalized), not the raw selection-key string, when the Unclassified pill is selected", () => {
  assert.match(
    SOURCE,
    /const themeLabelOf = \(key: string\) =>\s*\n\s*key === "unclassified" \? "Unclassified" : \(THEME_LABELS as Record<string, string>\)\[key\] \?\? key;/,
  );
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
  assert.equal(metaFieldMatches.length, 1, "exactly one row object carries `meta` - the tag is composed into its value, not a sibling field");
});
