// @ts-check
// Tests for verify-item: pure decision tree + CP2 stale-flag + I2 justification + orchestration. No spend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideVerify, writeStaleFlag, logAcquireJustification, verifyItem, STALE_FLAG } from "./verify-item.mjs";

// ── decideVerify (pure) ──
test("decide: no snapshot -> needs_acquire (missing_snapshot)", () => {
  const d = decideVerify({ found: false }, null, null);
  assert.equal(d.outcome, "needs_acquire");
  assert.equal(d.justification, "missing_snapshot");
  assert.equal(d.flip, false);
});

test("decide: snapshot + changed -> stale_flag, never flip (CP2)", () => {
  const d = decideVerify({ found: true }, { status: "changed" }, { pass: true, reason: "stored spans match" });
  assert.equal(d.outcome, "stale_flag");
  assert.equal(d.flag, STALE_FLAG);
  assert.equal(d.flip, false); // even though stored spans matched, changed source never silently passes
  assert.equal(d.justification, "content_changed");
});

test("decide: snapshot + fresh + cheap pass -> verified_cheap (flip)", () => {
  const d = decideVerify({ found: true }, { status: "fresh" }, { pass: true, reason: "all FACT spans present" });
  assert.equal(d.outcome, "verified_cheap");
  assert.equal(d.flip, true);
});

test("decide: snapshot + unknown freshness + cheap pass -> verified_cheap", () => {
  const d = decideVerify({ found: true }, { status: "unknown" }, { pass: true, reason: "ok" });
  assert.equal(d.outcome, "verified_cheap");
});

test("decide: snapshot + fresh + cheap FAIL -> needs_acquire (cheap_verify_failed)", () => {
  const d = decideVerify({ found: true }, { status: "fresh" }, { pass: false, reason: "1 FACT span missing" });
  assert.equal(d.outcome, "needs_acquire");
  assert.equal(d.justification, "cheap_verify_failed");
});

// ── writers (fake svc) ──
function captureInsertClient() {
  const inserts = [];
  return { inserts, from() { return { insert(row) { inserts.push(row); return Promise.resolve({ error: null }); } }; } };
}

test("writeStaleFlag: opens an integrity_flags queue row keyed by the item", async () => {
  const svc = captureInsertClient();
  await writeStaleFlag(svc, { itemId: "item-1", sourceId: "src-1", reason: "source changed" });
  assert.equal(svc.inserts.length, 1);
  assert.equal(svc.inserts[0].created_by, STALE_FLAG);
  assert.equal(svc.inserts[0].subject_ref, "item-1");
  assert.equal(svc.inserts[0].status, "open");
});

test("logAcquireJustification: writes a cost-0 ledger row with justification; rejects unknown reason", async () => {
  const svc = captureInsertClient();
  await logAcquireJustification(svc, { itemId: "item-2", sourceId: "src-2", reason: "missing_snapshot" });
  assert.equal(svc.inserts[0].cost_usd_estimated, 0);
  assert.equal(svc.inserts[0].intelligence_item_id, "item-2");
  assert.equal(svc.inserts[0].source_id, "src-2");
  assert.equal(svc.inserts[0].errors[0].justification, "missing_snapshot");
  await assert.rejects(() => logAcquireJustification(svc, { itemId: "x", sourceId: null, reason: "bogus" }), /invalid acquire justification/);
});

// ── orchestration ──
const baseDeps = {
  loadItem: async () => ({ source_id: "src-1", source_url: "https://eur-lex.europa.eu/x" }),
  loadClaims: async () => [{ claim_kind: "fact", source_span: "2% SAF blend" }],
  getSnapshot: async () => ({ found: true, content: "<p>a 2% SAF blend applies</p>", fetchedAt: "2026-05-15T00:00:00Z" }),
  probeFreshness: async () => ({ status: "fresh" }),
  cheapVerifyClaims: (claims, html) => ({ pass: html.includes("2% SAF blend"), reason: "span check" }),
};

test("verifyItem: act:false returns the decision and moves nothing ($0)", async () => {
  let sideEffects = 0;
  const svc = { from() { sideEffects++; return { insert: () => Promise.resolve({ error: null }) }; } };
  const r = await verifyItem(svc, "item-1", { ...baseDeps });
  assert.equal(r.outcome, "verified_cheap");
  assert.equal(r.acted, false);
  assert.equal(sideEffects, 0);
});

test("verifyItem: no snapshot + act:true + acquire OFF -> justification logged THEN throws (locked)", async () => {
  const svc = captureInsertClient();
  await assert.rejects(
    () => verifyItem(svc, "item-1", { ...baseDeps, getSnapshot: async () => ({ found: false }), act: true, env: {} }),
    /GROUNDING_ACQUIRE_LOCKED/,
  );
  // I2: the justification row was written BEFORE the lock threw
  assert.equal(svc.inserts.length, 1);
  assert.equal(svc.inserts[0].errors[0].justification, "missing_snapshot");
});

test("verifyItem: changed source + act:true -> stale flag written, no throw, no fetch", async () => {
  const svc = captureInsertClient();
  const r = await verifyItem(svc, "item-1", { ...baseDeps, probeFreshness: async () => ({ status: "changed" }), act: true, env: {} });
  assert.equal(r.outcome, "stale_flag");
  assert.equal(r.acted, true);
  assert.equal(svc.inserts[0].created_by, STALE_FLAG);
});
