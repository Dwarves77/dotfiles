// close-flags-for-verified-items.test.mjs -- dependency-injected, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planClosure,
  buildResolutionNote,
  main,
  PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES,
  RESOLVED_BY,
} from "./close-flags-for-verified-items.mjs";

test("PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES names gate-a-verifier-sweep as its first entry", () => {
  assert.equal(PER_ITEM_VERIFIED_SUPERSEDE_FAMILIES[0], "gate-a-verifier-sweep");
});

test("buildResolutionNote: fixed, dated wording", () => {
  assert.equal(buildResolutionNote("2026-09-12"), "item verified on 2026-09-12; finding superseded");
});

// ── planClosure ──────────────────────────────────────────────────────────────────────────────────────

test("planClosure: a verified item's flag resolves", () => {
  const rows = [{ id: "f1", subject_ref: "item-1", created_by: "gate-a-verifier-sweep" }];
  const { toResolve, stillOpen } = planClosure(rows, { "item-1": "verified" });
  assert.equal(toResolve.length, 1);
  assert.equal(stillOpen.length, 0);
  assert.equal(toResolve[0].id, "f1");
  assert.equal(toResolve[0].item_id, "item-1");
});

test("planClosure: a quarantined item's flag stays open and is listed", () => {
  const rows = [{ id: "f2", subject_ref: "item-2", created_by: "gate-a-verifier-sweep" }];
  const { toResolve, stillOpen } = planClosure(rows, { "item-2": "quarantined" });
  assert.equal(toResolve.length, 0);
  assert.equal(stillOpen.length, 1);
  assert.equal(stillOpen[0].item_id, "item-2");
  assert.equal(stillOpen[0].provenance_status, "quarantined");
});

test("planClosure: an unknown/missing provenance_status stays open, never assumed verified", () => {
  const rows = [{ id: "f3", subject_ref: "item-3", created_by: "gate-a-verifier-sweep" }];
  const { toResolve, stillOpen } = planClosure(rows, {});
  assert.equal(toResolve.length, 0);
  assert.equal(stillOpen.length, 1);
  assert.equal(stillOpen[0].provenance_status, null);
});

test("planClosure: a row with no subject_ref stays open (nothing to check)", () => {
  const rows = [{ id: "f4", subject_ref: null, created_by: "gate-a-verifier-sweep" }];
  const { stillOpen } = planClosure(rows, {});
  assert.equal(stillOpen.length, 1);
});

test("planClosure: mixed rows split correctly", () => {
  const rows = [
    { id: "a", subject_ref: "1", created_by: "gate-a-verifier-sweep" },
    { id: "b", subject_ref: "2", created_by: "gate-a-verifier-sweep" },
    { id: "c", subject_ref: "1", created_by: "gate-a-verifier-sweep" },
  ];
  const { toResolve, stillOpen } = planClosure(rows, { "1": "verified", "2": "quarantined" });
  assert.equal(toResolve.length, 2);
  assert.deepEqual(toResolve.map((r) => r.id).sort(), ["a", "c"]);
  assert.equal(stillOpen.length, 1);
  assert.equal(stillOpen[0].id, "b");
});

test("planClosure: empty input is safe", () => {
  assert.deepEqual(planClosure([], {}), { toResolve: [], stillOpen: [] });
  assert.deepEqual(planClosure(undefined, {}), { toResolve: [], stillOpen: [] });
});

// ── main() orchestration under injected deps ────────────────────────────────────────────────────────

function fakeDeps({ rows = [], provenanceByItem = {} } = {}) {
  const resolved = [];
  return {
    todayIso: "2026-09-12",
    readCandidates: async () => rows,
    readItemProvenanceStatus: async (itemId) => provenanceByItem[itemId] ?? null,
    resolveIds: async (ids, note) => { resolved.push({ ids, note }); return { updated: ids.length, snapshot: "scripts/_snapshots/fake.jsonl" }; },
    readRemainingOpen: async () => [],
    _resolved: () => resolved,
  };
}

test("main(dry): reports counts and the still-open item id list, writes nothing", async () => {
  const deps = fakeDeps({
    rows: [
      { id: "f1", subject_ref: "item-1", created_by: "gate-a-verifier-sweep" },
      { id: "f2", subject_ref: "item-2", created_by: "gate-a-verifier-sweep" },
    ],
    provenanceByItem: { "item-1": "verified", "item-2": "quarantined" },
  });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.would_resolve, 1);
  assert.equal(summary.counts.still_open, 1);
  assert.deepEqual(summary.still_open_item_ids, ["item-2"]);
  assert.equal(deps._resolved().length, 0);
  assert.match(summary.note, /DRY/);
});

test("main(apply): resolves the verified item's flag with the dated note, leaves the quarantined one open", async () => {
  const deps = fakeDeps({
    rows: [
      { id: "f1", subject_ref: "item-1", created_by: "gate-a-verifier-sweep" },
      { id: "f2", subject_ref: "item-2", created_by: "gate-a-verifier-sweep" },
    ],
    provenanceByItem: { "item-1": "verified", "item-2": "quarantined" },
  });
  const summary = await main({ mode: "apply" }, deps);
  const resolved = deps._resolved();
  assert.equal(resolved.length, 1);
  assert.deepEqual(resolved[0].ids, ["f1"]);
  assert.equal(resolved[0].note, "item verified on 2026-09-12; finding superseded");
  assert.equal(summary.applied, 1);
  assert.deepEqual(summary.still_open_item_ids, ["item-2"]);
});

test("main(apply): second run with nothing newly verified changes nothing (idempotent)", async () => {
  // Simulates the second run: the previously-resolved row no longer appears in readCandidates (it is
  // status='resolved' now, outside the open/in_review scope) -- only the still-quarantined row remains.
  const deps = fakeDeps({
    rows: [{ id: "f2", subject_ref: "item-2", created_by: "gate-a-verifier-sweep" }],
    provenanceByItem: { "item-2": "quarantined" },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps._resolved().length, 0);
  assert.equal(summary.applied, 0);
  assert.deepEqual(summary.still_open_item_ids, ["item-2"]);
});

test("main(apply): no candidates at all -> resolveIds never called", async () => {
  const deps = fakeDeps({ rows: [] });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps._resolved().length, 0);
  assert.equal(summary.applied, 0);
});

test("RESOLVED_BY matches the step's own name", () => {
  assert.equal(RESOLVED_BY, "close-flags-for-verified-items");
});
