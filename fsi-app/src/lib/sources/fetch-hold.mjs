// @ts-check
// TRANSPORT UNIT (standing dispatch item 6, 2026-07-06) — the fetch-primitive HOLD GATE + canonical-URL
// pre-fetch cache + per-run fetch telemetry. Pure .mjs (no node_modules) so it imports into BOTH the TS routes
// and the .mjs runners, and is red-then-green node-testable. The single canonical fetch (canonical-fetch.mjs)
// calls assertFetchAllowed() at its top, so EVERY fetch is gated by the hold — the mechanical form of the
// "scrape hold LIVE, zero fetches" constraint (previously enforced only by deleting BROWSERLESS_API_KEY, which
// fails SILENTLY as a "key not configured" error rather than an explicit, telemetered hold).
//
// THE HOLD gates Jason's cadence ruling: while engaged, no fetch runs (seek-more is blocked); when Jason sets
// the scrape cadence he LIFTS the hold (SCRAPE_HOLD=off) and new site content / seek-more resumes. Default is
// LIFTED so wiring the gate into the primitive does not change current prod fetch behavior — the hold is an
// EXPLICIT operator control, engaged with SCRAPE_HOLD∈{1,on,true,engaged}. (The paid build runners ALSO delete
// BROWSERLESS_API_KEY as belt-and-suspenders; the hold gate is the first-class, observable mechanism.)

import { canonicalizeCitationUrl } from "../agent/url-canon.mjs";

export class FetchHoldError extends Error {
  /** @param {string} url */
  constructor(url) {
    super(`FETCH_HOLD_ENGAGED: the scrape hold is engaged (SCRAPE_HOLD) — refusing to fetch ${url}. Lift the hold (set SCRAPE_HOLD=off) only when the scrape cadence is set.`);
    this.name = "FetchHoldError";
    this.url = url;
  }
}

const ENGAGED = new Set(["1", "on", "true", "engaged", "yes"]);
const LIFTED = new Set(["0", "off", "false", "lifted", "no", ""]);

/** Is the scrape hold engaged? Explicit env control (SCRAPE_HOLD); default (unset) = LIFTED (prod-preserving).
 * @param {Record<string,string|undefined>} [env] @returns {boolean} */
export function holdEngaged(env = process.env) {
  const v = String(env?.SCRAPE_HOLD ?? "").trim().toLowerCase();
  if (ENGAGED.has(v)) return true;
  if (LIFTED.has(v)) return false;
  return false; // unknown value → default lifted (do not silently block prod on a typo)
}

/** Throw FetchHoldError if the hold is engaged. Called at the TOP of the canonical fetch primitive.
 * @param {string} url @param {Record<string,string|undefined>} [env] */
export function assertFetchAllowed(url, env = process.env) {
  if (holdEngaged(env)) throw new FetchHoldError(url);
}

/** Canonical cache key for a URL — the url-canon SINGLE HOME (mirrors migration 150). Two URLs that differ only
 *  by case / www. / trailing slash-punct share ONE cache entry. @param {string} url @returns {string} */
export function fetchCacheKey(url) {
  return String(canonicalizeCitationUrl(url) ?? "");
}

// ── TTL per source (host → ms). A legal-text host changes rarely (long TTL); a news host changes often (short).
export const DEFAULT_TTL_MS = 24 * 3600 * 1000; // 24h default
export const HOST_TTL_MS = Object.freeze({
  "eur-lex.europa.eu": 30 * 24 * 3600 * 1000,   // binding legal text — stable for weeks
  "legislation.gov.uk": 30 * 24 * 3600 * 1000,
  "federalregister.gov": 7 * 24 * 3600 * 1000,
  "reuters.com": 6 * 3600 * 1000,               // news — hours
  "carbonpulse.com": 6 * 3600 * 1000,
});

/** TTL for a URL's host (falls back to DEFAULT_TTL_MS). @param {string} url @param {Record<string,number>} [table] */
export function ttlForUrl(url, table = HOST_TTL_MS, dflt = DEFAULT_TTL_MS) {
  let host = "";
  try { host = new URL(url).host.replace(/^www\./, "").toLowerCase(); } catch { /* non-URL */ }
  return table[host] ?? dflt;
}

/** Is a cache entry still fresh at nowMs given ttlMs?
 * @param {{fetchedAtMs:number}|null|undefined} entry @param {number} nowMs @param {number} ttlMs */
export function isFresh(entry, nowMs, ttlMs) {
  return !!entry && typeof entry.fetchedAtMs === "number" && (nowMs - entry.fetchedAtMs) < ttlMs;
}

/** Read a fresh cache entry for `url` from `store` (a Map keyed by canonical URL), else null.
 * @param {Map<string,any>|null|undefined} store @param {string} url @param {number} nowMs @param {Record<string,number>} [ttlTable] */
export function cacheGet(store, url, nowMs, ttlTable = HOST_TTL_MS) {
  if (!store) return null;
  const entry = store.get(fetchCacheKey(url));
  return isFresh(entry, nowMs, ttlForUrl(url, ttlTable)) ? entry : null;
}

/** Write a cache entry for `url` into `store`. Returns the stored entry.
 * @param {Map<string,any>|null|undefined} store @param {string} url @param {any} payload @param {number} nowMs */
export function cachePut(store, url, payload, nowMs) {
  const entry = { url, payload, fetchedAtMs: nowMs };
  if (store) store.set(fetchCacheKey(url), entry);
  return entry;
}

/** Per-run fetch telemetry accumulator. record() one row per transportFetch; summary() rolls it up. */
export function makeFetchTelemetry() {
  /** @type {Array<{url:string,key:string,outcome:string,bytes:number,atMs:number}>} */
  const records = [];
  return {
    records,
    /** @param {{url:string,key:string,outcome:string,bytes:number,atMs:number}} row */
    record(row) { records.push(row); return row; },
    summary() {
      const s = { total: records.length, hits: 0, misses: 0, holdBlocked: 0, bytes: 0 };
      for (const r of records) { if (r.outcome === "hit") s.hits++; else if (r.outcome === "miss") s.misses++; else if (r.outcome === "hold-blocked") s.holdBlocked++; s.bytes += r.bytes || 0; }
      return s;
    },
  };
}

/**
 * The transport wrapper: hold gate → canonical cache → fetch → cache-put → telemetry. Dependency-injected so it
 * is pure/testable (fetchImpl, store, now, env, ttlTable, telemetry). Throws FetchHoldError while the hold is
 * engaged (recording a hold-blocked telemetry row first).
 * @param {string} url @param {object} opts
 * @param {{ fetchImpl:(url:string,opts:object)=>Promise<any>, store?:Map<string,any>, now:()=>number,
 *   env?:Record<string,string|undefined>, ttlTable?:Record<string,number>, telemetry?:ReturnType<typeof makeFetchTelemetry> }} deps
 */
export async function transportFetch(url, opts, deps) {
  const { fetchImpl, store, now, env = process.env, ttlTable = HOST_TTL_MS, telemetry } = deps;
  const nowMs = now();
  if (holdEngaged(env)) {
    telemetry?.record({ url, key: fetchCacheKey(url), outcome: "hold-blocked", bytes: 0, atMs: nowMs });
    throw new FetchHoldError(url);
  }
  const hit = cacheGet(store, url, nowMs, ttlTable);
  if (hit) {
    telemetry?.record({ url, key: fetchCacheKey(url), outcome: "hit", bytes: (hit.payload?.text || "").length, atMs: nowMs });
    return hit.payload;
  }
  const payload = await fetchImpl(url, opts);
  cachePut(store, url, payload, nowMs);
  telemetry?.record({ url, key: fetchCacheKey(url), outcome: "miss", bytes: (payload?.text || "").length, atMs: nowMs });
  return payload;
}
