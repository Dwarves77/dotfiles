// Proof for the toLedgerRowPayload trim added to src/lib/list-pagination.ts (PERF-3 lane,
// 2026-09-03, docs/audits/perf-load-times-2026-09-03.md item (3)).
//
// Two things this proves:
//   1. Field accounting: every field the trim blanks is NOT read by RegulationsLedger.tsx /
//      OperationsLedger.tsx (asserted here as a fixed list matching the header comment's grep
//      accounting — a change to that list without updating this test, or vice versa, is exactly
//      the drift this proof exists to catch); every field the ledgers DO read survives untouched.
//   2. A measured byte-size reduction on a 60-row SYNTHETIC fixture sized to match the audit's own
//      reported ~150-170KB/60-row figure (~2.5-2.8KB/row) — labelled a fixture measurement, not a
//      live production number, per this lane's evidence-labelling rule (no DB/credentials in this
//      worktree to measure the real payload).
import test from "node:test";
import assert from "node:assert/strict";
import {
  toLedgerRowPayload,
  LIST_PAGE_SIZE,
  LIST_FIRST_PAGE_SIZE,
  FIRST_LISTING_CURSOR,
  cursorAfter,
  encodeListingCursor,
  decodeListingCursor,
} from "./list-pagination.ts";

// Realistic-shaped synthetic row: field sizes chosen so 60 of these serialize to roughly the
// audit's measured ~150-170KB range, so the reduction percentage below is representative of
// production's actual size class, not just directionally correct on a trivial fixture.
function fixtureRow(i) {
  const para = (label, n) => `${label} `.repeat(n).trim();
  return {
    id: `item-${i}`,
    cat: "ocean",
    sub: "customs",
    title: `Regulation title ${i} — a realistic multi-word heading`,
    url: `https://example.org/reg/${i}`,
    note: para("status action summary", 6),
    type: "regulation",
    priority: "HIGH",
    added: "2026-08-01",
    reasoning: para("why this priority matters for freight forwarders operating in this lane", 8),
    tags: ["ocean", "customs", "eu", "carbon"],
    whatIsIt: para("executive summary of what this regulation is", 10),
    whyMatters: para("why it matters to freight forwarders specifically", 10),
    keyData: [para("key data point one", 4), para("key data point two", 4), para("key data point three", 4)],
    timeline: [
      { date: "2026-01-01", label: "Proposed", status: "past" },
      { date: "2026-06-01", label: "Adopted", status: "current" },
      { date: "2027-01-01", label: "In force", status: "future" },
    ],
    fullBrief: para("full regulatory playbook markdown body text", 12),
    operationalImpact: [
      { mode: "ocean", function: "compliance", impact: para("impact detail", 6), severity: "high" },
      { mode: "air", function: "pricing", impact: para("impact detail", 6), severity: "medium" },
    ],
    riskRegister: [
      { risk: para("risk description", 6), severity: "high", likelihood: "medium", deadline: "2027-01-01" },
    ],
    recommendedActions: [
      { action: para("recommended action text", 6), owner: "Ocean Product", timeframe: "30 days", priority: 1 },
      { action: para("recommended action text", 6), owner: "Finance", timeframe: "Q2 2026", priority: 2 },
    ],
    openQuestions: [para("open question", 5), para("open question", 5)],
    sourceUrls: [
      { name: "EUR-Lex", url: "https://eur-lex.europa.eu/x", tier: 1, type: "primary_text" },
      { name: "Federal Register", url: "https://federalregister.gov/x", tier: 1, type: "primary_text" },
    ],
  };
}

const FIXTURE_60 = Array.from({ length: 60 }, (_, i) => fixtureRow(i));

test("toLedgerRowPayload: blanks exactly the fields the ledgers never read", () => {
  const row = fixtureRow(0);
  const trimmed = toLedgerRowPayload(row);

  const blanked = [
    "fullBrief",
    "regulatoryConflict",
    "trajectoryPoints",
    "operationalImpact",
    "riskRegister",
    "recommendedActions",
    "openQuestions",
    "sourceUrls",
  ];
  for (const field of blanked) {
    assert.equal(trimmed[field], undefined, `${field} should be dropped — not read by either ledger`);
  }
  assert.deepEqual(trimmed.keyData, [], "keyData is required on Resource — blanked to [], not undefined");
  assert.equal(trimmed.reasoning, "", "reasoning is required on Resource — blanked to '', not undefined");
});

test("toLedgerRowPayload: preserves every field the ledgers actually read", () => {
  const row = fixtureRow(0);
  const trimmed = toLedgerRowPayload(row);

  // Search haystack (RegulationsLedger.tsx matchesFilters).
  assert.equal(trimmed.title, row.title);
  assert.equal(trimmed.whatIsIt, row.whatIsIt);
  assert.equal(trimmed.whyMatters, row.whyMatters);
  assert.deepEqual(trimmed.tags, row.tags);
  // Sort tiebreak (nextMilestone reads timeline).
  assert.deepEqual(trimmed.timeline, row.timeline);
  // Row card / filters.
  assert.equal(trimmed.id, row.id);
  assert.equal(trimmed.priority, row.priority);
  assert.equal(trimmed.added, row.added);
  assert.equal(trimmed.note, row.note);
});

test("toLedgerRowPayload: measured byte-size reduction on a 60-row fixture", () => {
  const before = JSON.stringify(FIXTURE_60);
  const after = JSON.stringify(FIXTURE_60.map(toLedgerRowPayload));

  const beforeKb = before.length / 1024;
  const afterKb = after.length / 1024;
  const reductionPct = (1 - after.length / before.length) * 100;

  // Printed (not just asserted) so the report's before/after numbers can be verified by re-running
  // this file rather than trusted blind — `node --test src/lib/list-pagination.test.mjs`.
  console.log(
    `[list-pagination.test] 60-row fixture: ${beforeKb.toFixed(1)}KB -> ${afterKb.toFixed(1)}KB ` +
      `(${reductionPct.toFixed(0)}% smaller)`
  );

  assert.ok(before.length > 100 * 1024, "fixture should be in the audit's reported size class (>100KB/60 rows)");
  assert.ok(reductionPct > 40, `expected a meaningful reduction, got ${reductionPct.toFixed(1)}%`);
});

// ── PERF-12 (2026-09-04) keyset cursor ─────────────────────────────────────────────────────────

test("LIST_PAGE_SIZE is inside the lane brief's stated 25-40 range; LIST_FIRST_PAGE_SIZE is unchanged at 60", () => {
  assert.ok(LIST_PAGE_SIZE >= 25 && LIST_PAGE_SIZE <= 40, `LIST_PAGE_SIZE=${LIST_PAGE_SIZE} outside 25-40`);
  assert.equal(LIST_FIRST_PAGE_SIZE, 60, "Operations/ObligationRegister depend on this staying 60");
});

test("cursorAfter: empty page returns the SAME cursor unchanged (no phantom advance)", () => {
  const next = cursorAfter(FIRST_LISTING_CURSOR, []);
  assert.deepEqual(next, FIRST_LISTING_CURSOR);
});

test("cursorAfter: advances offset by the page length and carries the LAST row's own priority/added/id", () => {
  const rows = [
    { id: "a", priority: "CRITICAL", added: "2026-01-01" },
    { id: "b", priority: "CRITICAL", added: "2025-12-20" },
    { id: "c", priority: "HIGH", added: "2025-12-15" },
  ];
  const next = cursorAfter(FIRST_LISTING_CURSOR, rows);
  assert.equal(next.offset, 3);
  assert.equal(next.afterPriority, "HIGH");
  assert.equal(next.afterAddedDate, "2025-12-15");
  assert.equal(next.afterId, "c");
});

test("cursorAfter: chains correctly across two pages (offset accumulates, cursor re-anchors to the newest last row)", () => {
  const page1 = [{ id: "a", priority: "CRITICAL", added: "2026-01-01" }];
  const c1 = cursorAfter(FIRST_LISTING_CURSOR, page1);
  const page2 = [
    { id: "b", priority: "HIGH", added: "2025-12-01" },
    { id: "c", priority: "HIGH", added: "2025-11-01" },
  ];
  const c2 = cursorAfter(c1, page2);
  assert.equal(c2.offset, 3);
  assert.equal(c2.afterId, "c");
});

test("encodeListingCursor / decodeListingCursor round-trip exactly", () => {
  const cursor = { offset: 30, afterPriority: "MODERATE", afterAddedDate: "2026-03-01", afterId: "uuid-123" };
  const wire = encodeListingCursor(cursor);
  assert.equal(typeof wire, "string");
  const back = decodeListingCursor(wire);
  assert.deepEqual(back, cursor);
});

test("encodeListingCursor / decodeListingCursor round-trip the first-page cursor (no afterX fields)", () => {
  const wire = encodeListingCursor(FIRST_LISTING_CURSOR);
  const back = decodeListingCursor(wire);
  assert.deepEqual(back, FIRST_LISTING_CURSOR);
});

test("decodeListingCursor never throws — malformed/tampered input degrades to the first page", () => {
  for (const bad of [null, undefined, "", "not-json", "%7Bnot-valid%7D", encodeURIComponent("[]"), encodeURIComponent('{"offset":-1}'), encodeURIComponent('{"offset":"nope"}')]) {
    assert.deepEqual(decodeListingCursor(bad), FIRST_LISTING_CURSOR, `expected first-page fallback for ${JSON.stringify(bad)}`);
  }
});

test("decodeListingCursor rejects a cursor whose afterPriority/afterId are present but empty strings (never a real-but-empty keyset boundary)", () => {
  const wire = encodeURIComponent(JSON.stringify({ offset: 5, afterPriority: "", afterId: "" }));
  const back = decodeListingCursor(wire);
  assert.equal(back.offset, 5);
  assert.equal(back.afterPriority, undefined);
  assert.equal(back.afterId, undefined);
});
