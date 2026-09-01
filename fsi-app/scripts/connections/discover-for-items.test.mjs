// discover-for-items.test.mjs — proves the pure CLI-arg parsing and target-selection logic without
// a DB or process.exit. Importing this module never runs main() (IS_MAIN guard checks process.argv[1]
// against the test file, not this script), so import is side-effect-free.
import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, selectTargets } from "./discover-for-items.mjs";

test("parseArgs: --ids parses a comma list, trims whitespace, drops empties", () => {
  const r = parseArgs(["--ids", "a, b ,, c"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["a", "b", "c"]);
  assert.equal(r.since, null);
});

test("parseArgs: --since parses a valid ISO date", () => {
  const r = parseArgs(["--since", "2026-08-15"]);
  assert.equal(r.ok, true);
  assert.equal(r.since, "2026-08-15");
  assert.equal(r.ids, null);
});

test("parseArgs: neither --ids nor --since -> error", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--ids.*--since|required/);
});

test("parseArgs: both --ids and --since -> ambiguous, error", () => {
  const r = parseArgs(["--ids", "a", "--since", "2026-08-15"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not both|ambiguous/i);
});

test("parseArgs: unparseable --since -> error", () => {
  const r = parseArgs(["--since", "not-a-date"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not a parseable date/);
});

test("parseArgs: --execute defaults false (dry is the default)", () => {
  const r = parseArgs(["--ids", "a"]);
  assert.equal(r.execute, false);
});

test("parseArgs: --execute sets execute true", () => {
  const r = parseArgs(["--ids", "a", "--execute"]);
  assert.equal(r.execute, true);
});

test("parseArgs: --limit/--threshold default and override", () => {
  const defaults = parseArgs(["--ids", "a"]);
  assert.equal(defaults.limit, 12);
  assert.equal(defaults.threshold, 0.3);
  const overridden = parseArgs(["--ids", "a", "--limit", "5", "--threshold", "0.5"]);
  assert.equal(overridden.limit, 5);
  assert.equal(overridden.threshold, 0.5);
});

test("parseArgs: an --ids flag with no following value (or a flag right after) is treated as missing", () => {
  const r = parseArgs(["--ids", "--execute"]);
  assert.equal(r.ok, false, "--ids with no value and nothing else selected is a missing-selection error");
});

test("selectTargets: --ids selects exactly the requested items present in the corpus, reports missing", () => {
  const corpus = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const { targets, missingIds } = selectTargets(corpus, { ids: ["a", "c", "zzz"], since: null });
  assert.deepEqual(targets.map((t) => t.id).sort(), ["a", "c"]);
  assert.deepEqual(missingIds, ["zzz"]);
});

test("selectTargets: --since selects items with created_at >= the cutoff (inclusive)", () => {
  const corpus = [
    { id: "old", created_at: "2026-01-01T00:00:00Z" },
    { id: "boundary", created_at: "2026-08-15T00:00:00Z" },
    { id: "new", created_at: "2026-08-20T00:00:00Z" },
  ];
  const { targets, missingIds } = selectTargets(corpus, { ids: null, since: "2026-08-15T00:00:00Z" });
  assert.deepEqual(targets.map((t) => t.id).sort(), ["boundary", "new"]);
  assert.deepEqual(missingIds, []);
});

test("selectTargets: --since with no created_at on a row never matches it (never guess a date)", () => {
  const corpus = [{ id: "no-date" }];
  const { targets } = selectTargets(corpus, { ids: null, since: "2020-01-01" });
  assert.equal(targets.length, 0);
});

test("selectTargets: empty corpus -> no targets, no crash", () => {
  assert.deepEqual(selectTargets([], { ids: ["a"], since: null }).targets, []);
  assert.deepEqual(selectTargets(null, { ids: ["a"], since: null }).targets, []);
});
