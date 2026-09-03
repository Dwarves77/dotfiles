// Proof for scripts/producers/market/build-oil-bulletin-rows.mjs (Lane RD, ruling R-D, 2026-09-03).
// Run: node --test scripts/producers/market/build-oil-bulletin-rows.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOilBulletinCensusRows } from "./build-oil-bulletin-rows.mjs";
import { SERIES_ITEM_MAP } from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { CAPTURED_BULLETIN_PAGE_TEXT } from "./refresh-published-price-statistics.mjs";
import { buildPayloadsFromCensusRows, loadCensusRows } from "../../mint/run-mint-batch.mjs";
import { censusRowIdSet, resolveCensusRowId } from "../../mint/apply-mint-batch.mjs";
import { validateMintPayload } from "../../mint/validate-mint-payload.mjs";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REQUIRED_SLOTS = JSON.parse(readFileSync(resolve(HERE, "../../mint/item-type-required-slots.json"), "utf8"));

test("buildOilBulletinCensusRows requires non-empty capturedText", () => {
  assert.throws(() => buildOilBulletinCensusRows({ capturedText: "" }), /capturedText/);
});

test("builds exactly one row per SERIES_ITEM_MAP entry carrying proposed_item — 6 for the real map", () => {
  const rows = buildOilBulletinCensusRows();
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((r) => r.instrument_identifier).sort(),
    SERIES_ITEM_MAP.map(([key]) => key).sort(),
  );
});

test("uses the imported CAPTURED_BULLETIN_PAGE_TEXT by default, never a copy", () => {
  const rows = buildOilBulletinCensusRows();
  for (const r of rows) assert.equal(r.captured_text, CAPTURED_BULLETIN_PAGE_TEXT);
});

test("every row: item_type market_signal, jurisdiction_iso EU, canonical_instrument_key null, no row_id", () => {
  const rows = buildOilBulletinCensusRows();
  for (const r of rows) {
    assert.equal(r.item_type, "market_signal");
    assert.equal(r.jurisdiction_iso, "EU");
    assert.equal(r.canonical_instrument_key, null);
    assert.equal("row_id" in r, false);
  }
});

test("every row carries the on_vertical/reviewed/R-D-ruling screen triple (MINT-RUNBOOK.md §12)", () => {
  const rows = buildOilBulletinCensusRows();
  for (const r of rows) {
    assert.deepEqual(r.screen, { verdict: "on_vertical", provenance: "reviewed", basis: "R-D ruling" });
  }
});

test("every row's instrument_identifier is distinct — no two rows collide on payload id", () => {
  const rows = buildOilBulletinCensusRows();
  const ids = rows.map((r) => r.instrument_identifier);
  assert.equal(new Set(ids).size, ids.length);
});

test("fetched_length defaults to the captured text's own length, honestly (no fabricated figure)", () => {
  const rows = buildOilBulletinCensusRows();
  for (const r of rows) assert.equal(r.fetched_length, r.captured_text.length);
});

// ── end-to-end through the SAME harness this batch is dispatched through ───────────────────────────────

test("every row builds into a payload that validates clean against validate-mint-payload.mjs, via run-mint-batch.mjs's own --census-rows builder", () => {
  const rows = buildOilBulletinCensusRows();
  const { payloads, buildFailures } = buildPayloadsFromCensusRows(rows, {
    baseDir: HERE,
    requiredSlotsByType: REQUIRED_SLOTS,
  });
  assert.deepEqual(buildFailures, []);
  assert.equal(payloads.length, 6);
  for (const p of payloads) {
    const result = validateMintPayload(p, { baseDir: HERE });
    assert.equal(result.valid, true, `${p.id} failed validation: ${JSON.stringify(result.failures)}`);
  }
});

test("apply-mint-batch.mjs's resolveCensusRowId never matches these rows — row_id was never set, so census_worklist is never touched for this batch", () => {
  const rows = buildOilBulletinCensusRows();
  const rowIdSet = censusRowIdSet(rows);
  assert.equal(rowIdSet.size, 0);
  const { payloads } = buildPayloadsFromCensusRows(rows, { baseDir: HERE, requiredSlotsByType: REQUIRED_SLOTS });
  for (const p of payloads) {
    assert.equal(resolveCensusRowId(p, rowIdSet), null);
  }
});

test("loadCensusRows round-trips a bare-array file the way this script's --out writes it", () => {
  const rows = buildOilBulletinCensusRows();
  const tmp = resolve(HERE, "._tmp-oil-bulletin-rows.test.json");
  writeFileSync(tmp, JSON.stringify(rows, null, 2) + "\n", "utf8");
  try {
    const loaded = loadCensusRows(tmp);
    assert.equal(loaded.length, 6);
    assert.deepEqual(loaded, rows);
  } finally {
    unlinkSync(tmp);
  }
});
