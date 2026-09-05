// apply-extraction-output.test.mjs — proves arg parsing, migration-307 dedupe-key computation
// (client-side md5 matching Postgres's md5(text); lane FE-DEDUP, 2026-09-04, dropped the source-object
// term migration 275's key carried — see apply-extraction-output.mjs's own header), per-row validation,
// and the new-vs-already-live partition, all without a DB. Importing this module never invokes main()
// (IS_MAIN guard).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseArgs, loadEventsFile, md5Hex, dedupeKey, toInsertRow, partitionNew } from "./apply-extraction-output.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --events is required", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--events/);
});

test("parseArgs: --execute defaults false; --events alone is a valid dry run", () => {
  const r = parseArgs(["--events", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.execute, false);
});

test("parseArgs: --execute flips execute true", () => {
  const r = parseArgs(["--events", "x.json", "--execute"]);
  assert.equal(r.ok, true);
  assert.equal(r.execute, true);
});

// ── loadEventsFile ───────────────────────────────────────────────────────────────────────────────

test("loadEventsFile: rejects a non-array JSON body", () => {
  const dir = mkdtempSync(join(tmpdir(), "aeo-test-"));
  const p = join(dir, "bad.json");
  writeFileSync(p, JSON.stringify({ items: [] }));
  assert.throws(() => loadEventsFile(p), /must be a JSON array/);
});

test("loadEventsFile: accepts a plain array (run-extraction.mjs's *.events.json shape)", () => {
  const dir = mkdtempSync(join(tmpdir(), "aeo-test-"));
  const p = join(dir, "good.json");
  writeFileSync(p, JSON.stringify([{ item_id: "x" }]));
  assert.deepEqual(loadEventsFile(p), [{ item_id: "x" }]);
});

// ── md5Hex / dedupeKey ───────────────────────────────────────────────────────────────────────────

test("md5Hex matches the known md5 of a fixed string (sanity against Postgres's md5(text))", () => {
  // md5("") is the textbook constant; proves this is genuinely md5, not some other digest.
  assert.equal(md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5Hex("hello"), createHash("md5").update("hello", "utf8").digest("hex"));
});

test("dedupeKey: ignores source_claim_id/source_section_id entirely -- migration 307 dropped the source-object term (lane FE-DEDUP, 2026-09-04), so a claim-backed row and a section-backed row with the SAME text now produce the SAME key (the exact live twin shape this closes: 359 duplicate groups, coordinator-cited example item 02470d94, events a4ad1ce7/ca126684, both 'entered into force on 14 April 1967')", () => {
  const claimRow = {
    intelligence_item_id: "item-1", event_date: "1967-04-14", event_kind: "entry_into_force",
    obligation_text: "entered into force on 14 April 1967", source_claim_id: "claim-1", source_section_id: null,
  };
  const sectionRow = {
    intelligence_item_id: "item-1", event_date: "1967-04-14", event_kind: "entry_into_force",
    obligation_text: "entered into force on 14 April 1967", source_claim_id: null, source_section_id: "section-1",
  };
  assert.equal(dedupeKey(claimRow), dedupeKey(sectionRow));
  assert.ok(!dedupeKey(claimRow).includes("claim-1"));
  assert.ok(!dedupeKey(sectionRow).includes("section-1"));
});

test("dedupeKey: two rows with the same bare-year span but different obligation_text produce DIFFERENT keys (the migration 275 fix this key exists to preserve)", () => {
  const base = { intelligence_item_id: "item-1", event_date: "2030-01-01", event_kind: "compliance_deadline" };
  const a = dedupeKey({ ...base, obligation_text: "scope ... by 2030, all sectors covered" });
  const b = dedupeKey({ ...base, obligation_text: "By 2030 | Commission target to include all EU ETS sectors" });
  assert.notEqual(a, b);
});

test("dedupeKey: identical inputs produce identical keys (idempotent re-run)", () => {
  const row = { intelligence_item_id: "i", event_date: "2030-01-01", event_kind: "other", obligation_text: "same text" };
  assert.equal(dedupeKey(row), dedupeKey({ ...row }));
});

// ── toInsertRow ──────────────────────────────────────────────────────────────────────────────────

const VALID_EVENT = {
  item_id: "11111111-1111-1111-1111-111111111111",
  event_date: "2030-01-01",
  date_precision: "year",
  event_kind: "compliance_deadline",
  obligation_text: "shall comply by 2030",
  source_kind: "claim",
  source_claim_id: "22222222-2222-2222-2222-222222222222",
  source_section_id: null,
  source_span: "2030",
  confidence: "high",
  extractor_version: "fe1-2026-09-01.1",
};

test("toInsertRow: a well-formed event maps to the item_forward_events row shape", () => {
  const r = toInsertRow(VALID_EVENT);
  assert.equal(r.ok, true);
  assert.equal(r.row.intelligence_item_id, VALID_EVENT.item_id);
  assert.equal(r.row.source_claim_id, VALID_EVENT.source_claim_id);
  assert.equal(r.row.source_section_id, null);
});

test("toInsertRow: a non-UUID item_id (run-extraction.mjs's corpus-index-N fallback) is refused, not written", () => {
  const r = toInsertRow({ ...VALID_EVENT, item_id: "corpus-index-3" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /UUID/);
});

test("toInsertRow: a missing required string field is refused", () => {
  const { event_kind, ...rest } = VALID_EVENT;
  const r = toInsertRow(rest);
  assert.equal(r.ok, false);
  assert.match(r.reason, /event_kind/);
});

test("toInsertRow: not an object is refused", () => {
  assert.equal(toInsertRow(null).ok, false);
  assert.equal(toInsertRow("x").ok, false);
});

// ── partitionNew ─────────────────────────────────────────────────────────────────────────────────

test("partitionNew: a row whose key is already live is skipped, not re-inserted", () => {
  const row = toInsertRow(VALID_EVENT).row;
  const key = dedupeKey(row);
  const { fresh, alreadyLive } = partitionNew([row], [key]);
  assert.deepEqual(fresh, []);
  assert.deepEqual(alreadyLive, [row]);
});

test("partitionNew: a genuinely new row is kept", () => {
  const row = toInsertRow(VALID_EVENT).row;
  const { fresh, alreadyLive } = partitionNew([row], []);
  assert.deepEqual(fresh, [row]);
  assert.deepEqual(alreadyLive, []);
});

test("partitionNew: two identical rows in the SAME input batch collapse to one insert (self-dedup)", () => {
  const row = toInsertRow(VALID_EVENT).row;
  const { fresh, alreadyLive } = partitionNew([row, { ...row }], []);
  assert.equal(fresh.length, 1);
  assert.equal(alreadyLive.length, 1);
});
