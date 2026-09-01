// consume-turn-requests.test.mjs — proves the pure selection/formatting/arg-parsing logic without a DB
// or process.exit. Importing this module never runs main() (IS_MAIN guards on process.argv[1] against
// this file's own path — same pattern discover-for-items.test.mjs uses for its sibling script), so import
// is side-effect-free.
import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, toIdList, formatIdsLine, buildOutputPayload } from "./consume-turn-requests.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: no flags -> ok, everything unset", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, true);
  assert.equal(r.out, null);
  assert.equal(r.markConsumed, false);
  assert.equal(r.by, null);
});

test("parseArgs: --out with a path", () => {
  const r = parseArgs(["--out", "tmp/requests.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.out, "tmp/requests.json");
});

test("parseArgs: --out with no following value -> error", () => {
  const r = parseArgs(["--out"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--out requires a path/);
});

test("parseArgs: --out followed immediately by another flag -> error (no path consumed)", () => {
  const r = parseArgs(["--out", "--mark-consumed"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--out requires a path/);
});

test("parseArgs: --mark-consumed without --by -> error", () => {
  const r = parseArgs(["--mark-consumed"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mark-consumed requires --by/);
});

test("parseArgs: --mark-consumed --by <label> -> ok", () => {
  const r = parseArgs(["--mark-consumed", "--by", "corpus-turn-workflow-run-42"]);
  assert.equal(r.ok, true);
  assert.equal(r.markConsumed, true);
  assert.equal(r.by, "corpus-turn-workflow-run-42");
});

test("parseArgs: --by without --mark-consumed -> error", () => {
  const r = parseArgs(["--by", "someone"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--by has no effect without --mark-consumed/);
});

test("parseArgs: --out + --mark-consumed --by together -> ok", () => {
  const r = parseArgs(["--out", "x.json", "--mark-consumed", "--by", "operator"]);
  assert.equal(r.ok, true);
  assert.equal(r.out, "x.json");
  assert.equal(r.markConsumed, true);
  assert.equal(r.by, "operator");
});

test("parseArgs: order-independent (--by before --mark-consumed)", () => {
  const r = parseArgs(["--by", "operator", "--mark-consumed"]);
  assert.equal(r.ok, true);
  assert.equal(r.markConsumed, true);
  assert.equal(r.by, "operator");
});

// ── toIdList ─────────────────────────────────────────────────────────────────────────────────────────

test("toIdList: extracts intelligence_item_id, preserving first-seen order", () => {
  const rows = [
    { intelligence_item_id: "a" },
    { intelligence_item_id: "b" },
    { intelligence_item_id: "c" },
  ];
  assert.deepEqual(toIdList(rows), ["a", "b", "c"]);
});

test("toIdList: dedups (defensive — migration 277's partial index should already guarantee this)", () => {
  const rows = [
    { intelligence_item_id: "a" },
    { intelligence_item_id: "b" },
    { intelligence_item_id: "a" },
  ];
  assert.deepEqual(toIdList(rows), ["a", "b"]);
});

test("toIdList: empty/undefined input -> empty array, never throws", () => {
  assert.deepEqual(toIdList([]), []);
  assert.deepEqual(toIdList(undefined), []);
});

test("toIdList: rows missing intelligence_item_id are skipped, not nulled into the list", () => {
  const rows = [{ intelligence_item_id: "a" }, {}, { intelligence_item_id: null }, { intelligence_item_id: "b" }];
  assert.deepEqual(toIdList(rows), ["a", "b"]);
});

// ── formatIdsLine ────────────────────────────────────────────────────────────────────────────────────

test("formatIdsLine: comma-joins ids", () => {
  assert.equal(formatIdsLine(["a", "b", "c"]), "a,b,c");
});

test("formatIdsLine: empty list -> empty string, not 'undefined'", () => {
  assert.equal(formatIdsLine([]), "");
  assert.equal(formatIdsLine(undefined), "");
});

test("formatIdsLine: single id -> no trailing comma", () => {
  assert.equal(formatIdsLine(["only-one"]), "only-one");
});

// ── buildOutputPayload ───────────────────────────────────────────────────────────────────────────────

test("buildOutputPayload: shape + counts over a mixed-reason set", () => {
  const rows = [
    { id: "r1", intelligence_item_id: "i1", reason: "verified", requested_at: "2026-09-01T00:00:00Z" },
    { id: "r2", intelligence_item_id: "i2", reason: "tags_applied", requested_at: "2026-09-01T00:01:00Z" },
    { id: "r3", intelligence_item_id: "i3", reason: "verified", requested_at: "2026-09-01T00:02:00Z" },
  ];
  const payload = buildOutputPayload(rows, { generatedAt: "2026-09-01T12:00:00Z" });
  assert.equal(payload.generated_at, "2026-09-01T12:00:00Z");
  assert.equal(payload.count, 3);
  assert.deepEqual(payload.by_reason, { verified: 2, tags_applied: 1 });
  assert.deepEqual(payload.ids, ["i1", "i2", "i3"]);
  assert.equal(payload.requests.length, 3);
  assert.deepEqual(payload.requests[0], {
    id: "r1", intelligence_item_id: "i1", reason: "verified", requested_at: "2026-09-01T00:00:00Z",
  });
});

test("buildOutputPayload: empty rows -> count 0, empty ids/requests/by_reason, still a valid object", () => {
  const payload = buildOutputPayload([], { generatedAt: "2026-09-01T12:00:00Z" });
  assert.equal(payload.count, 0);
  assert.deepEqual(payload.ids, []);
  assert.deepEqual(payload.requests, []);
  assert.deepEqual(payload.by_reason, {});
});

test("buildOutputPayload: a row with a missing/null reason counts under 'unknown', never throws", () => {
  const rows = [{ id: "r1", intelligence_item_id: "i1", reason: null, requested_at: "2026-09-01T00:00:00Z" }];
  const payload = buildOutputPayload(rows, { generatedAt: "2026-09-01T12:00:00Z" });
  assert.deepEqual(payload.by_reason, { unknown: 1 });
});
