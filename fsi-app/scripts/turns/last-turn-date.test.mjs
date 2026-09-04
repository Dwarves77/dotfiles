// last-turn-date.test.mjs — proves the marker read/write round-trip and the epoch-default fallback,
// against a temp file (never the repo's own scripts/turns/LAST-TURN.json). Importing this module never
// invokes the CLI body (IS_MAIN checks process.argv[1] against the running file).
//
// RETIRED as corpus-turn's selection mechanism (lane TURNREQ, 2026-09-04 — see last-turn-date.mjs's own
// header). These tests still hold: the read/write mechanics this file exports are unchanged, only their
// caller wiring in corpus-turn.yml is gone. Kept green because `scripts/turns/run-population-flywheel.mjs`
// (a different lane's file) still imports `writeLastTurnDate`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLastTurnDate, writeLastTurnDate, EPOCH } from "./last-turn-date.mjs";

function tmpPath() {
  return join(mkdtempSync(join(tmpdir(), "ltd-test-")), "LAST-TURN.json");
}

test("readLastTurnDate: a missing marker file returns EPOCH (first-ever turn covers everything)", () => {
  assert.equal(readLastTurnDate(join(tmpdir(), "definitely-does-not-exist-ltd", "LAST-TURN.json")), EPOCH);
});

test("writeLastTurnDate then readLastTurnDate round-trips the exact date", () => {
  const p = tmpPath();
  writeLastTurnDate("2026-08-25T00:00:00.000Z", p);
  assert.equal(readLastTurnDate(p), "2026-08-25T00:00:00.000Z");
});

test("readLastTurnDate: corrupt JSON degrades to EPOCH, never throws", () => {
  const p = tmpPath();
  writeFileSync(p, "not json {{{");
  assert.equal(readLastTurnDate(p), EPOCH);
});

test("readLastTurnDate: a well-formed file with an unparseable since value degrades to EPOCH", () => {
  const p = tmpPath();
  writeFileSync(p, JSON.stringify({ since: "not-a-date" }));
  assert.equal(readLastTurnDate(p), EPOCH);
});

test("readLastTurnDate: a well-formed file with a non-string since value degrades to EPOCH", () => {
  const p = tmpPath();
  writeFileSync(p, JSON.stringify({ since: 12345 }));
  assert.equal(readLastTurnDate(p), EPOCH);
});

test("writeLastTurnDate: creates parent directories as needed", () => {
  const dir = mkdtempSync(join(tmpdir(), "ltd-test-"));
  const nested = join(dir, "a", "b", "LAST-TURN.json");
  writeLastTurnDate("2026-01-01", nested);
  assert.equal(readLastTurnDate(nested), "2026-01-01");
});
