// close-flags-for-verified-items.test.mjs -- dependency-injected, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planClosure,
  buildResolutionNote,
  buildArchivedResolutionNote,
  archivedDateIso,
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
  assert.deepEqual(planClosure([], {}), { toResolve: [], toResolveArchived: [], stillOpen: [] });
  assert.deepEqual(planClosure(undefined, {}), { toResolve: [], toResolveArchived: [], stillOpen: [] });
});

// ── D17 family 14 addendum (2026-09-13): archived items resolve as moot ────────────────────────────────

test("buildArchivedResolutionNote: fixed wording, dated", () => {
  assert.equal(buildArchivedResolutionNote("2026-08-01"), "item archived on 2026-08-01; finding moot");
});

test("archivedDateIso: prefers archived_at when present, falls back to updated_at, never invents a date", () => {
  assert.equal(archivedDateIso({ archived_at: "2026-08-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }), "2026-08-01");
  assert.equal(archivedDateIso({ updated_at: "2026-09-01T00:00:00Z" }), "2026-09-01");
  assert.equal(archivedDateIso({}), null);
  assert.equal(archivedDateIso(null), null);
  assert.equal(archivedDateIso({ updated_at: "not-a-date" }), null);
});

test("REQUIRED: an archived item's flag resolves with the archived note, in its own bucket", () => {
  const rows = [{ id: "f5", subject_ref: "item-5", created_by: "gate-a-verifier-sweep" }];
  const { toResolve, toResolveArchived, stillOpen } = planClosure(rows, {
    "item-5": { provenance_status: "quarantined", is_archived: true, updated_at: "2026-08-15T00:00:00Z" },
  });
  assert.equal(toResolve.length, 0, "not counted as a verified-resolve");
  assert.equal(stillOpen.length, 0, "not left open either -- archived is its own resolution");
  assert.equal(toResolveArchived.length, 1);
  assert.equal(toResolveArchived[0].id, "f5");
  assert.equal(toResolveArchived[0].archived_date, "2026-08-15");
});

test("REQUIRED: a live quarantined item's flag stays open (is_archived false)", () => {
  const rows = [{ id: "f6", subject_ref: "item-6", created_by: "gate-a-verifier-sweep" }];
  const { toResolve, toResolveArchived, stillOpen } = planClosure(rows, {
    "item-6": { provenance_status: "quarantined", is_archived: false, updated_at: "2026-08-15T00:00:00Z" },
  });
  assert.equal(toResolve.length, 0);
  assert.equal(toResolveArchived.length, 0);
  assert.equal(stillOpen.length, 1);
  assert.equal(stillOpen[0].item_id, "item-6");
});

test("planClosure: verified takes priority over is_archived when a state carries both (should not co-occur live, but never ambiguous)", () => {
  const rows = [{ id: "f7", subject_ref: "item-7", created_by: "gate-a-verifier-sweep" }];
  const { toResolve, toResolveArchived } = planClosure(rows, {
    "item-7": { provenance_status: "verified", is_archived: true, updated_at: "2026-08-15T00:00:00Z" },
  });
  assert.equal(toResolve.length, 1);
  assert.equal(toResolveArchived.length, 0);
});

// ── main() orchestration under injected deps ────────────────────────────────────────────────────────

// `provenanceByItem` keeps the pre-addendum call shape (item id -> bare provenance_status string) working
// unchanged; `archivedByItem` (item id -> {is_archived, updated_at}) is the new, additive family-14 input.
// A caller wanting both on the same item passes an object into provenanceByItem instead of a string.
function fakeDeps({ rows = [], provenanceByItem = {}, archivedByItem = {} } = {}) {
  const resolved = [];
  return {
    todayIso: "2026-09-12",
    readCandidates: async () => rows,
    readItemState: async (itemId) => {
      const raw = provenanceByItem[itemId];
      if (raw && typeof raw === "object") return raw;
      const archived = archivedByItem[itemId];
      if (archived) return { provenance_status: raw ?? null, ...archived };
      return raw !== undefined ? raw : null;
    },
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

test("main(apply): second run with nothing newly archived changes nothing (idempotent)", async () => {
  // Simulates the second run: the resolved-as-archived row no longer appears in readCandidates (it is
  // status='resolved' now, outside the open/in_review scope) -- only the still-quarantined row remains.
  const deps = fakeDeps({
    rows: [{ id: "f6", subject_ref: "item-6", created_by: "gate-a-verifier-sweep" }],
    archivedByItem: { "item-6": { is_archived: false, updated_at: "2026-08-15T00:00:00Z" } },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps._resolved().length, 0);
  assert.equal(summary.applied, 0);
  assert.deepEqual(summary.still_open_item_ids, ["item-6"]);
});

test("main(dry): an archived item's row is counted in its own bucket, not still_open", async () => {
  const deps = fakeDeps({
    rows: [
      { id: "f5", subject_ref: "item-5", created_by: "gate-a-verifier-sweep" },
      { id: "f6", subject_ref: "item-6", created_by: "gate-a-verifier-sweep" },
    ],
    archivedByItem: { "item-5": { is_archived: true, updated_at: "2026-08-15T00:00:00Z" }, "item-6": { is_archived: false } },
  });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.would_resolve, 0);
  assert.equal(summary.counts.would_resolve_archived, 1);
  assert.equal(summary.counts.still_open, 1);
  assert.deepEqual(summary.still_open_item_ids, ["item-6"]);
});

test("main(apply): resolves an archived item's flag with 'item archived on <date>; finding moot'", async () => {
  const deps = fakeDeps({
    rows: [{ id: "f5", subject_ref: "item-5", created_by: "gate-a-verifier-sweep" }],
    archivedByItem: { "item-5": { is_archived: true, updated_at: "2026-08-15T00:00:00Z" } },
  });
  const summary = await main({ mode: "apply" }, deps);
  const resolved = deps._resolved();
  assert.equal(resolved.length, 1);
  assert.deepEqual(resolved[0].ids, ["f5"]);
  assert.equal(resolved[0].note, "item archived on 2026-08-15; finding moot");
  assert.equal(summary.applied, 1);
  assert.deepEqual(summary.still_open_item_ids, []);
});

test("main(apply): a live quarantined item's flag stays open, only the archived one resolves", async () => {
  const deps = fakeDeps({
    rows: [
      { id: "f5", subject_ref: "item-5", created_by: "gate-a-verifier-sweep" },
      { id: "f6", subject_ref: "item-6", created_by: "gate-a-verifier-sweep" },
    ],
    archivedByItem: { "item-5": { is_archived: true, updated_at: "2026-08-15T00:00:00Z" }, "item-6": { is_archived: false } },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.applied, 1);
  assert.deepEqual(summary.still_open_item_ids, ["item-6"]);
  const resolved = deps._resolved();
  assert.equal(resolved.length, 1, "only the archived item's group was written");
  assert.deepEqual(resolved[0].ids, ["f5"]);
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
