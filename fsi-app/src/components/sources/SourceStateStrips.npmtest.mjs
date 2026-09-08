// Proof for the two state-note strips the source registry card carries (lane adminlayout,
// 2026-09-08, the operator's item 4): the B.2 regeneration strip under the card's tab row, and the
// scraping strip at the card foot with its 44px action row.
//
// Source-text, and deliberately so for the scraping strip: `GlobalPauseToggle` renders nothing
// until /api/admin/sources/pause-global answers, and this sandbox has no live Supabase project
// (DEVIATION-LOG.md), so the design audit cannot measure it in a browser. The regeneration strip
// IS measured in the browser too, by
// .discipline/rendering/audit/spec/compose-13-admin-registry.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const NOTE = readFileSync(resolve(DIR, "B2RegenerationNote.tsx"), "utf8");
const CONTROLS = readFileSync(resolve(DIR, "SourceAdminControls.tsx"), "utf8");
const DASHBOARD = readFileSync(resolve(DIR, "SourceHealthDashboard.tsx"), "utf8");

test("both strips are the SHARED StateNote, and there is no second strip component", () => {
  for (const src of [NOTE, CONTROLS]) {
    assert.match(src, /import \{ StateNote \} from "@\/components\/ui\/StateNote"/);
    assert.match(src, /<StateNote/);
  }
});

test("the regeneration strip carries the operator's own line, with live numbers (item 4)", () => {
  assert.match(NOTE, /<b>Regeneration<\/b>/);
  assert.match(NOTE, /at current\s*\n?\s*contract/);
  assert.match(NOTE, /never regenerated/);
  assert.match(NOTE, /label: "Open queue"/);
  // Neutral variant: StateNote with no band prop.
  assert.doesNotMatch(NOTE, /<StateNote[^>]*band=/);
});

test("the B.2 progress CARD and its empty chart placeholders are gone, not restyled (item 4)", () => {
  // The placeholder columns' own rendered labels, not the sentence in this file's header.
  assert.doesNotMatch(NOTE, /label="By format"/);
  assert.doesNotMatch(NOTE, /Tag coverage \(of/);
  assert.doesNotMatch(NOTE, /pct_complete/);
  assert.doesNotMatch(DASHBOARD, /B2ProgressBanner/);
  assert.match(DASHBOARD, /<B2RegenerationNote/);
});

test("the scraping strip is the Action band when nothing scrapes, and neutral when it does", () => {
  assert.match(CONTROLS, /band=\{stopped \? band\("action"\) : null\}/);
  assert.match(CONTROLS, /const stopped = isOff \|\| state\.paused;/);
  assert.match(CONTROLS, /<b>Scraping is OFF\.<\/b>/);
  // The full-width orange bordered box it replaces is gone.
  assert.doesNotMatch(CONTROLS, /rgba\(255,165,0,0\.08\)/);
});

test("Cadence, Save and Emergency stop are one 44px action row (item 4)", () => {
  const strip = CONTROLS.slice(CONTROLS.indexOf('data-audit="registry-scrape-strip"'), CONTROLS.indexOf("// ── Per-source admin row controls"));
  assert.match(strip, /Cadence/);
  assert.match(strip, /<ActionButton variant="primary" onClick=\{saveSchedule\}/);
  assert.match(strip, /Emergency stop/);
  // The select and the date input state the 44px floor themselves; ActionButton already carries it.
  assert.equal(strip.match(/minHeight: 44/g).length, 2);
  assert.match(CONTROLS, /import \{ ActionButton \} from "@\/components\/ui\/ActionRow"/);
});

// UPDATED (fold 62, 2026-09-08): the registry card's audit hook is `SectionCard`'s `dataAudit`
// prop now, not a literal attribute on a hand-typed div. Lane adminlayout built this card the same
// day lane cardrule made the card a component, so the fold moved it onto the shared shell (it was
// shipping with no shadow, operator item A3) and the hook moved with it. It renders the identical
// `data-audit="registry-card"` attribute, so the audit spec is unchanged; only this source slice
// had to follow. Worth noting the trap: `indexOf` returning -1 here made `slice(-1)` a ONE-CHARACTER
// string, so this test failed loudly rather than passing vacuously, which is the good outcome.
test("the strips sit where the operator put them: regeneration under the tab row, scraping at the card foot", () => {
  const cardStart = DASHBOARD.indexOf('dataAudit="registry-card"');
  assert.notEqual(cardStart, -1, "the registry card was not found by its audit hook");
  const card = DASHBOARD.slice(cardStart);
  const tabRow = card.indexOf("<TabRow");
  const regen = card.indexOf("<B2RegenerationNote");
  const scrape = card.indexOf("<GlobalPauseToggle");
  const bodyEnd = card.indexOf("UpcomingObligationsPanel");
  assert.ok(tabRow > 0 && regen > tabRow, "regeneration strip renders after the tab row");
  assert.ok(scrape > bodyEnd, "scraping strip renders after the view body, at the card foot");
});
