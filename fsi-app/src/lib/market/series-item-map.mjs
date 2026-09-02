// series-item-map.mjs — the ratified series_key -> published_price_statistics attachment map (WO-16.2).
//
// WHY A .mjs DATA MODULE, NOT JSON (coordinator, 2026-09-02, production incident): the first version of
// this map was series-item-map.mjs read with readFileSync at module evaluation from
// refresh-published-price-statistics.mjs, which src/lib/market/series-board-view-model.mjs imports, which
// src/lib/data.ts imports, which every page imports. The same module also read
// scripts/mint/item-type-required-slots.json the same way. Vercel's serverless bundle traces imports,
// not runtime file reads outside the app graph, so the first request after PR #533 deployed threw
// ENOENT at module evaluation and carosledge.com answered 500 on every route. A data module is part of
// the import graph: bundled, no fs, works identically under node --test and in the app. Rule going
// forward, now encoded in .discipline: nothing under src/lib may read the filesystem at module evaluation.
//
// Ratified series_key -> published_price_statistics attachment map (WO-16.2 mechanism; the ATTACHMENT
// ITSELF is ruling R-D, 'attach the six oil-bulletin series to published_price_statistics via new
// record items', unratified as of 2026-09-02 — see refresh-published-price-statistics.mjs's own header
// for why an unratified attachment is never guessed).
// 
// Lane PROD-FIX built the MECHANISM, not the ruling: every key below is one of the six series
// eu-weekly-oil-bulletin.mjs's PRODUCTS vocabulary emits (src/lib/market/parsers/
// eu-weekly-oil-bulletin.mjs), each with item_id: null and status: 'pending_R-D' — deriveDisplayRows()
// in refresh-published-price-statistics.mjs treats item_id === null as UNRATIFIED and skips it exactly
// as it skipped a key absent from the map entirely before this file existed; the refresher still plans
// and writes ZERO rows today. `proposed_item` is the record-grade mint payload's identity triple
// (title/source_url/item_type) that scripts/producers/market/refresh-published-price-statistics.mjs
// --propose-items builds into a full payload via src/lib/intake/record-facts.mjs's buildRecordPayload —
// see that flag's own code for the full payload shape.
// 
// TO RATIFY AN ENTRY (operator action, not a lane's to take): set item_id to the real intelligence_items
// uuid once mint-run applies the record for that series, and status to 'ratified'. Once ratified,
// deriveDisplayRows() will include it on the next refresh run — no code change needed, only this file.
// 
// sort_order in the eventual published_price_statistics row is NOT stored here: it is the entry's
// position in this object (Object.keys() insertion order, index 0-5 below), so re-ordering the six
// products only ever requires re-ordering this file, never a code change.
export const SERIES_ITEM_MAP_RAW = Object.freeze({
  "eu-oil-bulletin:eurosuper-95": {
    "item_id": null,
    "status": "pending_R-D",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Euro-Super 95 (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:automotive-diesel": {
    "item_id": null,
    "status": "pending_R-D",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Automotive gas oil / diesel (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:heating-gas-oil": {
    "item_id": null,
    "status": "pending_R-D",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Heating gas oil (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:lpg-motor-fuel": {
    "item_id": null,
    "status": "pending_R-D",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — LPG motor fuel (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:residual-fuel-oil-1pct": {
    "item_id": null,
    "status": "pending_R-D",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Residual fuel oil 1%S (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:heavy-fuel-oil-3-5pct": {
    "item_id": null,
    "status": "pending_R-D",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Heavy fuel oil 3.5%S (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  }
});
