// consume-turn-requests.test.mjs — proves the pure selection/formatting/arg-parsing logic without a DB
// or process.exit. Importing this module never runs main() (IS_MAIN guards on process.argv[1] against
// this file's own path — same pattern discover-for-items.test.mjs uses for its sibling script), so import
// is side-effect-free.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  toIdList,
  formatIdsLine,
  buildOutputPayload,
  applyLimit,
  extractRequestIdsFromSnapshot,
  partitionByCorpusMembership,
  extractArchivedRequestIdsFromSnapshot,
  archivedConsumedBy,
} from "./consume-turn-requests.mjs";

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

// ── --limit (lane TURNREQ, 2026-09-04 — corpus-turn's bounded ticket-queue selection) ──────────────

test("parseArgs: no --limit -> null (unbounded read, unchanged default)", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, null);
});

test("parseArgs: --limit accepts a positive integer", () => {
  const r = parseArgs(["--limit", "200"]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 200);
});

test("parseArgs: --limit rejects zero, negative, non-integer, and non-numeric", () => {
  for (const bad of ["0", "-5", "1.5", "abc"]) {
    const r = parseArgs(["--limit", bad]);
    assert.equal(r.ok, false, `expected --limit ${bad} to be refused`);
    assert.match(r.error, /--limit must be a positive integer/);
  }
});

test("parseArgs: --limit composes with --out and --mark-consumed --by", () => {
  const r = parseArgs(["--out", "x.json", "--limit", "50", "--mark-consumed", "--by", "op"]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 50);
  assert.equal(r.out, "x.json");
});

// ── --mark-file (MODE 2 — retire exactly a prior snapshot's rows, never a fresh "open" re-read) ────

test("parseArgs: --mark-file requires --by", () => {
  const r = parseArgs(["--mark-file", "snap.json"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mark-file requires --by/);
});

test("parseArgs: --mark-file with no path argument is refused", () => {
  const r = parseArgs(["--mark-file", "--by", "op"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mark-file requires a path argument/);
});

test("parseArgs: --mark-file --by <label> alone is ok", () => {
  const r = parseArgs(["--mark-file", "snap.json", "--by", "corpus-turn-42"]);
  assert.equal(r.ok, true);
  assert.equal(r.markFile, "snap.json");
  assert.equal(r.by, "corpus-turn-42");
  assert.equal(r.markConsumed, false);
});

test("parseArgs: --mark-file cannot be combined with --out, --limit, or --mark-consumed (MODE 1 vs MODE 2)", () => {
  assert.equal(parseArgs(["--mark-file", "s.json", "--by", "op", "--out", "x.json"]).ok, false);
  assert.equal(parseArgs(["--mark-file", "s.json", "--by", "op", "--limit", "10"]).ok, false);
  assert.equal(parseArgs(["--mark-file", "s.json", "--by", "op", "--mark-consumed"]).ok, false);
});

// ── applyLimit ───────────────────────────────────────────────────────────────────────────────────────

test("applyLimit: no limit -> rows unchanged", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(applyLimit(rows, null), rows);
  assert.deepEqual(applyLimit(rows, undefined), rows);
});

test("applyLimit: bounds to the first N rows, preserving order (rows are already oldest-first)", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(applyLimit(rows, 2), [{ id: "a" }, { id: "b" }]);
});

test("applyLimit: a limit larger than the row count returns every row, no error", () => {
  const rows = [{ id: "a" }];
  assert.deepEqual(applyLimit(rows, 500), rows);
});

test("applyLimit: a non-positive or non-integer limit is treated as unbounded (defensive)", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(applyLimit(rows, 0), rows);
  assert.deepEqual(applyLimit(rows, -1), rows);
  assert.deepEqual(applyLimit(rows, 1.5), rows);
});

test("applyLimit: undefined/empty rows -> empty array, never throws", () => {
  assert.deepEqual(applyLimit(undefined, 5), []);
  assert.deepEqual(applyLimit([], 5), []);
});

// ── extractRequestIdsFromSnapshot ───────────────────────────────────────────────────────────────────

test("extractRequestIdsFromSnapshot: pulls the request row ids (never intelligence_item_id)", () => {
  const payload = {
    requests: [
      { id: "req-1", intelligence_item_id: "item-1" },
      { id: "req-2", intelligence_item_id: "item-2" },
    ],
  };
  assert.deepEqual(extractRequestIdsFromSnapshot(payload), ["req-1", "req-2"]);
});

test("extractRequestIdsFromSnapshot: empty/malformed payload -> empty array, never throws", () => {
  assert.deepEqual(extractRequestIdsFromSnapshot({}), []);
  assert.deepEqual(extractRequestIdsFromSnapshot({ requests: [] }), []);
  assert.deepEqual(extractRequestIdsFromSnapshot(null), []);
  assert.deepEqual(extractRequestIdsFromSnapshot(undefined), []);
});

test("extractRequestIdsFromSnapshot: a request row missing id is skipped, not nulled into the list", () => {
  const payload = { requests: [{ id: "req-1" }, { intelligence_item_id: "item-2" }, { id: null }] };
  assert.deepEqual(extractRequestIdsFromSnapshot(payload), ["req-1"]);
});

test("extractRequestIdsFromSnapshot round-trips buildOutputPayload's own shape", () => {
  const rows = [
    { id: "r1", intelligence_item_id: "i1", reason: "verified", requested_at: "2026-09-01T00:00:00Z" },
    { id: "r2", intelligence_item_id: "i2", reason: "tags_applied", requested_at: "2026-09-01T00:01:00Z" },
  ];
  const payload = buildOutputPayload(rows, { generatedAt: "2026-09-01T12:00:00Z" });
  assert.deepEqual(extractRequestIdsFromSnapshot(payload), ["r1", "r2"]);
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

// ── TICKET-CORPUS (train 39): a ticket is what its item's live state says it is ──────────────────────

const T = (id, item) => ({ id, intelligence_item_id: item, reason: "verified", requested_at: "2026-09-01T00:00:00Z" });

test("partitionByCorpusMembership: verified+live -> selectable; archived -> archived; unverified/unknown -> deferred; order kept", () => {
  const rows = [T("r1", "i1"), T("r2", "i2"), T("r3", "i3"), T("r4", "i4"), T("r5", "i5")];
  const states = new Map([
    ["i1", { provenance_status: "verified", is_archived: false }],
    ["i2", { provenance_status: "verified", is_archived: true }],
    ["i3", { provenance_status: "draft", is_archived: false }],
    ["i5", { provenance_status: "verified", is_archived: false }],
    // i4 absent: item row gone -> deferred, never consumed
  ]);
  const { selectable, archived, deferred } = partitionByCorpusMembership(rows, states);
  assert.deepEqual(selectable.map((r) => r.id), ["r1", "r5"]);
  assert.deepEqual(archived.map((r) => r.id), ["r2"]);
  assert.deepEqual(deferred.map((r) => r.id), ["r3", "r4"]);
});

test("partitionByCorpusMembership: empty/undefined inputs never throw", () => {
  assert.deepEqual(partitionByCorpusMembership([], new Map()), { selectable: [], archived: [], deferred: [] });
  assert.deepEqual(partitionByCorpusMembership(undefined, undefined), { selectable: [], archived: [], deferred: [] });
});

test("applyLimit bounds the SELECTABLE set only: archived tickets ride along in the snapshot regardless of --limit", () => {
  const rows = [T("a1", "x1"), T("r1", "i1"), T("a2", "x2"), T("r2", "i2"), T("r3", "i3")];
  const states = new Map([
    ["x1", { provenance_status: "verified", is_archived: true }],
    ["x2", { provenance_status: "verified", is_archived: true }],
    ["i1", { provenance_status: "verified", is_archived: false }],
    ["i2", { provenance_status: "verified", is_archived: false }],
    ["i3", { provenance_status: "verified", is_archived: false }],
  ]);
  const { selectable, archived, deferred } = partitionByCorpusMembership(rows, states);
  const selected = applyLimit(selectable, 2);
  const payload = buildOutputPayload(selected, { generatedAt: "2026-09-04T00:00:00Z", archivedRows: archived, deferredCount: deferred.length });
  assert.deepEqual(payload.ids, ["i1", "i2"]);
  assert.deepEqual(extractRequestIdsFromSnapshot(payload), ["r1", "r2"]);
  assert.deepEqual(extractArchivedRequestIdsFromSnapshot(payload), ["a1", "a2"]);
  assert.equal(payload.deferred_not_verified, 0);
});

test("buildOutputPayload without the new options still carries empty archived_requests and deferred 0 (old callers unchanged)", () => {
  const payload = buildOutputPayload([T("r1", "i1")], { generatedAt: "2026-09-04T00:00:00Z" });
  assert.deepEqual(payload.archived_requests, []);
  assert.equal(payload.deferred_not_verified, 0);
  assert.deepEqual(extractArchivedRequestIdsFromSnapshot(payload), []);
  assert.deepEqual(extractArchivedRequestIdsFromSnapshot({}), []);
});

test("archivedConsumedBy: the label names the run AND the reason", () => {
  assert.equal(archivedConsumedBy("corpus-turn:33898080197"), "corpus-turn:33898080197:item-archived");
});
