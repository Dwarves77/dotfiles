// refresh-published-price-statistics.mjs — the WO-16.2 ruling, implemented (option a): FEED
// published_price_statistics from market_series; PriceBoard and its query stay untouched.
//
// VERIFIED, NOT ASSUMED (rule 0.15 read this lane performed): published_price_statistics is read by
// fsi-app/src/app/market/[slug]/page.tsx:149-168 (`.from("published_price_statistics").select("label,
// value_display, unit, context_line, severity_tone, source_tier, released_at, next_release_at,
// next_release_label, sort_order").eq("item_id", r.id).order("sort_order")`) and rendered by
// `PriceBoard` in fsi-app/src/components/pages/MarketSignalDetailSurface.tsx (the `PriceStat` shape,
// same file, line ~79). Neither file changes for this WO — this module produces rows in EXACTLY that
// shape so a refresh is a plain guarded upsert into the existing table, no reader-side change at all.
//
// THE MAPPING WAS DELIBERATELY UNRATIFIED WHEN THIS MODULE WAS BUILT, AND IS NOW RATIFIED (CORRECTED
// 2026-09-05, lane NOTICES/W5.2 — see series-item-map.mjs's own header for the full correction; this
// paragraph is kept, corrected in place per CLAUDE.md rule 14, rather than deleted, since the REASON the
// mapping needed a ruling at all is still true and still worth a future reader's attention).
// published_price_statistics is PER-ITEM (Appendix A, master execution plan v2: "4 rows …
// item_id→intelligence_items … Display-shaped, per-item; not a time series"); its 4 pre-existing live
// rows attach to "Crude Oil & Jet Fuel Price Intelligence" and "LNG & Natural Gas Price Intelligence"
// (US/SG/JP/NL benchmarks — confirmed live 2026-08-30). market_series' one built producer (EU Weekly Oil
// Bulletin) publishes EU refined-PRODUCT prices — a different instrument family, a different geography,
// and at the time this module was built no existing intelligence_items row represented "EU Weekly Oil
// Bulletin" as a market signal. Inventing an item_id here would have misattributed a benchmark to an
// item that is not about it, exactly the class of error CLAUDE.md rule "do not guess or assume" exists
// to prevent — so this module shipped with SERIES_ITEM_MAP entries carrying `item_id: null,
// status: "pending_R-D"` rather than a guess, pending operator ruling R-D.
//
// LANE PROD-FIX (2026-09-02) BUILT THE MECHANISM; RULING R-D RATIFIED THE ATTACHMENT (session log
// Addendum 85 postscript 47: "attach the six oil-bulletin series to published_price_statistics via new
// record items"). SERIES_ITEM_MAP moved from an inline `Object.freeze({})` to a committed data file,
// series-item-map.mjs, one entry per series the EU Weekly Oil Bulletin parser emits (src/lib/market/
// parsers/eu-weekly-oil-bulletin.mjs PRODUCTS) — all six now carry a real intelligence_items uuid and
// `status: "ratified"`. deriveDisplayRows() below still treats a null item_id exactly as it treats a key
// ABSENT from the map — skipped, never a fabricated attachment — which matters again the moment a future
// series is added here ahead of its own ratification, the same posture WO-19's origin_class backfill
// mapping used (an operator-reviewed decision, not a guess baked into code). With all six entries now
// ratified, this module — and the CLI script that calls it
// (scripts/producers/market/refresh-published-price-statistics.mjs) — is ready to produce six display
// rows on its NEXT RUN; landing this code change alone does not write them (see this lane's REPORT for
// the exact producer dispatch that does). See series-item-map.mjs's own header for the ratification
// mechanics and unmappedSeriesKeys() below for how a series with NO entry at all (never even proposed)
// is told apart from one that is proposed but not yet ratified — both are reported by name in the CLI
// script's summary, never silently skipped, per the same rule.
//
// PLAIN ESM. `today` (for next_release_at) is injected, never read from the clock directly, same
// discipline envelope.mjs's own header states ("time is injected, never read"). The one I/O this module
// performs is reading its own committed data file at module load — the same static-registry pattern
// src/lib/connections/derive-tags.mjs already uses for its own committed text assets.

import { producerFor } from "./series-registry.mjs";
import { SERIES_ITEM_MAP_RAW } from "./series-item-map.mjs";

/**
 * Loads series-item-map.mjs into the shape deriveDisplayRows() consumes: an ordered array of
 * [series_key, entry] pairs (array, not a plain object, so ORDER — which fixes sort_order, see below —
 * survives even though standard object key order is not part of the JSON grammar). `_`-prefixed keys
 * (the file's own `_comment`) are documentation, never a series entry, and are dropped here.
 * Exported so a test can load a fixture map through the exact same path the module itself uses.
 */
export function loadSeriesItemMap(raw = SERIES_ITEM_MAP_RAW) {
  const entries = Object.entries(raw).filter(([key]) => !key.startsWith("_"));
  return Object.freeze(entries.map(([key, entry]) => Object.freeze([key, entry])));
}

/**
 * Ratified-or-pending series_key -> published_price_statistics attachment, loaded from
 * series-item-map.mjs (see this file's header). An ORDERED array of [series_key, entry] pairs — entry
 * shape: { item_id: uuid|null, status: string, proposed_item?: {title, source_url, item_type} }.
 * `item_id: null` means PENDING (not yet ratified); deriveDisplayRows() skips those exactly as it would
 * skip a series_key with no entry at all.
 */
export const SERIES_ITEM_MAP = loadSeriesItemMap();

/** True when a series-item-map.mjs entry has been ratified (a real item_id assigned). */
export function isRatified(entry) {
  return entry != null && entry.item_id != null && entry.item_id !== "";
}

const CURRENCY_SYMBOL = Object.freeze({ EUR: "€", USD: "$", GBP: "£" });

/**
 * Split an envelope unit like "EUR/1000L" into a display prefix ("€") and a display suffix ("/1000L"),
 * mirroring published_price_statistics' existing convention (value_display "$73.59", unit "/bbl" — the
 * currency lives IN value_display, not in the unit column; see the 4 live rows read this session).
 * Falls back to the raw unit with no currency symbol if the currency is unrecognised — never guesses one.
 */
export function splitEnvelopeUnit(unit, currency) {
  const symbol = CURRENCY_SYMBOL[currency] ?? null;
  if (!unit) return { symbol, suffix: null };
  const prefix = currency ? `${currency}/` : null;
  const suffix = prefix && unit.startsWith(prefix) ? unit.slice(prefix.length - 1) /* keep the '/' */ : unit;
  return { symbol, suffix };
}

/** Format value_numeric + currency into a value_display string, e.g. (1493.6, "EUR") -> "€1,493.60". */
export function formatValueDisplay(valueNumeric, currency) {
  const symbol = CURRENCY_SYMBOL[currency] ?? "";
  const formatted = Number(valueNumeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

/** Add `days` calendar days to an ISO date string, returning an ISO date string. Pure. */
export function addDaysIso(isoDate, days) {
  if (!isoDate || days == null) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Reduce a set of market_series rows (any mix of series/periods) to the LATEST row per series_key —
 * the one a display cache should show. "Latest" = greatest reference_period (ISO-sortable strings, the
 * format every producer in this lane emits — YYYY-MM-DD from the EU Weekly Oil Bulletin parser).
 */
export function latestPerSeries(marketSeriesRows) {
  const latest = new Map();
  for (const r of marketSeriesRows ?? []) {
    const prev = latest.get(r.series_key);
    if (!prev || String(r.reference_period) > String(prev.reference_period)) latest.set(r.series_key, r);
  }
  return latest;
}

/**
 * Derive published_price_statistics-shaped rows from the latest market_series observation per RATIFIED
 * series. A series_key ABSENT from `map`, or present but not yet ratified (`item_id: null`, the state
 * every series-item-map.mjs entry is in as of 2026-09-02 pending R-D), is skipped here — never guessed.
 * With every entry still pending this returns [] until an operator ratifies one (see this file's header).
 * Use unmappedSeriesKeys() alongside this to report what got skipped, by name — this function only
 * produces rows, it never reports gaps.
 *
 * @param {Array<object>} marketSeriesRows — any market_series rows (e.g. all rows for one producer's
 *   namespace); only the latest per series_key is used.
 * @param {{ map?: Array<[string, {item_id:string|null, status:string, context_line?:string,
 *   severity_tone?:string}]> }} [opts] — an ORDERED array of [series_key, entry] pairs (SERIES_ITEM_MAP's
 *   own shape); array position fixes sort_order, so entry order in series-item-map.mjs IS display order.
 * @returns {Array<{item_id, label, value_display, unit, context_line, severity_tone, source_tier,
 *   released_at, next_release_at, next_release_label, sort_order}>}
 */
export function deriveDisplayRows(marketSeriesRows, { map = SERIES_ITEM_MAP } = {}) {
  const latest = latestPerSeries(marketSeriesRows);
  const out = [];
  map.forEach(([seriesKey, entry], index) => {
    if (!isRatified(entry)) return; // pending R-D (or any future unratified entry) — never a guessed attachment
    const row = latest.get(seriesKey);
    if (!row) return; // ratified but no observation yet — nothing to display, never a fabricated dash-row
    const { suffix } = splitEnvelopeUnit(row.unit, row.currency);
    const producer = producerFor(seriesKey.split(":")[0]);
    const nextReleaseAt = producer?.cadenceDays != null ? addDaysIso(row.reference_period, producer.cadenceDays) : null;
    out.push({
      item_id: entry.item_id,
      label: row.label,
      value_display: formatValueDisplay(row.value_numeric, row.currency),
      unit: suffix,
      context_line: entry.context_line ?? null,
      severity_tone: entry.severity_tone ?? null,
      // NOT derived from origin_class: source_tier is the `sources` trust-tier scale (T1-T7), a
      // DIFFERENT vocabulary from origin_class (spec 00 §3.6) — see provenance-envelope.mjs's own header
      // on why the two FK targets answer different questions. Inventing a cross-vocabulary mapping here
      // would be exactly the guessing this lane's rules forbid; left NULL until that mapping is designed.
      source_tier: null,
      released_at: row.as_at_date,
      next_release_at: nextReleaseAt,
      next_release_label: null,
      // Position in `map`, not a stored field — series-item-map.mjs's own header explains why: reordering
      // the six products is then a data-file edit, never a code change.
      sort_order: index,
    });
  });
  return out.sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Every series_key present in `marketSeriesRows` that is NOT a ratified attachment — either because it
 * has no series-item-map.mjs entry at all, or because its entry is still pending (`item_id: null`).
 * Deduplicated, sorted for a stable summary line. Exists so a caller (the CLI script) can report a gap by
 * NAME rather than silently produce fewer rows than observations read — "never silently skips" (Part B
 * requirement 2). Pure: takes the map as data, reads no file itself.
 */
export function unmappedSeriesKeys(marketSeriesRows, map = SERIES_ITEM_MAP) {
  const ratified = new Set(map.filter(([, entry]) => isRatified(entry)).map(([key]) => key));
  const seen = new Set();
  for (const r of marketSeriesRows ?? []) {
    if (r?.series_key && !ratified.has(r.series_key)) seen.add(r.series_key);
  }
  return [...seen].sort();
}

