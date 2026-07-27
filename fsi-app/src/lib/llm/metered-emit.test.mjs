// @ts-check
// C2 (MASTER DISPATCH): openMeteredBatch asserts the metered gate AND emits the batch marker before spend.
// Goldens: (a) gate refusal throws and writes NOTHING; (b) an authorized call writes one correctly-shaped
// batch marker and returns its window; (c) a marker-write failure throws (batch not authorized to run unmarked).
import { test } from "node:test";
import assert from "node:assert/strict";
import { openMeteredBatch } from "./metered-emit.mjs";

// A fake supabase client capturing inserts. insert(...).select(...).single() -> { data:{id}, error }.
function fakeSb({ failInsert = false } = {}) {
  const inserts = [];
  return {
    inserts,
    from() {
      return {
        insert(row) { inserts.push(row); return this; },
        select() { return this; },
        single() { return Promise.resolve(failInsert ? { data: null, error: { message: "boom" } } : { data: { id: "marker-1" }, error: null }); },
      };
    },
  };
}

const OK_ENV = { METERED_BATCH_TOKEN: "op-token-xyz" };

test("(a) gate refusal (no token) throws AND writes no marker", async () => {
  const sb = fakeSb();
  await assert.rejects(
    () => openMeteredBatch(sb, { callClass: "batch-classification", model: "claude-haiku-4-5-20251001", capUsd: 15, task: "census", env: {} }),
    /METERED_CALL_FORBIDDEN/
  );
  assert.equal(sb.inserts.length, 0); // nothing written when the gate refuses
});

test("(b) authorized Haiku batch: writes ONE batch marker with the right shape + returns the window", async () => {
  const sb = fakeSb();
  const r = await openMeteredBatch(sb, {
    callClass: "batch-classification", model: "claude-haiku-4-5-20251001", capUsd: 15, task: "census",
    env: OK_ENV, nowIso: "2026-08-01T15:00:00.000Z", windowMs: 3 * 60 * 60 * 1000,
  });
  assert.equal(sb.inserts.length, 1);
  const m = sb.inserts[0];
  assert.equal(m.fetch_method, "batch-marker");
  assert.equal(m.cost_usd_estimated, 0);
  assert.equal(m.status, "skipped");
  const bm = m.errors[0].batchMarker;
  assert.equal(bm.task, "census");
  assert.equal(bm.model, "claude-haiku-4-5-20251001");
  assert.equal(bm.windowStart, "2026-08-01T15:00:00.000Z");
  assert.equal(bm.windowEnd, "2026-08-01T18:00:00.000Z"); // +3h
  assert.equal(r.markerId, "marker-1");
  assert.equal(r.allowed, true);
});

test("(c) marker-write failure throws — batch not authorized to run unmarked", async () => {
  const sb = fakeSb({ failInsert: true });
  await assert.rejects(
    () => openMeteredBatch(sb, { callClass: "batch-classification", model: "claude-haiku-4-5-20251001", capUsd: 15, task: "census", env: OK_ENV }),
    /marker write failed/
  );
});

test("(d) off-allowlist model without a scoped amendment refuses (no marker)", async () => {
  const sb = fakeSb();
  await assert.rejects(
    () => openMeteredBatch(sb, { callClass: "batch-classification", model: "claude-sonnet-4-6", capUsd: 15, task: "unscoped-task", env: OK_ENV }),
    /off the metered allowlist/
  );
  assert.equal(sb.inserts.length, 0);
});
