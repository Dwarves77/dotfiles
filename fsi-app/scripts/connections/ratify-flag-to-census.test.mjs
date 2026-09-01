// ratify-flag-to-census.test.mjs — proves the resolution-marker parser, the ratifiability decision
// (status='resolved' + resolved_by + the ratify:census marker), buildCensusRow's shape, and the
// injected-dependency ratifyFlag() core (skip-if-exists idempotency, dry-run, real write) — mocking
// the DB via plain injected functions, same fixture-the-client posture as scripts/lib/db.test.mjs.
// Importing this module never invokes main() (IS_MAIN checks process.argv[1] against the test file).
import test from "node:test";
import assert from "node:assert/strict";
import {
  RATIFY_TOKEN, parseRatificationNote, evaluateRatification, buildCensusRow, ratifyFlag,
} from "./ratify-flag-to-census.mjs";

// ── parseRatificationNote ────────────────────────────────────────────────────────────────────────

test("parseRatificationNote: no marker -> refused", () => {
  const r = parseRatificationNote("looks fine, closing this out");
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(RATIFY_TOKEN));
});

test("parseRatificationNote: marker present but missing source_id -> refused", () => {
  const r = parseRatificationNote(`${RATIFY_TOKEN} url=https://example.gov/reg`);
  assert.equal(r.ok, false);
  assert.match(r.error, /source_id/);
});

test("parseRatificationNote: marker present but missing url -> refused", () => {
  const r = parseRatificationNote(`${RATIFY_TOKEN} source_id=11111111-1111-1111-1111-111111111111`);
  assert.equal(r.ok, false);
  assert.match(r.error, /url/);
});

test("parseRatificationNote: full payload parses, lane defaults to 'C'", () => {
  const r = parseRatificationNote(`${RATIFY_TOKEN} source_id=abc-123 url=https://example.gov/reg`);
  assert.equal(r.ok, true);
  assert.equal(r.fields.source_id, "abc-123");
  assert.equal(r.fields.url, "https://example.gov/reg");
  assert.equal(r.fields.lane, "C");
});

test("parseRatificationNote: explicit lane=A is honored (uppercased)", () => {
  const r = parseRatificationNote(`${RATIFY_TOKEN} source_id=abc url=https://x lane=a`);
  assert.equal(r.ok, true);
  assert.equal(r.fields.lane, "A");
});

test("parseRatificationNote: invalid lane value -> refused", () => {
  const r = parseRatificationNote(`${RATIFY_TOKEN} source_id=abc url=https://x lane=Z`);
  assert.equal(r.ok, false);
  assert.match(r.error, /lane must be/);
});

test("parseRatificationNote: surface_tags parses a comma list, trims", () => {
  const r = parseRatificationNote(`${RATIFY_TOKEN} source_id=abc url=https://x surface_tags=regulations, market_intel`);
  assert.equal(r.ok, true);
  // note: the tokenizer splits on whitespace, so "surface_tags=regulations," and "market_intel" are
  // two separate whitespace-delimited tokens — the second has no '=' so it's ignored by the parser.
  // This documents the v1 parser's no-quoting limitation named in the file header.
  assert.deepEqual(r.fields.surface_tags, ["regulations"]);
});

test("parseRatificationNote: marker match is case-insensitive and word-bounded", () => {
  assert.equal(parseRatificationNote(`RATIFY:CENSUS source_id=a url=https://x`).ok, true);
  assert.equal(parseRatificationNote(`not-ratify:census-either source_id=a url=https://x`).ok, false);
});

// ── evaluateRatification ─────────────────────────────────────────────────────────────────────────

const RESOLVED_NOTE = `${RATIFY_TOKEN} source_id=src-1 url=https://example.gov/reg-2026`;

test("evaluateRatification: status != 'resolved' -> refused", () => {
  const r = evaluateRatification({ id: "f1", status: "open", resolved_by: null, resolution_note: RESOLVED_NOTE });
  assert.equal(r.ok, false);
  assert.match(r.error, /not.*resolved/i);
});

test("evaluateRatification: resolved but no resolved_by -> refused (not confirmed operator-resolved)", () => {
  const r = evaluateRatification({ id: "f1", status: "resolved", resolved_by: null, resolution_note: RESOLVED_NOTE });
  assert.equal(r.ok, false);
  assert.match(r.error, /resolved_by/);
});

test("evaluateRatification: resolved + resolved_by but no marker -> refused", () => {
  const r = evaluateRatification({ id: "f1", status: "resolved", resolved_by: "op1", resolution_note: "looks fine" });
  assert.equal(r.ok, false);
  assert.match(r.error, new RegExp(RATIFY_TOKEN));
});

test("evaluateRatification: fully ratified flag -> ok, fields extracted", () => {
  const r = evaluateRatification({ id: "f1", status: "resolved", resolved_by: "op1", resolution_note: RESOLVED_NOTE });
  assert.equal(r.ok, true);
  assert.equal(r.fields.source_id, "src-1");
  assert.equal(r.fields.url, "https://example.gov/reg-2026");
});

test("evaluateRatification: missing flag -> refused, distinct message", () => {
  const r = evaluateRatification(null);
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});

// ── buildCensusRow ───────────────────────────────────────────────────────────────────────────────

test("buildCensusRow: created_by is 'flywheel-ratified:<flagid>' exactly", () => {
  const row = buildCensusRow("flag-abc", { source_id: "s1", url: "https://x", lane: "C", shape_class: null, surface_tags: [], notes: null });
  assert.equal(row.created_by, "flywheel-ratified:flag-abc");
  assert.equal(row.source_id, "s1");
  assert.equal(row.document_url, "https://x");
  assert.equal(row.lane, "C");
  assert.match(row.notes, /flag-abc/);
});

test("buildCensusRow: carries an operator-supplied note into the census row's notes field", () => {
  const row = buildCensusRow("flag-abc", { source_id: "s1", url: "https://x", lane: "C", shape_class: "instrument_page", surface_tags: ["regulations"], notes: "found via manual search" });
  assert.match(row.notes, /found via manual search/);
  assert.equal(row.shape_class, "instrument_page");
  assert.deepEqual(row.surface_tags, ["regulations"]);
});

// ── ratifyFlag (injected-dependency core, mocked DB) ────────────────────────────────────────────

function deps({ flag, existing = null, insertResult } = {}) {
  return {
    readFlag: async () => ({ data: flag ?? null, error: null }),
    findExisting: async () => ({ data: existing, error: null }),
    insertRow: async (row) => insertResult ?? { inserted: { id: "new-census-row" }, snapshot: "/tmp/snap.jsonl" },
  };
}

test("ratifyFlag: flag not found -> status not_found", async () => {
  const r = await ratifyFlag(deps({ flag: null }), "missing-flag", { execute: true });
  assert.equal(r.status, "not_found");
});

test("ratifyFlag: not ratifiable (bad status) -> status not_ratifiable, no DB write attempted", async () => {
  const flag = { id: "f1", status: "open", resolved_by: null, resolution_note: null };
  let insertCalled = false;
  const d = deps({ flag });
  d.insertRow = async () => { insertCalled = true; return {}; };
  const r = await ratifyFlag(d, "f1", { execute: true });
  assert.equal(r.status, "not_ratifiable");
  assert.equal(insertCalled, false);
});

test("ratifyFlag: dry run -> status dry_run, no write attempted even when a row would be created", async () => {
  const flag = { id: "f1", status: "resolved", resolved_by: "op1", resolution_note: RESOLVED_NOTE };
  let insertCalled = false;
  const d = deps({ flag });
  d.insertRow = async () => { insertCalled = true; return {}; };
  const r = await ratifyFlag(d, "f1", { execute: false });
  assert.equal(r.status, "dry_run");
  assert.equal(insertCalled, false);
  assert.equal(r.row.source_id, "src-1");
});

test("ratifyFlag: skip-if-exists — a matching (source_id, document_url) row already present -> skipped_exists, no insert", async () => {
  const flag = { id: "f1", status: "resolved", resolved_by: "op1", resolution_note: RESOLVED_NOTE };
  let insertCalled = false;
  const d = deps({ flag, existing: { id: "existing-row-9" } });
  d.insertRow = async () => { insertCalled = true; return {}; };
  const r = await ratifyFlag(d, "f1", { execute: true });
  assert.equal(r.status, "skipped_exists");
  assert.equal(r.existingId, "existing-row-9");
  assert.equal(insertCalled, false, "idempotent re-run must never insert a duplicate");
});

test("ratifyFlag: fully ratified, execute=true, no prior row -> status ratified, insert happens with the right row", async () => {
  const flag = { id: "f1", status: "resolved", resolved_by: "op1", resolution_note: RESOLVED_NOTE };
  let capturedRow = null;
  const d = deps({ flag });
  d.insertRow = async (row) => { capturedRow = row; return { inserted: { id: "cw-1" }, snapshot: "/tmp/x.jsonl" }; };
  const r = await ratifyFlag(d, "f1", { execute: true });
  assert.equal(r.status, "ratified");
  assert.equal(r.insertedId, "cw-1");
  assert.equal(capturedRow.created_by, "flywheel-ratified:f1");
  assert.equal(capturedRow.source_id, "src-1");
  assert.equal(capturedRow.document_url, "https://example.gov/reg-2026");
});

test("ratifyFlag: read error propagates as status read_error, not thrown", async () => {
  const d = { readFlag: async () => ({ data: null, error: { message: "boom" } }), findExisting: async () => ({ data: null, error: null }), insertRow: async () => ({}) };
  const r = await ratifyFlag(d, "f1", { execute: true });
  assert.equal(r.status, "read_error");
  assert.match(r.error, /boom/);
});
