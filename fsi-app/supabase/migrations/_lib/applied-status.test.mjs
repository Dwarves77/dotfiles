// applied-status.test.mjs: proof of the applied-status helper (lane MIGTEST-1, 2026-10-08).
// Fixture roots in a temp directory, injected through the helper's `root` option; the committed tree is read only by
// the last three tests, which assert the helper agrees with the committed data (never with a number or a file list).
// No npm imports (the no-npm discipline glob).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedHeaderFor, headerProblems, ledgerCount, derivesNeverApplied, accountFor, neverAppliedFiles, namedFiles, isFileKey } from "./applied-status.mjs";

const FSI = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const MIG = join(FSI, "supabase", "migrations");

const APPLIED_FILE = "900_applied_fixture.sql";
const NEVER_FILE = "901_never_fixture.sql";
const SUPER_FILE = "902_super_fixture.sql";
const OUTSIDE_FILE = "903_outside.sql";
const LOOSE_FILE = "904_loose.sql";
const LEDGER_VERSION = "20261008999999";

const appliedText = (v = LEDGER_VERSION) => `-- subject: Migration 900 (lane X, 2026-10-08): fixture; NOT APPLIED.\n-- 900 -- fixture.\n--\n-- APPLIED (production ledger version ${v}, as of 2026-10-08). Authored by lane X.\nSELECT 1;\n`;
const neverText = () => `-- subject: Migration 901 (lane X, 2026-10-08): fixture.\n-- 901 -- fixture.\n--\n-- NOT APPLIED. Authored by lane X.\nSELECT 1;\n`;
const looseText = () => "-- subject: Migration 904\nSELECT 1;\n";
const TEXTS = () => ({ [APPLIED_FILE]: appliedText(), [NEVER_FILE]: neverText(), [SUPER_FILE]: looseText(), [OUTSIDE_FILE]: looseText(), [LOOSE_FILE]: looseText() });

// The map holds ledger rows and keyed outside-ledger / duplicate-prefix rulings ONLY: the never-applied file has no entry.
const MAP = () => ({
  [LEDGER_VERSION]: { name: "900_applied_fixture", file: APPLIED_FILE, class: "identical" },
  "20261008999998": { name: "x", file: null, class: "superseded-by", superseded_by: SUPER_FILE, note: "n" },
  [`outside:${OUTSIDE_FILE}`]: { name: "outside", file: OUTSIDE_FILE, class: "outside-ledger", note: "n" },
});

function writeLedger(root, rows) {
  writeFileSync(join(root, "docs", "inventories", "applied-migrations.json"), JSON.stringify({ source: "fixture", synced_at: "2026-10-08T00:00:00.000Z", count: rows.length, migrations: rows }, null, 2));
}

function makeRoot({ map = MAP(), ledgerRows = 3, texts = TEXTS() } = {}) {
  const root = mkdtempSync(join(tmpdir(), "applied-status-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "docs", "inventories"), { recursive: true });
  writeFileSync(join(root, "supabase", "migrations", "APPLIED-MAP.json"), JSON.stringify(map, null, 2));
  for (const [f, text] of Object.entries(texts)) writeFileSync(join(root, "supabase", "migrations", f), text);
  writeLedger(root, Array.from({ length: ledgerRows }, (_, i) => ({ version: String(20261008000000 + i), name: `row_${i}` })));
  return root;
}

const cleanup = (...roots) => { for (const r of roots) rmSync(r, { recursive: true, force: true }); };

test("derivesNeverApplied: a `-- NOT APPLIED` header line or a first-line NEVER APPLIED status, and nothing else", () => {
  assert.equal(derivesNeverApplied(neverText()), true);
  assert.equal(derivesNeverApplied("/* status: NEVER APPLIED (as of 2026-10-07) */\n-- subject: n\nSELECT 1;\n"), true);
  assert.equal(derivesNeverApplied(looseText()), false);
  assert.equal(derivesNeverApplied(appliedText()), false, "a subject line that mentions NOT APPLIED is not a status line");
  assert.equal(derivesNeverApplied(`${"-- filler\n".repeat(40)}-- NOT APPLIED. beyond line 30\n`), false);
  assert.equal(derivesNeverApplied(undefined), false);
});

test("accountFor: a ledger row, a superseder and a keyed entry account for a file; an unmapped file is accounted for ONLY by a NOT APPLIED header", () => {
  const map = MAP();
  assert.deepEqual(accountFor({ file: APPLIED_FILE, text: appliedText(), map }), { accounted: true, how: "ledger-row" });
  assert.deepEqual(accountFor({ file: SUPER_FILE, text: looseText(), map }), { accounted: true, how: "superseder" });
  assert.deepEqual(accountFor({ file: OUTSIDE_FILE, text: looseText(), map }), { accounted: true, how: "keyed:outside-ledger" });
  assert.deepEqual(accountFor({ file: NEVER_FILE, text: neverText(), map }), { accounted: true, how: "never-applied-by-header" });
  assert.deepEqual(accountFor({ file: LOOSE_FILE, text: looseText(), map }), { accounted: false, how: null }, "the only failure: unmapped and no NOT APPLIED header");
});

test("namedFiles / neverAppliedFiles / isFileKey: the unmapped files whose header derives never-applied, sorted", () => {
  const map = MAP();
  assert.deepEqual([...namedFiles(map)].sort(), [APPLIED_FILE, OUTSIDE_FILE, SUPER_FILE].sort());
  const files = Object.entries(TEXTS());
  assert.deepEqual(neverAppliedFiles({ map, files }), [NEVER_FILE]);
  assert.equal(isFileKey("outside:x.sql"), true);
  assert.equal(isFileKey("20261008999999"), false);
});

test("expectedHeaderFor: a file the map gives a ledger row is APPLIED with that row's version", () => {
  const root = makeRoot();
  try {
    const e = expectedHeaderFor(APPLIED_FILE, { root });
    assert.equal(e.applied, true);
    assert.equal(e.class, "identical");
    assert.equal(e.ledgerVersion, LEDGER_VERSION);
    assert.match(`-- APPLIED (production ledger version ${LEDGER_VERSION}, as of 2026-10-08).`, e.statusPattern);
    assert.doesNotMatch("-- APPLIED (production ledger version 20250101000000, as of 2026-10-08).", e.statusPattern);
    assert.doesNotMatch("-- NOT APPLIED. Authored by lane X.", e.statusPattern);
  } finally { cleanup(root); }
});

test("expectedHeaderFor: an unmapped file whose header says NOT APPLIED is never-applied (read from the root, or the text passed in), with no ledger version", () => {
  const root = makeRoot();
  try {
    for (const e of [expectedHeaderFor(NEVER_FILE, { root }), expectedHeaderFor(NEVER_FILE, { root, text: neverText() })]) {
      assert.equal(e.applied, false);
      assert.equal(e.class, "never-applied");
      assert.equal(e.ledgerVersion, null);
    }
  } finally { cleanup(root); }
});

test("expectedHeaderFor: an unmapped file without a NOT APPLIED header, only a superseder, or only outside-ledger has no derivable form and throws, naming the file", () => {
  const root = makeRoot();
  try {
    assert.throws(() => expectedHeaderFor(LOOSE_FILE, { root }), /904_loose\.sql.*named nowhere/);
    assert.throws(() => expectedHeaderFor(OUTSIDE_FILE, { root }), /903_outside\.sql.*outside-ledger/);
    assert.throws(() => expectedHeaderFor(SUPER_FILE, { root }), /902_super_fixture\.sql.*superseder/);
  } finally { cleanup(root); }
});

test("headerProblems: the applied header passes; the same file under a NOT APPLIED status line fails with named reasons", () => {
  const root = makeRoot();
  try {
    assert.deepEqual(headerProblems(appliedText(), APPLIED_FILE, { root }), []);
    const stale = appliedText().replace(/-- APPLIED \(production ledger version \d+, as of [\d-]+\)\./, "-- NOT APPLIED.");
    const p = headerProblems(stale, APPLIED_FILE, { root });
    assert.ok(p.length >= 1);
    assert.ok(p.some((x) => x.includes(LEDGER_VERSION)), `a problem names the ledger version: ${p}`);
    assert.ok(p.some((x) => /NOT APPLIED/.test(x)), `a problem names the stale status: ${p}`);
    assert.ok(p.every((x) => x.startsWith(`${APPLIED_FILE}: `)), "every reason names the file");
  } finally { cleanup(root); }
});

test("headerProblems: the subject line may carry the words NOT APPLIED (it is the inventory's description, not the status)", () => {
  const root = makeRoot();
  try {
    assert.ok(appliedText().split("\n")[0].includes("NOT APPLIED"));
    assert.deepEqual(headerProblems(appliedText(), APPLIED_FILE, { root }), []);
  } finally { cleanup(root); }
});

test("ENGINE-FIX-1 S9/X7: prose that says another file is NOT APPLIED, in the header block or in a later comment, is not a stale status; a stale status LINE still fails", () => {
  const root = makeRoot();
  try {
    const proseInHeader = appliedText().replace("--\n-- APPLIED", "-- the sibling rule is itself NOT APPLIED, so this file does not lean on it.\n--\n-- APPLIED");
    assert.ok(/itself NOT APPLIED/.test(proseInHeader));
    assert.deepEqual(headerProblems(proseInHeader, APPLIED_FILE, { root }), [], "a mid-line prose mention is no status");
    const proseAfterSql = appliedText().replace("SELECT 1;\n", "SELECT 1;\n-- NOT APPLIED here means the sibling file.\n");
    assert.deepEqual(headerProblems(proseAfterSql, APPLIED_FILE, { root }), [], "a comment after the first statement is not the header block");
    const staleLine = appliedText().replace("--\n-- APPLIED", "-- NOT APPLIED. Authored by lane X.\n--\n-- APPLIED");
    const p = headerProblems(staleLine, APPLIED_FILE, { root });
    assert.ok(p.some((x) => /still says NOT APPLIED/.test(x)), `a stale status line in the header block still fails: ${p}`);
  } finally { cleanup(root); }
});

test("headerProblems: the wrong ledger version fails; a status line beyond line 30 does not count", () => {
  const root = makeRoot();
  try {
    assert.ok(headerProblems(appliedText("20250101000000"), APPLIED_FILE, { root }).length >= 1);
    const late = `${"-- filler\n".repeat(40)}-- APPLIED (production ledger version ${LEDGER_VERSION}, as of 2026-10-08).\n`;
    assert.ok(headerProblems(late, APPLIED_FILE, { root }).length >= 1);
  } finally { cleanup(root); }
});

test("headerProblems: an unmapped NOT APPLIED file passes; an unmapped headerless file throws (the one failure); one claiming a ledger version fails", () => {
  const root = makeRoot();
  try {
    assert.deepEqual(headerProblems(neverText(), NEVER_FILE, { root }), []);
    assert.throws(() => headerProblems(looseText(), LOOSE_FILE, { root }), /named nowhere/);
    const claims = neverText().replace("-- NOT APPLIED.", `-- APPLIED (production ledger version ${LEDGER_VERSION}, as of 2026-10-08).`) + "-- NOT APPLIED. also\n";
    const p = headerProblems(claims, NEVER_FILE, { root });
    assert.ok(p.some((x) => /claims a ledger version/.test(x)), String(p));
  } finally { cleanup(root); }
});

test("ledgerCount: the row count of the ledger export the root holds, not a literal", () => {
  const a = makeRoot({ ledgerRows: 3 });
  const b = makeRoot({ ledgerRows: 7 });
  try {
    assert.equal(ledgerCount({ root: a }), 3);
    assert.equal(ledgerCount({ root: b }), 7);
  } finally { cleanup(a, b); }
});

test("ledgerCount: a malformed export is refused with the reader's own reason (the one reader of applied-migrations.json)", () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, "docs", "inventories", "applied-migrations.json"), JSON.stringify({ count: 9, migrations: [{ version: "1", name: "a" }] }));
    assert.throws(() => ledgerCount({ root }), /count/);
  } finally { cleanup(root); }
});

test("committed tree: ledgerCount equals the number of ledger keys in the committed map (the two records agree; no number kept here)", () => {
  const map = JSON.parse(readFileSync(join(MIG, "APPLIED-MAP.json"), "utf8"));
  assert.equal(ledgerCount(), Object.keys(map).filter((k) => !isFileKey(k)).length);
});

test("committed tree: the header of every two-track migration (352 and later) agrees with the form the committed record implies", () => {
  const files = readdirSync(MIG).filter((f) => /^3(5[2-9]|[6-9]\d)_.*\.sql$/.test(f));
  assert.ok(files.length > 0);
  const failures = [];
  for (const f of files) {
    const text = readFileSync(join(MIG, f), "utf8").replace(/\r\n/g, "\n");
    let p;
    try { p = headerProblems(text, f); } catch (e) { p = [e.message]; }
    if (p.length) failures.push(p.join("; "));
  }
  assert.deepEqual(failures, []);
});

test("SIMULATION: an apply plus its header flip needs zero test edits and zero map edits for the not-applied state (temp copy of the committed tree)", () => {
  // The scenario that cost four hand edits in tests on 2026-10-08, run on a real file: the latest-numbered ledgered
  // two-track migration is walked back to its pre-apply state in a temp copy (its header NOT APPLIED, NO map entry at all
  // and the export one row short: a never-applied file is not committed in the map) and then forward to the applied state
  // (ledger row in the map, export one row longer, header flipped). The helper and the calls the tests make are the
  // same at both ends; nothing in this test or in the per-migration tests is edited between them.
  const committedMap = JSON.parse(readFileSync(join(MIG, "APPLIED-MAP.json"), "utf8"));
  const candidates = readdirSync(MIG).filter((f) => /^3[5-9]\d_.*\.sql$/.test(f)).sort().reverse();
  const FILE = candidates.find((f) => { try { return expectedHeaderFor(f).applied; } catch { return false; } });
  assert.ok(FILE, "the committed tree holds at least one applied two-track migration to simulate on");
  const rowKey = expectedHeaderFor(FILE).ledgerVersion;
  const appliedTextOfFile = readFileSync(join(MIG, FILE), "utf8").replace(/\r\n/g, "\n");
  const statusRe = /APPLIED \(production ledger version \d+, as of \d{4}-\d{2}-\d{2}\)/;
  // the status line only: a subject line may also carry the status (370 to 375 do) and is not the status line
  const lines = appliedTextOfFile.split("\n");
  const at = lines.findIndex((l) => !l.startsWith("-- subject:") && statusRe.test(l));
  assert.ok(at >= 0, "a status line outside the subject");
  lines[at] = lines[at].replace(statusRe, "NOT APPLIED");
  const preApplyText = lines.join("\n");

  const root = mkdtempSync(join(tmpdir(), "applied-status-sim-"));
  try {
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    mkdirSync(join(root, "docs", "inventories"), { recursive: true });
    const mapPath = join(root, "supabase", "migrations", "APPLIED-MAP.json");
    const filePath = join(root, "supabase", "migrations", FILE);
    const ledgerRows = JSON.parse(readFileSync(join(FSI, "docs", "inventories", "applied-migrations.json"), "utf8")).migrations;
    const total = ledgerCount();

    // ---- state 1, before the apply: no map entry, header NOT APPLIED, export one row short
    const { [rowKey]: removed, ...withoutRow } = committedMap;
    writeFileSync(filePath, preApplyText);
    writeFileSync(mapPath, JSON.stringify(withoutRow));
    writeLedger(root, ledgerRows.filter((r) => r.version !== rowKey));
    assert.deepEqual(accountFor({ file: FILE, text: preApplyText, map: withoutRow }), { accounted: true, how: "never-applied-by-header" });
    assert.equal(expectedHeaderFor(FILE, { root }).applied, false);
    assert.deepEqual(headerProblems(preApplyText, FILE, { root }), []);
    assert.equal(ledgerCount({ root }), total - 1);

    // ---- the apply: the generator adds the ledger row to the map, the export gains the row, the header flips
    writeFileSync(mapPath, JSON.stringify({ ...withoutRow, [rowKey]: removed }));
    writeLedger(root, ledgerRows);
    assert.ok(headerProblems(preApplyText, FILE, { root }).length >= 1, "between the apply and the flip the helper reports the stale header (the gate is real)");
    writeFileSync(filePath, appliedTextOfFile);

    // ---- state 2, after the apply: same calls, new answers, no edit
    assert.equal(expectedHeaderFor(FILE, { root }).applied, true);
    assert.equal(expectedHeaderFor(FILE, { root }).ledgerVersion, rowKey);
    assert.deepEqual(headerProblems(appliedTextOfFile, FILE, { root }), []);
    assert.equal(ledgerCount({ root }), total);
    assert.equal(accountFor({ file: FILE, text: appliedTextOfFile, map: JSON.parse(readFileSync(mapPath, "utf8")) }).how, "ledger-row");
  } finally { cleanup(root); }
});
