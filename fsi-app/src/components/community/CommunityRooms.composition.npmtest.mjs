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

// UPDATED (fold 62, 2026-09-08): the shared part this page takes its card from is `SectionCard`,
// not `SectionRule` directly. Lane cardrule made the rule a property of the card (operator item
// A1), so a page that imported SectionRule itself would now be the page-local copy this test
// exists to forbid. Every audit hook below moved with it, from a literal `data-audit` attribute on
// a hand-typed card div to SectionCard's own `dataAudit` prop, which renders the same attribute on
// the same element: the assertions follow the source, and the rendered selectors the compose-12
// spec addresses are unchanged.
test("the page is assembled from the shared parts, never a page-local copy of them", () => {
  for (const part of ["SectionCard", "SectionHeading", "CardFoot", "RowTable", "Absence", "Button"]) {
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
    SOURCE.indexOf('dataAudit="room-index"'),
    SOURCE.indexOf('dataAudit="new-post"')
  );
  assert.doesNotMatch(indexCard, /<textarea/);
  assert.match(SOURCE, /dataAudit="new-post"/);
  assert.match(SOURCE, /title=\{`New post · \$\{roomName\}`\}/);
  assert.match(SOURCE, /aside=\{`Posts to the \$\{roomName\} room`\}/);
});

test("the tiles carry the room NAME, never the 3-char short key", () => {
  const grid = SOURCE.slice(
    SOURCE.indexOf('gridTemplateColumns: "repeat(4,1fr)"'),
    SOURCE.indexOf('dataAudit="room-index"')
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

test("the '<ROOM> REGION' card and its 'Live in this region' rows are gone (operator ruling 2026-09-08: the thread table supersedes them)", () => {
  assert.doesNotMatch(SOURCE, /dataAudit="region-card"/);
  // Scoped to the seeded render: NotSeededState, the pre-seed empty state no artboard
  // covers, still describes the region ledger in prose (R7).
  const seededRender = SOURCE.slice(
    SOURCE.indexOf("// ── render ──"),
    SOURCE.indexOf("function starterQuestions")
  );
  assert.doesNotMatch(seededRender, /Live in this region/);
  assert.doesNotMatch(seededRender, /region`\}/);
  // The content column ends at the NEW POST card, as the artboard draws it.
  assert.ok(SOURCE.indexOf('dataAudit="new-post"') > SOURCE.indexOf('dataAudit="room-index"'));
});

test("the removed card's live join/leave action keeps a home rather than being dropped with it", () => {
  const composer = SOURCE.slice(SOURCE.indexOf('dataAudit="new-post"'), SOURCE.indexOf("{/* The \"<ROOM> REGION\" card"));
  assert.match(composer, /onClick=\{toggleJoin\}/);
  assert.match(composer, /Joined · leave room/);
});

test("R7 placement: Vertical groups is last in the rail", () => {
  assert.ok(SOURCE.indexOf('dataAudit="why-post-here"') < SOURCE.indexOf("<VerticalGroupsRailPanel"));
});

test("the empty state and 'Start a discussion' both live in the card FOOT, never a second card", () => {
  const indexCard = SOURCE.slice(
    SOURCE.indexOf('dataAudit="room-index"'),
    SOURCE.indexOf('dataAudit="new-post"')
  );
  assert.match(indexCard, /<CardFoot/);
  assert.match(indexCard, /Be first in the \$\{roomName\} room/);
  assert.match(indexCard, /Start a discussion/);
  // The empty state is the foot's own left text, not a paragraph in the card body.
  const foot = indexCard.slice(indexCard.indexOf("<CardFoot"));
  assert.match(foot, /Be first in the/);
});

test("rail order is the artboard's: Who's here, Verifier sign-off, Why post here", () => {
  const rail = SOURCE.slice(SOURCE.indexOf('dataAudit="whos-here"'));
  assert.ok(rail.indexOf("<SignoffRailPanel") < rail.indexOf('dataAudit="why-post-here"'));
});

test("relative times come from the server instant, never from the client's own clock", () => {
  assert.match(SOURCE, /const now = nowFrom\(nowIso\)/);
  assert.match(PAGE, /const nowIso = renderNowIso\(\)/);
  assert.match(PAGE, /nowIso=\{nowIso\}/);
});
