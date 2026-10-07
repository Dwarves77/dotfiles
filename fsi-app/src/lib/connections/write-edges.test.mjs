// write-edges.test.mjs — proves the origin-ownership guard (the correctness claim, not just idempotency).
// Portable: node: builtins + a relative .mjs import only (no @/ alias, no npm deps) so it runs in the
// no-npm-ci discipline suite, which globs src/lib/connections/*.test.mjs (joins by construction).

import test from "node:test";
import assert from "node:assert/strict";
import { writeDiscoveredEdges } from "./write-edges.mjs";

// Minimal fake Supabase client: one page of existing edges on read, captures every upsert batch.
function fakeClient(existing, captured, { upsertError = null } = {}) {
  return {
    from() {
      return {
        select() { return this; },
        order() { return this; },
        range(from) { return Promise.resolve({ data: from === 0 ? existing : [], error: null }); },
        upsert(batch, opts) { captured.push({ batch, opts }); return Promise.resolve({ error: upsertError }); },
      };
    },
  };
}

const edge = (s, t, score = 0.5) => ({
  source_item_id: s, target_item_id: t, relationship: "related",
  origin: "provenance_discovery", basis: [{ signal: "shared_source" }], score,
});

test("origin ownership: skip foreign-origin pairs, refresh own, insert absent", async () => {
  const existing = [
    { source_item_id: "A", target_item_id: "B", origin: "agent_semantic" },       // foreign → must NOT clobber
    { source_item_id: "C", target_item_id: "D", origin: "entity_extraction" },    // foreign → must NOT clobber
    { source_item_id: "E", target_item_id: "F", origin: "provenance_discovery" }, // ours    → refresh
  ];
  const captured = [];
  const r = await writeDiscoveredEdges(fakeClient(existing, captured), [
    edge("A", "B"), // existing agent_semantic → skip
    edge("E", "F"), // existing ours          → refresh
    edge("G", "H"), // absent                 → insert
  ]);

  assert.equal(r.skippedForeignOrigin, 1, "the agent_semantic pair (A,B) is skipped");
  assert.equal(r.refreshed, 1, "the provenance_discovery pair (E,F) is a refresh");
  assert.equal(r.inserted, 1, "the absent pair (G,H) is an insert");
  assert.equal(r.written, 2, "exactly 2 rows written (refresh + insert)");
  assert.equal(r.failedChunks, 0);

  const written = captured.flatMap((c) => c.batch).map((e) => `${e.source_item_id}${e.target_item_id}`).sort();
  assert.deepEqual(written, ["EF", "GH"], "upsert payload is exactly the writable pairs");
  assert.ok(!written.includes("AB"), "the pre-existing agent_semantic edge (A,B) is never overwritten");
});

test("upsert targets the (source,target) unique constraint", async () => {
  const captured = [];
  await writeDiscoveredEdges(fakeClient([], captured), [edge("G", "H")]);
  assert.equal(captured[0].opts.onConflict, "source_item_id,target_item_id");
});

test("no-op on empty input — no read, no write", async () => {
  const captured = [];
  const r = await writeDiscoveredEdges(fakeClient([], captured), []);
  assert.equal(r.written, 0);
  assert.equal(captured.length, 0, "empty input never issues an upsert");
});

test("a failed chunk is counted, not thrown (non-gating)", async () => {
  const captured = [];
  const sb = fakeClient([], captured, { upsertError: { message: "boom" } });
  const r = await writeDiscoveredEdges(sb, [edge("G", "H")]);
  assert.equal(r.failedChunks, 1);
  assert.equal(r.written, 0, "a failed chunk contributes 0 written");
});

// ── R1 retrofit: prior-state snapshot capture (opt-in) ──────────────────────────────────────────

import { readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// db.mjs's own snapshot() format, reproduced here as an independent fixture (NOT imported from
// db.mjs — that would just prove the two functions call the same code, not that the byte SHAPE
// matches). This is the exact format string db.mjs's snapshot() emits per line.
function dbMjsShapedLine(cite, table, prior) {
  return JSON.stringify({ _cite: cite, table, prior }) + "\n";
}

test("snapshot: omitted -> no filesystem write, pre-retrofit behavior unchanged (mint-item.ts's call site)", async () => {
  const existing = [{ source_item_id: "E", target_item_id: "F", origin: "provenance_discovery", basis: [], score: 0.4 }];
  const captured = [];
  const r = await writeDiscoveredEdges(fakeClient(existing, captured), [edge("E", "F")]); // no opts.snapshot
  assert.equal(r.snapshot, null);
});

test("snapshot: a REFRESH captures the prior row; a plain INSERT captures nothing (no prior row to lose)", async () => {
  const dir = join(tmpdir(), `write-edges-snap-${randomUUID()}`);
  const existing = [{ source_item_id: "E", target_item_id: "F", origin: "provenance_discovery", basis: [{ signal: "shared_source" }], score: 0.4 }];
  const captured = [];
  const cite = { skill: "flywheel-build-plan-2026-08-10", reason: "test" };
  const r = await writeDiscoveredEdges(
    fakeClient(existing, captured),
    [edge("E", "F", 0.9), edge("G", "H", 0.5)], // E,F refreshes; G,H is a fresh insert
    { snapshot: { dir, cite, stampIso: "2026-09-01T00:00:00.000Z" } },
  );
  assert.equal(r.refreshed, 1);
  assert.equal(r.inserted, 1);
  assert.ok(r.snapshot, "a snapshot file path is returned when a refresh occurred");
  assert.ok(existsSync(r.snapshot));

  const lines = readFileSync(r.snapshot, "utf8").trim().split("\n");
  assert.equal(lines.length, 1, "only the ONE refreshed row is snapshotted — the insert needs no prior capture");
  const parsed = JSON.parse(lines[0]);
  assert.deepEqual(parsed._cite, cite);
  assert.equal(parsed.table, "item_cross_references");
  assert.equal(parsed.prior.source_item_id, "E");
  assert.equal(parsed.prior.target_item_id, "F");
  assert.equal(parsed.prior.score, 0.4, "captures the PRIOR score (0.4), not the new one (0.9)");

  rmSync(dir, { recursive: true, force: true });
});

test("snapshot: byte-format matches db.mjs's snapshot() shape exactly (one JSON line per row, {_cite,table,prior})", async () => {
  const dir = join(tmpdir(), `write-edges-snap-${randomUUID()}`);
  const priorRow = { source_item_id: "E", target_item_id: "F", origin: "provenance_discovery", basis: [], score: 0.4 };
  const existing = [priorRow];
  const cite = { skill: "flywheel-build-plan-2026-08-10", reason: "test" };
  const stampIso = "2026-09-01T00:00:00.000Z";
  const r = await writeDiscoveredEdges(
    fakeClient(existing, []),
    [edge("E", "F", 0.9)],
    { snapshot: { dir, cite, stampIso } },
  );
  const actual = readFileSync(r.snapshot, "utf8");
  const expected = dbMjsShapedLine(cite, "item_cross_references", priorRow);
  assert.equal(actual, expected, "byte-identical to db.mjs's snapshot() line format");

  const expectedStamp = stampIso.replace(/[:.]/g, "-");
  assert.ok(r.snapshot.endsWith(`${expectedStamp}_item_cross_references.jsonl`), "filename mirrors db.mjs's <stamp>_<table>.jsonl convention");

  rmSync(dir, { recursive: true, force: true });
});

test("snapshot: no refreshes occurred -> no file is written even when opted in", async () => {
  const dir = join(tmpdir(), `write-edges-snap-${randomUUID()}`);
  const r = await writeDiscoveredEdges(
    fakeClient([], []),
    [edge("G", "H")], // pure insert, nothing to refresh
    { snapshot: { dir, cite: { skill: "x", reason: "y" } } },
  );
  assert.equal(r.snapshot, null);
  assert.ok(!existsSync(dir), "snapDir is never created when there is nothing to snapshot");
});

// ── lane S3-A: intersection basis entries on the pair's existing edge ──────────────────────────────
import { planIntersectionEdges, writeIntersectionEdges } from "./write-edges.mjs";
import { detectIntersections, buildIntersectionEntry } from "./intersections.mjs";

const xitem = (id, extra = {}) => ({
  id, item_type: "regulation", domain: 1, priority: "MODERATE",
  operational_scenario_tags: ["s1"], compliance_object_tags: ["customs-broker"], related_items: [], ...extra,
});
const row = (id, s, t, extra = {}) => ({
  id, source_item_id: s, target_item_id: t, relationship: "related", origin: "provenance_discovery",
  basis: [{ signal: "shared_source", detail: "grounded in the same source", weight: 0.4 }], score: 0.4, ...extra,
});
const xpairs = (...items) => detectIntersections(items);

// Fake client with select pages, upsert capture and delete().in() capture.
function xClient(existing, cap) {
  return {
    from() {
      return {
        select() { return this; },
        order() { return this; },
        range(from) { return Promise.resolve({ data: from === 0 ? existing : [], error: null }); },
        upsert(batch, opts) { cap.upserts.push({ batch, opts }); return Promise.resolve({ error: null }); },
        delete() { return { in(col, ids) { cap.deletes.push({ col, ids }); return Promise.resolve({ error: null }); } }; },
      };
    },
  };
}

test("intersection: the pair edge gains the intersection entry and KEEPS its other basis, score, origin", async () => {
  const pairs = xpairs(xitem("a"), xitem("b", { item_type: "market_signal", domain: 4 }));
  const existing = [row("r1", "a", "b"), row("r2", "b", "a")];
  const cap = { upserts: [], deletes: [] };
  const r = await writeIntersectionEdges(xClient(existing, cap), pairs);
  assert.equal(r.updated, 2);
  assert.equal(r.inserted, 0);
  const rows = cap.upserts.flatMap((u) => u.batch);
  assert.equal(rows.length, 2);
  for (const w of rows) {
    assert.equal(w.origin, "provenance_discovery");
    assert.equal(w.score, 0.4, "existing score untouched (ADR-022: additive)");
    assert.equal(w.relationship, "related");
    assert.deepEqual(w.basis[0], existing[0].basis[0], "prior basis entry kept first");
    const ix = w.basis.find((b) => b.signal === "intersection");
    assert.deepEqual(ix.detail, { scenarios: ["s1"], objects: ["customs-broker"], strength: 5, tier: "weak" });
  }
});

test("intersection: a pair with no row gets both directed rows, related/provenance_discovery, score from strength", async () => {
  const pairs = xpairs(xitem("a"), xitem("b"));
  const cap = { upserts: [], deletes: [] };
  const r = await writeIntersectionEdges(xClient([], cap), pairs);
  assert.equal(r.inserted, 2);
  const rows = cap.upserts.flatMap((u) => u.batch);
  assert.deepEqual(rows.map((w) => `${w.source_item_id}>${w.target_item_id}`).sort(), ["a>b", "b>a"]);
  for (const w of rows) {
    assert.equal(w.relationship, "related");
    assert.equal(w.origin, "provenance_discovery");
    assert.equal(w.score, 0.3); // strength 5 -> floor
    assert.equal(w.basis.length, 1);
    assert.equal(w.basis[0].signal, "intersection");
  }
});

test("intersection: a manual-origin row is never changed", async () => {
  const pairs = xpairs(xitem("a"), xitem("b"));
  const existing = [row("r1", "a", "b", { origin: "manual", basis: null, score: null })];
  const cap = { upserts: [], deletes: [] };
  const r = await writeIntersectionEdges(xClient(existing, cap), pairs);
  assert.equal(r.skippedManual, 1);
  const rows = cap.upserts.flatMap((u) => u.batch);
  assert.ok(!rows.some((w) => w.source_item_id === "a" && w.target_item_id === "b"), "manual row not in any write");
});

test("intersection: an entity_extraction row keeps origin, relationship and score; only basis gains the entry", async () => {
  const pairs = xpairs(xitem("a"), xitem("b"));
  const existing = [row("r1", "a", "b", { origin: "entity_extraction", relationship: "amends", basis: null, score: null })];
  const cap = { upserts: [], deletes: [] };
  await writeIntersectionEdges(xClient(existing, cap), pairs);
  const w = cap.upserts.flatMap((u) => u.batch).find((x) => x.source_item_id === "a");
  assert.equal(w.origin, "entity_extraction");
  assert.equal(w.relationship, "amends");
  assert.equal(w.score, null);
  assert.deepEqual(w.basis.map((b) => b.signal), ["intersection"]);
});

test("intersection: a pair that stops intersecting loses ONLY the intersection entry", async () => {
  const stale = buildIntersectionEntry(xpairs(xitem("a"), xitem("b"))[0]);
  const keep = { signal: "shared_source", detail: "grounded in the same source", weight: 0.4 };
  const existing = [row("r1", "a", "b", { basis: [keep, stale] }), row("r2", "b", "a", { basis: [keep, stale] })];
  const cap = { upserts: [], deletes: [] };
  const pairs = xpairs(xitem("a"), xitem("b", { operational_scenario_tags: ["other"] }));
  assert.deepEqual(pairs, []);
  const r = await writeIntersectionEdges(xClient(existing, cap), pairs);
  assert.equal(r.removed, 2);
  const rows = cap.upserts.flatMap((u) => u.batch);
  for (const w of rows) {
    assert.deepEqual(w.basis, [keep]);
    assert.equal(w.score, 0.4);
    assert.equal(w.origin, "provenance_discovery");
  }
  assert.equal(cap.deletes.length, 0);
});

test("intersection: a manual row carrying a stale intersection entry is left alone on removal too", async () => {
  const stale = buildIntersectionEntry(xpairs(xitem("a"), xitem("b"))[0]);
  const existing = [row("r1", "a", "b", { origin: "manual", basis: [stale], score: null })];
  const cap = { upserts: [], deletes: [] };
  const r = await writeIntersectionEdges(xClient(existing, cap), []);
  assert.equal(r.removed, 0);
  assert.equal(cap.upserts.length, 0);
});

test("intersection: an intersection-only discovery row that stops holding is deleted (no ungrounded edge), snapshotted", async () => {
  const stale = buildIntersectionEntry(xpairs(xitem("a"), xitem("b"))[0]);
  const existing = [row("r1", "a", "b", { basis: [stale], score: 0.3 })];
  const cap = { upserts: [], deletes: [] };
  const dir = join(tmpdir(), `ix-snap-${randomUUID()}`);
  const r = await writeIntersectionEdges(xClient(existing, cap), [], { snapshot: { dir, cite: { skill: "x", reason: "y" }, stampIso: "2026-10-04T00:00:00.000Z" } });
  assert.equal(r.deleted, 1);
  assert.deepEqual(cap.deletes, [{ col: "id", ids: ["r1"] }]);
  assert.ok(r.snapshot && existsSync(r.snapshot));
  assert.equal(JSON.parse(readFileSync(r.snapshot, "utf8").trim()).prior.id, "r1");
  rmSync(dir, { recursive: true, force: true });
});

test("intersection: an unchanged entry is not rewritten (idempotent re-run)", async () => {
  const pairs = xpairs(xitem("a"), xitem("b"));
  const entry = buildIntersectionEntry(pairs[0]);
  const existing = [row("r1", "a", "b", { basis: [entry] }), row("r2", "b", "a", { basis: [entry] })];
  const cap = { upserts: [], deletes: [] };
  const r = await writeIntersectionEdges(xClient(existing, cap), pairs);
  assert.equal(r.unchanged, 2);
  assert.equal(r.written, 0);
  assert.equal(cap.upserts.length, 0);
});

test("intersection: dry mode writes nothing and needs no client, but reports the plan and a projection", async () => {
  const pairs = xpairs(xitem("a"), xitem("b"));
  const existing = [row("r1", "a", "b")];
  const r = await writeIntersectionEdges(null, pairs, { dry: true, existing });
  assert.equal(r.written, 0);
  assert.equal(r.inserted, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.projected.length, 2);
  assert.ok(r.projected.every((x) => x.basis.some((b) => b.signal === "intersection")));
  assert.equal(existing[0].basis.length, 1, "input rows are not mutated");
});

test("intersection: planIntersectionEdges is pure and counts every disposition", () => {
  const pairs = xpairs(xitem("a"), xitem("b"));
  const plan = planIntersectionEdges([row("r1", "a", "b", { origin: "manual" })], pairs);
  assert.equal(plan.skippedManual, 1);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].source_item_id, "b");
});

test("discovery refresh of an own-origin row CARRIES its intersection entry instead of erasing it", async () => {
  const entry = buildIntersectionEntry(xpairs(xitem("a"), xitem("b"))[0]);
  const existing = [{ source_item_id: "E", target_item_id: "F", origin: "provenance_discovery", basis: [{ signal: "shared_source" }, entry], score: 0.4 }];
  const captured = [];
  await writeDiscoveredEdges(fakeClient(existing, captured), [edge("E", "F", 0.9)]);
  const w = captured.flatMap((c) => c.batch)[0];
  assert.equal(w.score, 0.9);
  assert.ok(w.basis.some((b) => b.signal === "intersection"), "intersection entry survives the discovery refresh");
  assert.ok(w.basis.some((b) => b.signal === "shared_source"));
});

// ── lane G7-CORR: connection tombstones (item_corrections, migration 356) ───────────────────────────────────────
// The database trigger already skips a tombstoned machine edge; the writer reads the same tombstones so it
// plans around them and reports skippedTombstoned instead of counting a row it knows will be dropped.
function tombClient(corrections, existing, captured) {
  return {
    from(table) {
      const rows = table === "item_corrections" ? corrections : existing;
      return {
        select() { return this; },
        order() { return this; },
        range(from) { return Promise.resolve({ data: from === 0 ? rows : [], error: null }); },
        upsert(batch, opts) { captured.push({ batch, opts }); return Promise.resolve({ error: null }); },
      };
    },
  };
}
const tomb = (item, other, op = "remove", extra = {}) => ({
  id: `t-${item}-${other}-${op}`, item_id: item, target_kind: "connection", target_ref: other, op,
  created_at: "2026-10-06T00:00:00Z", revoked_at: null, ...extra,
});

test("G7-CORR: a discovery edge on a tombstoned pair is skipped in BOTH directions and counted", async () => {
  const captured = [];
  const r = await writeDiscoveredEdges(tombClient([tomb("A", "B")], [], captured), [edge("A", "B"), edge("B", "A"), edge("G", "H")]);
  assert.equal(r.skippedTombstoned, 2);
  assert.equal(r.inserted, 1);
  assert.deepEqual(captured.flatMap((c) => c.batch).map((e) => `${e.source_item_id}${e.target_item_id}`), ["GH"]);
});

test("G7-CORR: a revoked tombstone, or a newer admin add, lets the edge through", async () => {
  const captured = [];
  const revoked = tomb("A", "B", "remove", { revoked_at: "2026-10-07T00:00:00Z" });
  let r = await writeDiscoveredEdges(tombClient([revoked], [], captured), [edge("A", "B")]);
  assert.equal(r.skippedTombstoned, 0);
  assert.equal(r.inserted, 1);
  const newerAdd = tomb("B", "A", "add", { created_at: "2026-10-08T00:00:00Z" });
  r = await writeDiscoveredEdges(tombClient([tomb("A", "B"), newerAdd], [], captured), [edge("A", "B")]);
  assert.equal(r.skippedTombstoned, 0);
});

test("G7-CORR: a correction read failure throws (fail closed) rather than planning as if there were no tombstones", async () => {
  const sb = {
    from(table) {
      return {
        select() { return this; }, order() { return this; },
        range() { return Promise.resolve(table === "item_corrections" ? { data: null, error: { message: "relation does not exist" } } : { data: [], error: null }); },
        upsert() { return Promise.resolve({ error: null }); },
      };
    },
  };
  await assert.rejects(() => writeDiscoveredEdges(sb, [edge("A", "B")]), /paginated read failed/);
});

test("G7-CORR: an intersection pair on a tombstoned pair is neither inserted nor updated", async () => {
  const { planIntersectionEdges } = await import("./write-edges.mjs");
  const pairs = [{ a: "A", b: "B", shared_scenarios: ["s"], shared_objects: [], strength: 0.5, tier: "medium" }];
  const plan = planIntersectionEdges([], pairs, new Set(["A|B"]));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.skippedTombstoned, 2, "both directed rows are skipped");
  assert.equal(planIntersectionEdges([], pairs).inserts.length, 2, "without tombstones the same pair inserts both rows");
});
