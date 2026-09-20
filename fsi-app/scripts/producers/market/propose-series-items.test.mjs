// Proof for scripts/producers/market/propose-series-items.mjs (lane PROD-FIX Part B requirement 3, moved
// out of src/lib/market on 2026-09-02 — see that module's header). Run: node --test scripts/producers/market/propose-series-items.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync as readFileSyncFs, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProposedItemPayloads } from "./propose-series-items.mjs";
import { SERIES_ITEM_MAP, deriveDisplayRows } from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { validateMintPayload } from "../../mint/validate-mint-payload.mjs";
// F27 producer-seam-proof (lane M9d, 2026-09-20): refresh-published-price-statistics.mjs (the scripts/
// producers/market/ CLI, distinct from the src/lib/market/ module of the same name imported above) now
// composes THREE first-party seams: propose-series-items.mjs, the src/lib module, and
// producer-summary.mjs. This file already proves the first two together (SERIES_ITEM_MAP above); adding
// this import, and the composition test below, is what makes it the single proof for the CLI's whole
// seam set, rather than a fourth near-duplicate proof file.
import { writeProducerSummary } from "../lib/producer-summary.mjs";

// ── buildProposedItemPayloads: Part B requirement 3 — the 6 R-D mint payloads, schema- and validator-clean ──

const SAMPLE_CAPTURED_TEXT = `Weekly Oil Bulletin

Information and maps showing weekly updates on prices of petroleum products in all EU countries, including
Euro-Super 95, Automotive gas oil / diesel, Heating gas oil, LPG motor fuel, Residual fuel oil and Heavy fuel oil.`;

test("buildProposedItemPayloads requires non-empty capturedText — never drafts a payload with no captured source", () => {
  assert.throws(() => buildProposedItemPayloads({ capturedText: "" }), /capturedText/);
  assert.throws(() => buildProposedItemPayloads({}), /capturedText/);
});

test("buildProposedItemPayloads builds exactly one payload per SERIES_ITEM_MAP entry carrying proposed_item — 6 for the real map", () => {
  const payloads = buildProposedItemPayloads({ capturedText: SAMPLE_CAPTURED_TEXT });
  assert.equal(payloads.length, 6);
  assert.deepEqual(
    payloads.map((p) => p._series_key).sort(),
    SERIES_ITEM_MAP.map(([key]) => key).sort(),
  );
});

test("every proposed payload carries the WSEQ-forward screen field (verdict/provenance/basis) so it validates under both the current and the screen-required validator", () => {
  const payloads = buildProposedItemPayloads({ capturedText: SAMPLE_CAPTURED_TEXT });
  for (const p of payloads) {
    assert.deepEqual(p.screen, { verdict: "on_vertical", provenance: "reviewed", basis: "R-D ruling" });
  }
});

test("every proposed payload's source.id is the honest PENDING-LIVE-SOURCES-LOOKUP placeholder, never a fabricated sources row", () => {
  const payloads = buildProposedItemPayloads({ capturedText: SAMPLE_CAPTURED_TEXT });
  for (const p of payloads) {
    assert.equal(p.source.id, "PENDING-LIVE-SOURCES-LOOKUP");
    assert.match(p._proof_note, /PROPOSAL DRAFT for ruling R-D/);
    assert.match(p._proof_note, /do not apply this payload to the database as printed/i);
  }
});

test("every proposed payload validates clean against validate-mint-payload.mjs (the same gate a real mint payload must clear)", () => {
  const payloads = buildProposedItemPayloads({ capturedText: SAMPLE_CAPTURED_TEXT });
  for (const p of payloads) {
    const result = validateMintPayload(p);
    assert.equal(result.valid, true, `${p._series_key} failed validation: ${JSON.stringify(result.failures)}`);
    assert.deepEqual(result.failures, []);
  }
});

test("buildProposedItemPayloads over a map with no proposed_item entries drafts nothing (never invents an identity triple)", () => {
  const noProposals = Object.freeze([
    ["some:series", { item_id: null, status: "pending_R-D" }],
  ]);
  const payloads = buildProposedItemPayloads({ map: noProposals, capturedText: SAMPLE_CAPTURED_TEXT });
  assert.deepEqual(payloads, []);
});

// ── the THIRD seam: refresh-published-price-statistics.mjs's own real completion step ──────────────────
// deriveDisplayRows (the src/lib seam this file already proves against SERIES_ITEM_MAP) produces the same
// shape the CLI's own `main()` feeds into `created`/`updated` counting; this proves that count, exactly as
// computed there, is consumable by writeProducerSummary (lane M9d, F45/F27) without a shape mismatch.
test("the producers-family seam: deriveDisplayRows' own row count composes with writeProducerSummary, no-op without PRODUCER_SUMMARY_DIR", () => {
  const marketSeriesRows = [{
    series_key: SERIES_ITEM_MAP[0][0],
    reference_period: "2026-08-17",
    label: "test row",
    value_numeric: 100,
    unit: "EUR/1000L",
    currency: "EUR",
    as_at_date: "2026-08-17",
  }];
  const displayRows = deriveDisplayRows(marketSeriesRows, { map: SERIES_ITEM_MAP });
  assert.ok(displayRows.length > 0, "the ratified map must derive at least one display row from a real market_series row");

  const prior = process.env.PRODUCER_SUMMARY_DIR;
  delete process.env.PRODUCER_SUMMARY_DIR;
  try {
    const noop = writeProducerSummary({
      producer: "refresh-published-price-statistics", status: "ok",
      rows_changed: displayRows.length, edges_authored: null,
      counts: { created: displayRows.length, updated: 0 },
    });
    assert.equal(noop, null, "no PRODUCER_SUMMARY_DIR set, must be a true no-op, matching a local dev run");
  } finally {
    if (prior !== undefined) process.env.PRODUCER_SUMMARY_DIR = prior;
  }

  const dir = mkdtempSync(join(tmpdir(), "propose-series-items-seam-test-"));
  process.env.PRODUCER_SUMMARY_DIR = dir;
  try {
    const outPath = writeProducerSummary({
      producer: "refresh-published-price-statistics", status: "ok",
      rows_changed: displayRows.length, edges_authored: null,
      counts: { created: displayRows.length, updated: 0 },
    });
    const summary = JSON.parse(readFileSyncFs(outPath, "utf8"));
    assert.equal(summary.rows_changed, displayRows.length);
    assert.equal(summary.edges_authored, null);
  } finally {
    if (prior === undefined) delete process.env.PRODUCER_SUMMARY_DIR;
    else process.env.PRODUCER_SUMMARY_DIR = prior;
    rmSync(dir, { recursive: true, force: true });
  }
});
