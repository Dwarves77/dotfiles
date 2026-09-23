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

// UPDATED (lane W10-RailCard, 2026-09-22). `RailCard` was typed IN THIS FILE from fold-62 through
// lane W10-ListRow-2 (its own five-property SectionCard shell, `headLink`, `dataAudit`). It moved
// to the shared `src/components/ui/RailCard.tsx` part in this lane; the prior-art comment at this
// file's own top explains why (it is now the ONE rail-card part, site-wide, not scoped to the five
// list surfaces). The four assertions that used to check RailCard's own shape here now live in
// `src/components/ui/RailCard.npmtest.mjs`; what THIS file still owns is that it imports the part
// rather than a local copy, and that its own surface-specific cards (Legend included) still pass
// the shape RailCard expects.
test("RailCard is imported from the shared ui part, never typed locally in this file", () => {
  assert.match(SOURCE, /import \{ RailCard \} from "@\/components\/ui\/RailCard";/);
  assert.doesNotMatch(SOURCE, /export function RailCard/, "the list-surface file must not re-define the part it now imports");
  assert.doesNotMatch(SOURCE, /import \{ SectionCard \} from "@\/components\/ui\/SectionCard";/, "SectionCard is RailCard's own dependency now, not this file's");
});

test('LegendRailCard passes dataAudit="legend-rail" through to its RailCard', () => {
  assert.match(SOURCE, /<RailCard title="Legend" dataAudit="legend-rail">/);
});

// ObligationsRailCard (lane comp-oblig, 2026-09-08): artboard 02/id="p2" draws an
// "Obligations · next 30 days" card between Filters and Legend. Text-level, same convention as
// above; the real-DOM proof is compose-02-regulations-list.json against the audit harness's
// `compose-02-regulations` mount, and the window/cap logic has its own runtime proof in
// src/lib/forward-events/obligation-rail-select.npmtest.mjs.
// (`RailCard`'s `headLink` prop itself, its type, and the mutual-exclusivity with `headRight`, is
// typed and tested in `src/components/ui/RailCard.npmtest.mjs`, not duplicated here; the literal
// call-site assertion below, "carries the artboard's exact head label", already covers this file's
// own responsibility: that ObligationsRailCard PASSES headLink correctly.)

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
