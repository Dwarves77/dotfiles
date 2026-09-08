// Structural regression test for the artboard-12 composition of CommunityRooms.tsx
// (lane community60, 2026-09-08). Text-level, same convention as the ui/ npmtests.
//
// The design audit (`.discipline/rendering/audit/spec/compose-12-community.json`) measures this
// page in a real browser and is the authority on geometry; this file pins the SOURCE-level facts
// that survive a refactor of the mount but must not be undone silently — the regions the artboard
// draws, the shared parts they are assembled from, and the two R7 placements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "CommunityRooms.tsx"), "utf8");
const PAGE = readFileSync(resolve(HERE, "..", "..", "app", "community", "page.tsx"), "utf8");

test("the page is assembled from the shared parts, never a page-local copy of them", () => {
  for (const part of ["SectionRule", "SectionHeading", "CardFoot", "RowTable", "Absence", "Button"]) {
    assert.match(SOURCE, new RegExp(`from "@/components/ui/${part === "RowTable" ? "RowTable" : part}"`));
  }
});

test("the discussion list is artboard 12's table, on RowTable with p12's own measures", () => {
  assert.match(SOURCE, /metrics=\{\{ paddingLeft: 14, rowMinHeight: 56, ruleAfterLastRow: true \}\}/);
  for (const label of ["Juris.", "Discussion", "Replies", "Last activity"]) {
    assert.match(SOURCE, new RegExp(`label: "${label.replace(".", "\\.")}"`));
  }
  assert.match(SOURCE, /width: "64px"/);
  assert.match(SOURCE, /width: "96px"/);
  assert.match(SOURCE, /width: "120px"/);
  assert.match(SOURCE, /width: "44px"/);
});

test("R8: a row is the room INDEX — it keeps the #post-<id> anchor and opens no thread page", () => {
  assert.match(SOURCE, /id: `post-\$\{t\.id\}`/);
  assert.doesNotMatch(SOURCE, /href=\{`\/community\/[^`]*\/thread/);
});

test("the composer is its own NEW POST card, not a control inside the discussions card", () => {
  const indexCard = SOURCE.slice(
    SOURCE.indexOf('data-audit="room-index"'),
    SOURCE.indexOf('data-audit="new-post"')
  );
  assert.doesNotMatch(indexCard, /<textarea/);
  assert.match(SOURCE, /data-audit="new-post"/);
  assert.match(SOURCE, /title=\{`New post · \$\{roomName\}`\}/);
  assert.match(SOURCE, /aside=\{`Posts to the \$\{roomName\} room`\}/);
});

test("the tiles carry the room NAME, never the 3-char short key", () => {
  const grid = SOURCE.slice(
    SOURCE.indexOf('gridTemplateColumns: "repeat(4,1fr)"'),
    SOURCE.indexOf('data-audit="room-index"')
  );
  assert.match(grid, /\{r\.name\}/);
  assert.doesNotMatch(grid, /\{r\.short\}/);
});

test("artboard 12 has no 'Regional rooms' heading above the tiles", () => {
  // Scoped to the seeded render. `NotSeededState` — the pre-seed empty state, which no artboard
  // covers — keeps its own "Regional rooms · not yet open" line (R7).
  const seededRender = SOURCE.slice(
    SOURCE.indexOf("// ── render ──"),
    SOURCE.indexOf("function starterQuestions")
  );
  assert.doesNotMatch(seededRender, /Regional rooms/);
  assert.doesNotMatch(seededRender, /<h2/);
});

test("R7 placement: the region card follows the new-post card, and Vertical groups is last in the rail", () => {
  assert.ok(SOURCE.indexOf('data-audit="new-post"') < SOURCE.indexOf('data-audit="region-card"'));
  assert.ok(SOURCE.indexOf('data-audit="why-post-here"') < SOURCE.indexOf("<VerticalGroupsRailPanel"));
});

test("rail order is the artboard's: Who's here, Verifier sign-off, Why post here", () => {
  const rail = SOURCE.slice(SOURCE.indexOf('data-audit="whos-here"'));
  assert.ok(rail.indexOf("<SignoffRailPanel") < rail.indexOf('data-audit="why-post-here"'));
});

test("relative times come from the server instant, never from the client's own clock", () => {
  assert.match(SOURCE, /const now = nowFrom\(nowIso\)/);
  assert.match(PAGE, /const nowIso = renderNowIso\(\)/);
  assert.match(PAGE, /nowIso=\{nowIso\}/);
});
