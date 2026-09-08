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

// UPDATED (fold 62, 2026-09-08). These four assertions described RailCard as a card it TYPED:
// its own five declarations plus a hand-mounted `<SectionRule/>` above a padded inner wrapper.
// Lane cardrule moved every card in the product onto the shared `SectionCard` (operator item A1:
// the rule "is part of the card component, not a decoration"), so the rule, the border, the
// radius, the shadow and `overflow: hidden` are no longer this file's to get right, and asserting
// that it still types them would be asserting the defect. What the assertions protect is
// unchanged and is now guaranteed by construction: this card comes from the shared shell, its
// content is padded by an INNER wrapper so the rule still sits at the true top edge, and the
// audit hook still reaches the outer card element. F42 closes the class mechanically.
test("RailCard is the shared SectionCard, not a card shell typed here", () => {
  assert.match(SOURCE, /import \{ SectionCard \} from "@\/components\/ui\/SectionCard";/);
  assert.doesNotMatch(SOURCE, /import \{ SectionRule \}/);
  // The chrome belongs to SectionCard now: no local copy of any of it.
  const cardBlock = SOURCE.slice(SOURCE.indexOf("export function RailCard"), SOURCE.indexOf("</SectionCard>"));
  assert.doesNotMatch(cardBlock, /boxShadow: "var\(--shadow-card\)"/);
  assert.doesNotMatch(cardBlock, /borderRadius: "var\(--radius-card\)"/);
});

test("RailCard's content is padded by an INNER wrapper, so the shared rule still spans the true top edge", () => {
  assert.match(SOURCE, /<SectionCard dataAudit=\{dataAudit\}>\s*\n\s*<div style=\{\{ padding: "14px 16px" \}\}>/);
});

test("RailCard accepts an optional dataAudit prop and passes it to the card element", () => {
  assert.match(SOURCE, /dataAudit\?:\s*string/);
  assert.match(SOURCE, /<SectionCard dataAudit=\{dataAudit\}>/);
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

// FOLD-59 (2026-09-08): the INVARIANT is unchanged — the window and the cap come from the shared
// pure module, never a local slice. The INSTANT it is given changed: comp-06 built this card before
// HYDRATION-59's rule landed and passed `new Date()`, this component's own clock. Both of the card's
// clock reads decide a row's urgency band and its day count, so an SSR pass and a hydration pass on
// opposite sides of a day boundary painted different colours for the same row. It now takes the
// server instant as a prop, and `render-clock.npmtest.mjs`'s scanner enforces that repo-wide.
test("ObligationsRailCard applies the shared 30-day window and four-row cap, not a local slice", () => {
  assert.match(SOURCE, /selectObligationRailRows\(state\.events, now\)/);
  assert.match(SOURCE, /const now = nowFrom\(nowIso\);/);
  assert.match(SOURCE, /OBLIGATION_RAIL_ROW_CAP/);
  assert.doesNotMatch(SOURCE, /\.slice\(0, 4\)/);
});

test("ObligationsRailCard carries the artboard's exact head label, Calendar link and audit hooks", () => {
  // Item D2 (2026-09-08): the register is its own page, so the head link is a route, not an in-page
  // anchor to a section that no longer sits on /regulations.
  assert.match(SOURCE, /<RailCard title="Obligations · next 30 days" dataAudit="obligations-rail" headLink=\{\{ label: "Calendar →", href: "\/regulations\/register" \}\}>/);
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
