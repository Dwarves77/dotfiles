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
// ITSELF was ruling R-D, 'attach the six oil-bulletin series to published_price_statistics via new
// record items' — RATIFIED, session log Addendum 85 postscript 47. All six entries below carry a real
// intelligence_items uuid and status: 'ratified' (CORRECTED 2026-09-05, lane NOTICES/W5.2 — this
// paragraph and refresh-published-price-statistics.mjs's own header previously described the
// pre-ratification 'pending_R-D'/item_id:null state, which no longer matches this file's own six
// entries below; CLAUDE.md rule 14, corrected in place rather than left to mislead the next reader).
// deriveDisplayRows() in refresh-published-price-statistics.mjs now includes all six series on a run of
// the refresh producer (scripts/producers/market/refresh-published-price-statistics.mjs) — see that
// module's own header for the dispatch this lane names to actually RUN it (the ratification alone does
// not populate published_price_statistics; a producer dispatch/apply still has to execute the upsert).
//
// Lane PROD-FIX built the MECHANISM the ratification above now uses: every key below is one of the six
// series eu-weekly-oil-bulletin.mjs's PRODUCTS vocabulary emits (src/lib/market/parsers/
// eu-weekly-oil-bulletin.mjs). `proposed_item` is the record-grade mint payload's identity triple
// (title/source_url/item_type) that scripts/producers/market/refresh-published-price-statistics.mjs
// --propose-items builds into a full payload via src/lib/intake/record-facts.mjs's buildRecordPayload —
// kept here as the historical record of what was proposed and later minted/ratified into each item_id,
// not consulted by deriveDisplayRows() once an entry is ratified.
//
// A FUTURE UNRATIFIED ENTRY (this map growing a 7th series before its item is ratified) still works the
// same way this file's own mechanism always supported: item_id: null and status: 'pending_R-D' —
// deriveDisplayRows() treats item_id === null as UNRATIFIED and skips it exactly as it skips a key
// absent from the map entirely. TO RATIFY: set item_id to the real intelligence_items uuid once mint-run
// applies the record for that series, and status to 'ratified' — no code change needed, only this file.
// 
// sort_order in the eventual published_price_statistics row is NOT stored here: it is the entry's
// position in this object (Object.keys() insertion order, index 0-5 below), so re-ordering the six
// products only ever requires re-ordering this file, never a code change.
export const SERIES_ITEM_MAP_RAW = Object.freeze(
{
  "eu-oil-bulletin:eurosuper-95": {
    "item_id": "4fae403a-ced5-4c8f-82b7-af0fd6127061",
    "status": "ratified",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Euro-Super 95 (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:automotive-diesel": {
    "item_id": "70869a22-39eb-4eb7-ba49-d3826b5b2265",
    "status": "ratified",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Automotive gas oil / diesel (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:heating-gas-oil": {
    "item_id": "32783a47-0073-4cff-a2ae-369508bcdfe9",
    "status": "ratified",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Heating gas oil (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:lpg-motor-fuel": {
    "item_id": "2d306cc6-084d-44d0-ae88-bb391767f787",
    "status": "ratified",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — LPG motor fuel (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:residual-fuel-oil-1pct": {
    "item_id": "0ee667cc-a403-4fe3-b5f8-4f829a4a9103",
    "status": "ratified",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Residual fuel oil 1%S (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  },
  "eu-oil-bulletin:heavy-fuel-oil-3-5pct": {
    "item_id": "180b8163-6ae5-4f35-98dd-02e46c06b561",
    "status": "ratified",
    "proposed_item": {
      "title": "EU Weekly Oil Bulletin — Heavy fuel oil 3.5%S (EU average, before taxes)",
      "source_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
      "item_type": "market_signal"
    }
  }
}
);
