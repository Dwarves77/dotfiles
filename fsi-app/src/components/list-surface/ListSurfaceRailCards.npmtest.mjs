// Structural regression test for src/components/list-surface/ListSurfaceRailCards.tsx's ruling
// 5.1 fix (lane fix58-lists, 2026-09-07, design audit B163/B170: list-surface.json /
// section-card-lists.json). Text-level, same convention as ListRow.npmtest.mjs's own header
// explains (no JSX mount infra for plain `node --test`; the audit harness's own `railcard`/
// `list-surface-1440` mounts and the rendering guard's smoke specs are the real-DOM check).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ListSurfaceRailCards.tsx"),
  "utf8"
);

test("imports the shared SectionRule, ruling 5.1's own part", () => {
  assert.match(SOURCE, /import \{ SectionRule \} from "@\/components\/ui\/SectionRule";/);
});

test("RailCard mounts SectionRule as the outer card's first child, before a separate padded content wrapper", () => {
  assert.match(SOURCE, /<SectionRule \/>\s*\n\s*<div style=\{\{ padding: "14px 16px" \}\}>/);
});

test("the outer card div carries no padding of its own (moved to the inner wrapper so the rule sits at the true top edge)", () => {
  const cardBlock = SOURCE.slice(SOURCE.indexOf("export function RailCard"), SOURCE.indexOf("<SectionRule"));
  assert.doesNotMatch(cardBlock, /padding:/);
  assert.match(cardBlock, /overflow: "hidden",/);
});

// dataAudit prop (lane compose-lists, 2026-09-08): a design-audit selector hook for callers like
// LegendRailCard that mount RailCard with no wrapper div of their own, so a compose-*.json spec can
// address the REAL page composition, not just a mount fixture's own invented wrapper.
test("RailCard accepts an optional dataAudit prop and sets it as data-audit on the outer card div", () => {
  assert.match(SOURCE, /dataAudit\?:\s*string/);
  const cardBlock = SOURCE.slice(SOURCE.indexOf("export function RailCard"), SOURCE.indexOf("<SectionRule"));
  assert.match(cardBlock, /data-audit=\{dataAudit\}/);
});

test('LegendRailCard passes dataAudit="legend-rail" through to its RailCard', () => {
  assert.match(SOURCE, /<RailCard title="Legend" dataAudit="legend-rail">/);
});

// ObligationsRailCard (lane comp-oblig, 2026-09-08): artboard 02/id="p2" draws an
// "Obligations · next 30 days" card between Filters and Legend. Text-level, same convention as
// above; the real-DOM proof is compose-02-regulations-list.json against the audit harness's
// `compose-02-regulations` mount, and the window/cap logic has its own runtime proof in
// src/lib/forward-events/obligation-rail-select.npmtest.mjs.
test("RailCard accepts an optional headLink and renders it only when passed, so no existing card's head moves", () => {
  assert.match(SOURCE, /headLink\?:\s*\{ label: string; href: string \}/);
  assert.match(SOURCE, /\{headLink \? \(/);
  assert.match(SOURCE, /\) : \(\s*\n\s*<p style=\{\{ \.\.\.RAIL_CARD_TITLE_STYLE, margin: "0 0 10px" \}\}>\{title\}<\/p>/);
});

test("ObligationsRailCard reads the EXISTING bounded obligations route, never a new Supabase query", () => {
  assert.match(SOURCE, /fetch\("\/api\/obligations\/upcoming\?limit=8"/);
  assert.doesNotMatch(SOURCE, /from "@\/lib\/supabase/);
});

test("ObligationsRailCard applies the shared 30-day window and four-row cap, not a local slice", () => {
  assert.match(SOURCE, /selectObligationRailRows\(state\.events, new Date\(\)\)/);
  assert.match(SOURCE, /OBLIGATION_RAIL_ROW_CAP/);
  assert.doesNotMatch(SOURCE, /\.slice\(0, 4\)/);
});

test("ObligationsRailCard carries the artboard's exact head label, Calendar link and audit hooks", () => {
  assert.match(SOURCE, /<RailCard title="Obligations · next 30 days" dataAudit="obligations-rail" headLink=\{\{ label: "Calendar →", href: "#obligation-register" \}\}>/);
  assert.match(SOURCE, /data-audit="obligation-row"/);
});

test("ObligationsRailCard row is the artboard's 3px/48px/1fr grid with the one urgency module's band hue", () => {
  assert.match(SOURCE, /gridTemplateColumns: "3px 48px 1fr", gap: 10, alignItems: "start"/);
  assert.match(SOURCE, /classifyByDays\(days\)\.hex/);
});

test("loading is a Skeleton in the row's final geometry and an empty window is the Absence convention, never a zero", () => {
  assert.match(SOURCE, /state\.loading \? \(\s*\n\s*Array\.from\(\{ length: OBLIGATION_RAIL_ROW_CAP \}/);
  assert.match(SOURCE, /<SkeletonRailDateRow key=\{i\} \/>/);
  assert.match(SOURCE, /<Absence reason="not in primary source" \/>/);
});

test("the date is the shared precision-honest compact formatter, not a second date renderer", () => {
  assert.match(SOURCE, /formatEventDateCompact\(ev\.event_date, ev\.date_precision\)/);
  assert.doesNotMatch(SOURCE, /toLocaleDateString/);
});
