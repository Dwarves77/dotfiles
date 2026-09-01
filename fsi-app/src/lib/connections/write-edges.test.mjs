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
