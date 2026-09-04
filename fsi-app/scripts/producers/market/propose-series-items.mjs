// propose-series-items.mjs — the six R-D record-grade mint payload drafts (lane PROD-FIX's mechanism),
// on the SCRIPTS side. Moved out of src/lib/market/refresh-published-price-statistics.mjs by the
// coordinator on 2026-09-02: it reads scripts/mint/item-type-required-slots.json from the filesystem at
// module evaluation and pulls record-facts.mjs, and the src module that first carried it is on every
// page's import graph (series-board-view-model.mjs -> data.ts), so the first request after PR #533
// deployed threw ENOENT and carosledge.com answered 500 on every route. Scripts are never bundled;
// src/lib must never read the filesystem at module evaluation. Pure apart from that one JSON read;
// no DB, no fetch. Consumed by refresh-published-price-statistics.mjs --propose-items and its tests.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import buildRecordPayload from "../../../src/lib/intake/record-facts.mjs";
import { SERIES_ITEM_MAP } from "../../../src/lib/market/refresh-published-price-statistics.mjs";

const REQUIRED_SLOTS = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../mint/item-type-required-slots.json"), "utf8"),
);

// The screen field lane WSEQ (concurrent lane, same finish plan) is adding as a REQUIRED field on
// validate-mint-payload.mjs. Stamped on every proposed payload so it validates under BOTH the version of
// the validator this lane read (screen unchecked, additionalProperties:true so an extra field is inert)
// and WSEQ's extended version (screen required) — whichever lands first. "on_vertical"/"reviewed" reflect
// that this lane, a human-directed session, judged the six oil-bulletin products to be in-vertical
// (freight fuel cost intelligence) before proposing them; "R-D ruling" names the ruling this attachment
// still needs before any of these payloads may actually be minted.
const PROPOSED_ITEM_SCREEN = Object.freeze({ verdict: "on_vertical", provenance: "reviewed", basis: "R-D ruling" });

/**
 * Build the record-grade mint payloads (payload-schema.json shape) the coordinator would apply for R-D —
 * one per series-item-map.json entry that carries a `proposed_item`, via record-facts.mjs's
 * buildRecordPayload, the SAME builder the record-grade population pipeline already uses (no duplicate
 * payload-assembly logic). DRY / PRINT ONLY: never mints, writes, or touches a database.
 * `--propose-items` (the CLI script) is its only caller today.
 *
 * `source` IS A PLACEHOLDER, clearly marked, not a fabricated fact: `sources` (the mint pipeline's
 * citation registry, base_tier/institution_id) is a DIFFERENT table from `data_sources` (migration 258's
 * emission-factor licence register, which DOES already carry a verified 'ec_weekly_oil_bulletin' row —
 * see series-registry.mjs). This lane has no DB access to look up the real `sources` row MINT-RUNBOOK.md
 * step 2 requires before authoring a payload for real, so every payload's `source.id` reads
 * "PENDING-LIVE-SOURCES-LOOKUP" and its `_proof_note` says so in full — a coordinator must resolve the
 * real row before minting any of these, never apply one as printed.
 *
 * `capturedText`/`fetchedLength` are caller-supplied (record-facts.mjs's own no-I/O, no-fetch contract —
 * see that file's header); this function performs no fetch itself.
 */
export function buildProposedItemPayloads({
  map = SERIES_ITEM_MAP,
  capturedText,
  fetchedLength,
} = {}) {
  if (typeof capturedText !== "string" || capturedText.trim() === "") {
    throw new Error("buildProposedItemPayloads requires capturedText (the captured Weekly Oil Bulletin page text)");
  }
  const requiredSlots = REQUIRED_SLOTS.market_signal || [];
  return map
    .filter(([, entry]) => entry?.proposed_item)
    .map(([seriesKey, entry]) => {
      const proposed = entry.proposed_item;
      const placeholderSource = {
        id: "PENDING-LIVE-SOURCES-LOOKUP",
        url: proposed.source_url,
        status: "active",
        base_tier: 1, // provisional: an official European Commission publication, same posture every
        // other registered-official EU source in this repo carries — NOT read from a live `sources` row.
        tier_override: null,
      };
      const payload = buildRecordPayload({
        sourceUrl: proposed.source_url,
        itemType: proposed.item_type,
        title: proposed.title,
        // The series key IS the item's identifier, exactly as build-oil-bulletin-rows.mjs sets it for the
        // R-D batch: one identity for the series item on both paths, and the kit's series-backed
        // record_hollow exemption (validate-mint-payload.mjs) keys on it via the series registry.
        instrumentIdentifier: seriesKey,
        jurisdictionIso: "EU",
        source: placeholderSource,
        capturedText,
        fetchedLength,
        requiredSlots,
      });
      payload._proof_note +=
        " PROPOSAL DRAFT for ruling R-D (unratified as of series-item-map.json's current state): " +
        `source.id is a PLACEHOLDER ("PENDING-LIVE-SOURCES-LOOKUP") pending the coordinator's own live ` +
        `\`sources\` lookup for ${proposed.source_url} (MINT-RUNBOOK.md step 2) — this lane has no DB ` +
        "access to resolve the real row. Do not apply this payload to the database as printed.";
      payload.screen = PROPOSED_ITEM_SCREEN;
      payload._series_key = seriesKey;
      return payload;
    });
}

