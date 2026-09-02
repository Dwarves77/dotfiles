// Proof for scripts/producers/market/propose-series-items.mjs (lane PROD-FIX Part B requirement 3, moved
// out of src/lib/market on 2026-09-02 — see that module's header). Run: node --test scripts/producers/market/propose-series-items.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProposedItemPayloads } from "./propose-series-items.mjs";
import { SERIES_ITEM_MAP } from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { validateMintPayload } from "../../mint/validate-mint-payload.mjs";

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
