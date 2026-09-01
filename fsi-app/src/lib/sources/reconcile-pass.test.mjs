// node --test src/lib/sources/reconcile-pass.test.mjs
//
// PROOF for runReconcilePass (Task 2, lane CD, 2026-09-01) — the reconcile-loop CORE, moved out of
// /api/worker/reconcile/route.ts so check-sources can call it in-process (one dispatch detects AND
// reconciles) alongside the manual-redrive route. Exercises the full per-row wiring against a fake
// Supabase client covering every table the pass + its two collaborators (recordSourceChangeTrigger,
// bridgeChangedSourceToStagedUpdates) touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runReconcilePass } from "./reconcile.ts";

function fakeSvc({ pendingRows = [], itemsBySource = {} } = {}) {
  const calls = { intelligenceChanges: [], stagedUpdates: [], monitoringQueueUpdates: [] };
  return {
    calls,
    from(table) {
      if (table === "monitoring_queue") {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          order() { return this; },
          limit: async () => ({ data: pendingRows, error: null }),
          update(patch) {
            return {
              eq: async (_col, id) => {
                calls.monitoringQueueUpdates.push({ id, patch });
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "intelligence_items") {
        let sourceId = null;
        const q = {
          select() { return q; },
          eq(col, val) {
            if (col === "source_id") sourceId = val;
            return q;
          },
          then(res) {
            return Promise.resolve({ data: itemsBySource[sourceId] ?? [], error: null }).then(res);
          },
        };
        return q;
      }
      if (table === "intelligence_changes") {
        return {
          insert: (row) => {
            calls.intelligenceChanges.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "chg-1" }, error: null }) }) };
          },
        };
      }
      if (table === "sources") {
        return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { url: "https://x.example/reg" }, error: null }) };
      }
      if (table === "raw_fetches") {
        return { select() { return this; }, eq() { return this; }, order() { return this; }, limit: async () => ({ data: [], error: null }) };
      }
      if (table === "staged_updates") {
        return {
          insert: async (row) => {
            calls.stagedUpdates.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`fakeSvc: unexpected table ${table}`);
    },
  };
}

test("runReconcilePass: no-op when nothing pending", async () => {
  const svc = fakeSvc({ pendingRows: [] });
  const r = await runReconcilePass(svc);
  assert.deepEqual(r, { processed: 0, changesRecorded: 0, staged: 0, pending: 0, errors: [] });
});

test("runReconcilePass: claims a row, logs intelligence_changes per item, bridges to staged_updates, marks reconciled", async () => {
  const svc = fakeSvc({
    pendingRows: [{ id: "q-1", source_id: "src-1", checked_at: "2026-09-01T00:00:00Z" }],
    itemsBySource: { "src-1": [{ id: "item-a", source_url: "https://x.example/reg" }, { id: "item-b", source_url: "https://x.example/reg" }] },
  });
  const r = await runReconcilePass(svc);
  assert.equal(r.processed, 1);
  assert.equal(r.changesRecorded, 2, "one intelligence_changes row per live item");
  assert.equal(r.staged, 2, "one staged_updates row per live item via the bridge");
  assert.equal(r.pending, 1);
  assert.equal(r.errors.length, 0);
  assert.equal(svc.calls.monitoringQueueUpdates.length, 1);
  assert.equal(svc.calls.monitoringQueueUpdates[0].id, "q-1");
  assert.ok(svc.calls.monitoringQueueUpdates[0].patch.reconciled_at, "reconciled_at stamped");
  assert.equal(svc.calls.intelligenceChanges.length, 2);
  assert.equal(svc.calls.stagedUpdates.length, 2);
  for (const row of svc.calls.stagedUpdates) {
    assert.equal(row.update_type, "update_item");
    assert.deepEqual(row.proposed_changes, {});
  }
});

test("runReconcilePass: a source with zero live items still gets reconciled (no bridge call, no error)", async () => {
  const svc = fakeSvc({
    pendingRows: [{ id: "q-2", source_id: "src-empty", checked_at: "2026-09-01T00:00:00Z" }],
    itemsBySource: {},
  });
  const r = await runReconcilePass(svc);
  assert.equal(r.processed, 1);
  assert.equal(r.changesRecorded, 0);
  assert.equal(r.staged, 0);
  assert.equal(r.errors.length, 0);
});
