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
// THE MAPPING IS DELIBERATELY EMPTY TODAY. published_price_statistics is PER-ITEM (Appendix A, master
// execution plan v2: "4 rows … item_id→intelligence_items … Display-shaped, per-item; not a time
// series"); its 4 live rows attach to "Crude Oil & Jet Fuel Price Intelligence" and "LNG & Natural Gas
// Price Intelligence" (US/SG/JP/NL benchmarks — confirmed live 2026-08-30). market_series' one built
// producer (EU Weekly Oil Bulletin) publishes EU refined-PRODUCT prices — a different instrument family,
// a different geography, and no existing intelligence_items row represents "EU Weekly Oil Bulletin" as a
// market signal. Inventing an item_id here would misattribute a benchmark to an item that is not about
// it, exactly the class of error CLAUDE.md rule "do not guess or assume" exists to prevent. SERIES_ITEM_MAP
// therefore starts EMPTY, ratified entries added the same way WO-19's origin_class backfill mapping was
// ratified before it ran (an operator-reviewed mapping decision, not a guess baked into code). With an
// empty map this module — and the CLI script that calls it
// (scripts/producers/market/refresh-published-price-statistics.mjs) — correctly produces ZERO rows: a
// safe, honest default, never a fabricated attachment.
//
// PLAIN ESM, ZERO DEPENDENCIES. Pure — `today` (for next_release_at) is injected, never read from the
// clock directly, same discipline envelope.mjs's own header states ("time is injected, never read").

import { producerFor } from "./series-registry.mjs";

/**
 * Ratified series_key -> published_price_statistics attachment. EMPTY TODAY — see this file's header.
 * Shape per entry: { itemId: uuid, sortOrder: number, contextLine?: string, severityTone?: string }.
 */
export const SERIES_ITEM_MAP = Object.freeze({});

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
 * Derive published_price_statistics-shaped rows from the latest market_series observation per mapped
 * series. Rows for a series_key ABSENT from `map` are skipped (never guessed) — with the default empty
 * SERIES_ITEM_MAP this returns [] until an operator ratifies a mapping entry.
 *
 * @param {Array<object>} marketSeriesRows — any market_series rows (e.g. all rows for one producer's
 *   namespace); only the latest per series_key is used.
 * @param {{ map?: Record<string, {itemId:string, sortOrder:number, contextLine?:string, severityTone?:string}> }} [opts]
 * @returns {Array<{item_id, label, value_display, unit, context_line, severity_tone, source_tier,
 *   released_at, next_release_at, next_release_label, sort_order}>}
 */
export function deriveDisplayRows(marketSeriesRows, { map = SERIES_ITEM_MAP } = {}) {
  const latest = latestPerSeries(marketSeriesRows);
  const out = [];
  for (const [seriesKey, mapping] of Object.entries(map)) {
    const row = latest.get(seriesKey);
    if (!row) continue; // mapped but no observation yet — nothing to display, never a fabricated dash-row
    const { suffix } = splitEnvelopeUnit(row.unit, row.currency);
    const producer = producerFor(seriesKey.split(":")[0]);
    const nextReleaseAt = producer?.cadenceDays != null ? addDaysIso(row.reference_period, producer.cadenceDays) : null;
    out.push({
      item_id: mapping.itemId,
      label: row.label,
      value_display: formatValueDisplay(row.value_numeric, row.currency),
      unit: suffix,
      context_line: mapping.contextLine ?? null,
      severity_tone: mapping.severityTone ?? null,
      // NOT derived from origin_class: source_tier is the `sources` trust-tier scale (T1-T7), a
      // DIFFERENT vocabulary from origin_class (spec 00 §3.6) — see provenance-envelope.mjs's own header
      // on why the two FK targets answer different questions. Inventing a cross-vocabulary mapping here
      // would be exactly the guessing this lane's rules forbid; left NULL until that mapping is designed.
      source_tier: null,
      released_at: row.as_at_date,
      next_release_at: nextReleaseAt,
      next_release_label: null,
      sort_order: mapping.sortOrder,
    });
  }
  return out.sort((a, b) => a.sort_order - b.sort_order);
}
