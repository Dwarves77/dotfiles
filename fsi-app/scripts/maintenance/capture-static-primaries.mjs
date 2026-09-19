#!/usr/bin/env node
// SHARED-WRITER: integrity_flags, agent_run_searches
// capture-static-primaries.mjs -- MAINT step for D25 (defect-fix-plan-2026-09-12.md, lane L16): 131 live
// verified brief-grade regulation-family items have a source_url but no stored source capture
// (agent_run_searches row over 200 chars), and the only capture transport wired for a coordinator-run
// maintenance step was the paid one (browserlessFetch). Operator rulings verbatim, 2026-09-13: "You do
// NOT need browserless. Use the browser to look for free." and "We are NOT spending money on populating
// the site." 130 of the 131 are on eur-lex.europa.eu, 1 on www.legislation.gov.uk -- both hosts serve
// their full text as plain HTML that needs no browser render.
//
// COORDINATOR CORRECTION (2026-09-13), BINDING OVER THE ORIGINAL D25(a): the original plan's part (a)
// asked for a brand-new `plainFetch`/`fetchCanonical` chooser inside src/lib/sources/canonical-fetch.mjs.
// That was SUPERSEDED before any code was written for it -- a free direct-HTTP transport already exists
// and is already first in line: src/lib/sources/transport-runtime.mjs (escalateToFetchResult) wires the
// per-failure-class escalation ladder (src/lib/sources/transport-escalation.mjs, invariant RD-14) with
// directFetch/apiFetch/browserlessRender closures, and selectTransportOrder already returns
// ["direct","render"] for eur-lex.europa.eu and every host that is not one of the small render-first list
// (RENDER_FIRST_HOSTS). Building a second, parallel transport chooser would have been exactly the
// duplicated-and-diverged defect class (D1/D3) this repo's canonical-fetch.mjs header exists to kill.
// transport-runtime.mjs instead gained ONE option, `renderAllowed` (default true, so every existing
// caller is byte-for-byte unaffected) -- false REMOVES "render" from the ladder structurally (escalateFetch
// is simply never handed a browserlessRender closure), so a JS-shell or block verdict on the direct
// transport falls straight to the ladder's own (f) exhaustion path (NO_REACHABLE_SOURCE) instead of
// escalating to Browserless. THIS step is the first (and, as of this lane, only) caller of
// renderAllowed:false -- see src/lib/sources/transport-runtime.test.mjs for the red-then-green proof that
// browserlessRender is never invoked with it set.
//
// WHY THE LADDER, NOT A HAND-ROLLED FETCH: classifyTransportResult (transport-escalation.mjs) already
// enforces the EXACT roadblock contract this step needs -- detectRoadblock's STUB_MIN_CHARS is 200, the
// SAME floor the pool's own >200-char usability gate uses (src/lib/sources/primary-fallback.mjs:29), so a
// response under 200 chars, a non-2xx status, or a Cloudflare/CAPTCHA/"Just a moment"/CDN-block/soft-404
// interstitial is ALREADY classified as a non-"content" outcome by the same tested classifier the live
// pipeline runs -- this step does not re-implement roadblock detection, it reuses the single home.
//
// WHAT IT DOES.
//   Selection: `ids:<uuid,uuid,...>` (an explicit id list, still filtered to a STATIC_TEXT_HOSTS host below
//   -- an id whose source_url is not one of these hosts is reported skipped, never force-fetched through a
//   direct-only transport a bot-walled host would refuse), or unscoped -- every live (is_archived=false)
//   regulation-family item_type (regulation/directive/standard/guidance/framework -- REG_FAMILY_ITEM_TYPES
//   below, mirrored verbatim from scripts/mint/heal-provenance.mjs's own REG_FAMILY rather than imported,
//   the SAME "mirror a small constant rather than pull in a 3700-line file's whole import graph" precedent
//   that file's own header uses for constants IT can't import) whose source_url host is in
//   STATIC_TEXT_HOSTS. Idempotent by construction: an item already carrying a pool row over 200 chars is
//   excluded from selection every run (dry or apply), so a re-dispatch never re-fetches or duplicates.
//   Dry: lists every selected item with its host and the action it would take. Fetches nothing, writes
//   nothing.
//   Apply: for each selected item, runs its source_url through escalateToFetchResult with ONLY a
//   directFetch transport and renderAllowed:false (so Browserless is structurally unreachable from this
//   step's own call graph, not merely unconfigured). On eur-lex.europa.eu, when the first attempt is not
//   usable content, derives the CELEX clean-text form via src/lib/sources/identifier-variants.mjs's
//   celexTxtHtmlUrl, the host's one home (F46 external-host-home; lane L35h, 2026-09-18) -- the CELEX id
//   itself still comes from scripts/lib/canonical-key.mjs's deriveKey (the SAME extractor migration 255
//   and heal-provenance.mjs both use) -- and retries once.
//   A usable result writes ONE agent_run_searches row (the pool row shape the export and the driver read --
//   dispatch anchor: src/lib/agent/canonical-pipeline.ts:1689, scripts/turns/export-corpus-for-extraction.mjs:572)
//   through guardedInsert (rule 015). A roadblock writes NO row and is listed with its reason; the run
//   writes AT MOST ONE integrity_flags row summarising every roadblocked item in the run (never one flag
//   per item -- the plan's own explicit instruction).
//   Rate limit: one request per second PER HOST (paceHost below) -- EUR-Lex carries ~130 of the 131 target
//   items, so this alone keeps the run polite to that one host regardless of how many items are selected.
//
// SCRAPE_HOLD (fetch-hold.mjs): checked ONCE per run, before any per-item work -- while engaged, nothing is
// fetched (dry or apply) and the summary reports `fetch_held`, mirroring resolve-error-body-gate.mjs's own
// posture exactly (a genuine machine block on the underlying capability, not a human-approval gate this
// step could route around). The directFetch closure ALSO calls assertFetchAllowed itself (defense in
// depth, matching every other transport primitive in this repo -- directFetchClean/browserlessFetch/
// apiFetchForHost all gate themselves too, never relying solely on an outer caller's check).
//
// GROUNDING_ACQUIRE_ENABLED (D25 part (b)): src/lib/sources/acquire-lock.mjs's ACQUIRE_FLAG is the ONLY
// env var gating paid acquisition today -- its assertAcquireAllowed has exactly two call sites in this
// repo, both unrelated to this step: canonical-pipeline.ts's groundBrief (the paid Sonnet ledger-extraction
// grounding call) and src/lib/sources/verify-item.mjs's act() paid-acquire branch. Neither this file nor
// transport-runtime.mjs/transport-escalation.mjs imports acquire-lock.mjs or calls assertAcquireAllowed --
// confirmed by grep, not by inspection alone. This step's direct transport is therefore NOT behind
// GROUNDING_ACQUIRE_ENABLED at all; it is gated by SCRAPE_HOLD alone, exactly as the plan's original part
// (b) required, restated against the REAL gate per the coordinator's correction.
//
// NO BROWSERLESS IN THIS STEP'S IMPORT GRAPH: this file imports transport-runtime.mjs (which imports only
// transport-escalation.mjs, which imports entity-gate.mjs/holdings-audit.mjs/primary-fallback.mjs -- none
// of which imports canonical-fetch.mjs), fetch-hold.mjs, canonical-key.mjs, institution-key.mjs, db.mjs,
// and this step's own local cli/is-main helpers -- none of which imports canonical-fetch.mjs either. See
// this lane's report for the exact grep command + zero-match result asserted over this graph.
import { escalateToFetchResult } from "../../src/lib/sources/transport-runtime.mjs";
import { assertFetchAllowed, holdEngaged } from "../../src/lib/sources/fetch-hold.mjs";
import { celexTxtHtmlUrl } from "../../src/lib/sources/identifier-variants.mjs";
import { deriveKey } from "../lib/canonical-key.mjs";
import { cellarEndpointForCelex, isCellarUrl, CELLAR_ACCEPT, CELLAR_CELEX_PREFIX } from "../lib/eurlex-cellar.mjs";
import { hostOf } from "../lib/institution-key.mjs";
import { readAll, readAllByIds, guardedInsert } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D25 (lane L16, 2026-09-13)",
  reason:
    "Capture the 131 verified brief-grade regulation-family items' full text through the free direct-HTTP " +
    "transport (transport-runtime.mjs's escalation ladder, renderAllowed:false) per the operator's ruling " +
    "that no paid Browserless call is needed or wanted for this population -- 'Use the browser to look " +
    "for free' / 'We are NOT spending money on populating the site.'",
});

// Mirrored verbatim from scripts/mint/heal-provenance.mjs's own REG_FAMILY (migration 158) -- see this
// file's header for why it is mirrored rather than imported.
export const REG_FAMILY_ITEM_TYPES = Object.freeze(["regulation", "directive", "standard", "guidance", "framework"]);

// The hosts D25's own evidence confirmed serve full text as plain HTML needing no browser render.
// hostOf() (institution-key.mjs) already strips a leading "www." and lowercases, so ONE bare-host form
// per host matches both the www and non-www spelling -- the plan's own list named "www.legislation.gov.uk"
// AND "legislation.gov.uk" separately; hostOf collapses that distinction rather than requiring two entries.
export const STATIC_TEXT_HOSTS = Object.freeze(new Set([
  "eur-lex.europa.eu",
  "legislation.gov.uk",
  "federalregister.gov",
  "ecfr.gov",
  "govinfo.gov",
]));

/** Is `url`'s host one of STATIC_TEXT_HOSTS? Pure, never throws on a malformed URL. */
export function isStaticTextHost(url) {
  return STATIC_TEXT_HOSTS.has(hostOf(url));
}

const ITEM_COLUMNS = "id, item_type, item_grade, is_archived, source_url, instrument_identifier, canonical_instrument_key";
const MAX_CHARS = 400000; // generous cap for a single regulation's full text; truncation is reported, never silent.
const HOST_GAP_MS = 1000; // one request per second per host.

// ── pure helpers (unit-tested with no I/O) ──────────────────────────────────────────────────────────────

/** Strip HTML to text -- the SAME small regex canonical-fetch.mjs's browserlessFetch render() uses (also
 *  duplicated at export-census-rows.mjs's/research-sweep.mjs's own stripHtmlToText); a fourth small local
 *  copy here rather than importing either of those two large files' whole graph for one 5-line helper. */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The EUR-Lex clean-text retry URL for one item, or null when no CELEX id can be derived (deriveKey,
 *  scripts/lib/canonical-key.mjs -- the SAME extractor migration 255 and heal-provenance.mjs use) or the
 *  source_url is already that form. Pure. */
export function deriveCelexTxtHtmlUrl(sourceUrl, instrumentIdentifier) {
  if (/\/TXT\/HTML\//i.test(String(sourceUrl || ""))) return null; // already the clean-text form
  const key = deriveKey(instrumentIdentifier ?? null, sourceUrl ?? null);
  if (!key) return null;
  return celexTxtHtmlUrl(key);
}

/** The Cellar resource for an EUR-Lex act, through the ONE home for that knowledge
 *  (scripts/lib/eurlex-cellar.mjs, moved there from the census exporter which had carried it since
 *  2026-09-02). The CELEX comes from scripts/lib/canonical-key.mjs's deriveKey (the one mirror of the SQL
 *  derivation, never a second parser); an OJ-sequence-suffixed key is kept and percent-encoded by the
 *  shared helper. Pure. */
export { CELLAR_CELEX_PREFIX };
export function deriveCellarUrl(sourceUrl, instrumentIdentifier) {
  const key = deriveKey(instrumentIdentifier ?? null, sourceUrl ?? null);
  if (!key) return null;
  return cellarEndpointForCelex(key);
}

/** Request headers for one URL on the free direct transport: the shared combined Accept for a Cellar
 *  resource (content negotiated: XHTML where it exists, HTML for older acts, one request), the HTML-first
 *  Accept the transport always sent for every other host. Pure. */
export function headersFor(url, userAgent) {
  if (isCellarUrl(url)) {
    return { "User-Agent": userAgent, Accept: CELLAR_ACCEPT, "Accept-Language": "en" };
  }
  return { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" };
}

/** Adapt escalateToFetchResult's verdict to { ok, text, reason }. The ladder's own classifyTransportResult
 *  ALREADY enforces the >200-char floor (STUB_MIN_CHARS, primary-fallback.mjs) and the Cloudflare/CAPTCHA/
 *  "Just a moment"/CDN-block/soft-404 interstitial detection (detectRoadblock) -- this function does not
 *  re-check any of that, it only translates the ladder's outcome into this step's own shape. Pure. */
export function classifyCaptureOutcome(v) {
  // truncated / fullLength / cap ride along (no-silent-truncation rule): a capture cut at MAX_CHARS is
  // reported per item and counted in the run note, never stored as if it were the whole document. Two
  // captures in run 35207120876 (32017R0654, 32024L1788) landed at exactly 400,000 chars with no notice.
  if (v?.outcome === "content") {
    return { ok: true, text: v.text, reason: null, truncated: !!v.truncated, fullLength: v.fullLength ?? null, cap: v.cap ?? null };
  }
  const reason = v?.outcome === "seek_more" ? (v.reason || "not_found") : (v?.holdReason || v?.reason || "no_reachable_source");
  return { ok: false, text: "", reason };
}

/** Map itemId -> the longest stored capture length already on record for it, read from the trigger-
 *  maintained `result_chars` column (migration 322, D32 defect-fix-plan-2026-09-12.md) rather than
 *  decompressing `result_content` to measure it in SQL or in JS -- this driver only needs to know HOW LONG
 *  a capture is, not its text, so reading the indexed integer avoids pulling the text over the wire at
 *  all. Pure. Drives the idempotency skip -- an item at or above 200 chars already has a usable capture. A
 *  null result_chars (no content, or a not-yet-backfilled row) counts as 0, never as "missing". */
export function maxPoolLenByItem(rows) {
  const m = new Map();
  for (const r of rows ?? []) {
    const id = r?.intelligence_item_id;
    if (!id) continue;
    const len = Number.isFinite(r?.result_chars) ? r.result_chars : 0;
    if (!m.has(id) || len > m.get(id)) m.set(id, len);
  }
  return m;
}

/** Partition candidate items into { toCapture, alreadyCaptured } against poolMax (maxPoolLenByItem's own
 *  output). Pure. An item already at or above 200 chars is idempotently skipped. */
export function partitionByPoolState(items, poolMax) {
  const toCapture = [], alreadyCaptured = [];
  for (const it of items ?? []) {
    ((poolMax.get(it.id) ?? 0) > 200 ? alreadyCaptured : toCapture).push(it);
  }
  return { toCapture, alreadyCaptured };
}

/** The pool row shape the export and the driver read (dispatch anchors: canonical-pipeline.ts:1689,
 *  export-corpus-for-extraction.mjs:572). Pure. */
export function buildRow(itemId, capturedUrl, text, nowIso = new Date().toISOString(), fetchedFrom = null) {
  // result_url stays the item's OWN EUR-Lex URL even when the bytes came from Cellar (lane L28): the
  // grounding chain resolves a claim's tier through the host that CONTAINS the span (source-credibility-model,
  // one tier per institution) and verifyPoolTargetMatch matches the pool row to the item by URL identity, so
  // a publications.europa.eu result_url would NULL-stamp every FACT and fail the own-URL match. The fetched
  // location is recorded in result_title so a reader of the row still learns where the text was read from.
  return {
    intelligence_item_id: itemId,
    search_query: "canonical ground",
    result_url: capturedUrl,
    result_title: fetchedFrom ? `source; fetched via ${fetchedFrom} (Cellar, application/xhtml+xml)` : "source",
    result_index: 0,
    result_content: text,
    searched_at: nowIso,
  };
}

/** ONE integrity_flags row summarising every roadblocked item in this run (never one flag per item, per
 *  the plan's own instruction). Pure. Returns null when nothing roadblocked (no flag to write). */
export function buildRoadblockSummaryFlag(roadblocked, nowIso = new Date().toISOString()) {
  if (!roadblocked?.length) return null;
  const byReason = {};
  for (const r of roadblocked) byReason[r.reason ?? "unknown"] = (byReason[r.reason ?? "unknown"] || 0) + 1;
  const sample = roadblocked.slice(0, 8).map((r) => `${r.id}(${r.host}:${r.reason})`).join("; ");
  return {
    category: "source_issue",
    subject_type: "system",
    subject_ref: "capture-static-primaries",
    status: "open",
    created_by: "capture-static-primaries",
    description:
      `capture-static-primaries: ${roadblocked.length} item(s) roadblocked on the free direct transport ` +
      `(renderAllowed:false) -- ${Object.entries(byReason).map(([k, v]) => `${k}:${v}`).join(", ")}. Sample: ${sample}`.slice(0, 480),
    recommended_actions: roadblocked.slice(0, 20).map((r) => ({
      action: "review_roadblocked_capture",
      rationale: `item ${r.id} (${r.host}): ${r.reason} at ${r.url} -- run ${nowIso}`,
    })),
  };
}

/** How long to wait (ms) before the next fetch to `host`, given `lastFetchAtByHost` (a Map<host, epochMs>)
 *  and `nowMs`. Pure -- no timers. Returns 0 when no wait is needed. */
export function computeHostWaitMs(lastFetchAtByHost, host, nowMs, gapMs = HOST_GAP_MS) {
  const last = lastFetchAtByHost.get(host);
  if (last == null) return 0;
  const wait = last + gapMs - nowMs;
  return wait > 0 ? wait : 0;
}

/** Pace one host to at most 1 request/gapMs -- awaits the wait computeHostWaitMs names, then stamps the
 *  host's new last-fetch time. `now`/`sleep` are injected so tests never actually wait. */
export async function paceHost(lastFetchAtByHost, host, { now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), gapMs = HOST_GAP_MS } = {}) {
  const wait = computeHostWaitMs(lastFetchAtByHost, host, now(), gapMs);
  if (wait > 0) await sleep(wait);
  lastFetchAtByHost.set(host, now());
}

/** The direct-only transport closure for escalateToFetchResult's `directFetch` dep. Node's own fetch, no
 *  Browserless anywhere in reach. Gates itself with assertFetchAllowed (defense in depth -- main() already
 *  refuses the whole run while the hold is engaged). Returns the RichResult shape the ladder expects:
 *  { status, text, truncated, fullLength, cap }. Never throws past this function -- a timeout or network
 *  error comes back as a low-status/timedOut result so the ladder classifies it as a block, same posture
 *  as canonical-pipeline.ts's own directFetchClean/browserlessFetch. */
export function makeDirectFetch({ fetchImpl = fetch, timeoutMs = 20000, max = MAX_CHARS, caller = null, userAgent = "FSI-static-capture/1.0 (+Caro's Ledge; free direct-HTTP capture, no rendering)" } = {}) {
  return async function directFetch(url) {
    assertFetchAllowed(url, process.env, caller);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        headers: headersFor(url, userAgent),
        signal: controller.signal,
      });
      const html = await res.text();
      const full = htmlToText(html);
      const truncated = full.length > max;
      return { status: res.status, text: truncated ? full.slice(0, max) : full, truncated, fullLength: full.length, cap: max };
    } catch (e) {
      return { status: 0, text: "", timedOut: e?.name === "AbortError" };
    } finally {
      clearTimeout(timer);
    }
  };
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

/** Parse `--arg "ids:<uuid,uuid,...>"` into a string[] (or null for the unscoped default). Pure. */
export function parseIdsArg(arg) {
  const s = String(arg ?? "").trim();
  if (!s.startsWith("ids:")) return null;
  return s.slice(4).split(",").map((x) => x.trim()).filter(Boolean);
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   holdEngaged: () => boolean,
 *   readUnscopedCandidates: () => Promise<Array>,
 *   readByIds: (ids:string[]) => Promise<Array>,
 *   readPoolRows: (ids:string[]) => Promise<Array>,
 *   fetchViaLadder: (url:string) => Promise<object>,
 *   paceHost: (host:string) => Promise<void>,
 *   insertRow: (row:object) => Promise<object>,
 *   insertRoadblockFlag: (row:object) => Promise<object>,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "capture-static-primaries", mode, counts: {}, per_item: [], read_back: {}, applied: 0, exitCode: 0 };

  if (deps.holdEngaged()) {
    summary.counts = { candidates_scanned: 0, would_capture: 0 };
    summary.note = "SCRAPE_HOLD engaged -- refusing to fetch. NOTHING was fetched or written. Re-dispatch after the hold lifts.";
    return summary;
  }

  const idsArg = parseIdsArg(arg);
  const candidates = idsArg ? await deps.readByIds(idsArg) : await deps.readUnscopedCandidates();

  const hostOk = candidates.filter((it) => isStaticTextHost(it.source_url));
  const hostSkipped = candidates.filter((it) => !isStaticTextHost(it.source_url));

  const poolRows = await deps.readPoolRows(hostOk.map((it) => it.id));
  const poolMax = maxPoolLenByItem(poolRows);
  const { toCapture, alreadyCaptured } = partitionByPoolState(hostOk, poolMax);

  summary.counts = {
    candidates_scanned: candidates.length,
    skipped_host_not_static: hostSkipped.length,
    already_captured_skipped: alreadyCaptured.length,
    would_capture: toCapture.length,
  };
  if (hostSkipped.length) summary.host_skipped_sample = hostSkipped.slice(0, 10).map((it) => ({ id: it.id, host: hostOf(it.source_url) }));

  if (!apply) {
    summary.per_item = toCapture.map((it) => ({ id: it.id, host: hostOf(it.source_url), source_url: it.source_url, action: "would_fetch" }));
    summary.note = `DRY -- ${toCapture.length} item(s) would be fetched through the free direct transport (renderAllowed:false). Nothing fetched, nothing written.`;
    return summary;
  }

  let captured = 0;
  let truncatedCount = 0;
  const roadblocked = [];
  for (const item of toCapture) {
    const host = hostOf(item.source_url);
    await deps.paceHost(host);

    let verdict = classifyCaptureOutcome(await deps.fetchViaLadder(item.source_url));
    let capturedUrl = item.source_url;

    let fetchedFrom = null;
    if (!verdict.ok && host === "eur-lex.europa.eu") {
      const derived = deriveCelexTxtHtmlUrl(item.source_url, item.instrument_identifier);
      if (derived) {
        await deps.paceHost(host);
        const v2 = classifyCaptureOutcome(await deps.fetchViaLadder(derived));
        verdict = v2;
        capturedUrl = derived;
      }
      // Third attempt (lane L28): the same act through Cellar, which serves what eur-lex.europa.eu's holding
      // response withholds. capturedUrl stays the EUR-Lex identity (see buildRow); the Cellar URL is recorded.
      if (!verdict.ok) {
        const cellar = deriveCellarUrl(item.source_url, item.instrument_identifier);
        if (cellar) {
          await deps.paceHost(hostOf(cellar));
          const v3 = classifyCaptureOutcome(await deps.fetchViaLadder(cellar));
          if (v3.ok) {
            verdict = v3;
            fetchedFrom = cellar;
          }
        }
      }
    }

    if (verdict.ok) {
      const row = buildRow(item.id, capturedUrl, verdict.text, undefined, fetchedFrom);
      const ins = await deps.insertRow(row);
      captured += 1;
      if (verdict.truncated) truncatedCount += 1;
      summary.per_item.push({
        id: item.id, host, result_url: capturedUrl, fetched_from: fetchedFrom, action: "captured", chars: verdict.text.length,
        truncated: !!verdict.truncated, full_length: verdict.fullLength ?? null, cap: verdict.cap ?? null, inserted_id: ins?.id ?? null,
      });
    } else {
      roadblocked.push({ id: item.id, host, url: capturedUrl, reason: verdict.reason });
      summary.per_item.push({ id: item.id, host, url: capturedUrl, action: "roadblocked", reason: verdict.reason });
    }
  }

  let flagWritten = false;
  const flagRow = buildRoadblockSummaryFlag(roadblocked);
  if (flagRow) {
    await deps.insertRoadblockFlag(flagRow);
    flagWritten = true;
  }

  summary.applied = captured;
  summary.counts.captured = captured;
  summary.counts.truncated = truncatedCount;
  summary.counts.roadblocked = roadblocked.length;
  summary.counts.roadblock_flag_written = flagWritten;

  const readBackIds = toCapture.map((it) => it.id);
  const readBackRows = readBackIds.length ? await deps.readPoolRows(readBackIds) : [];
  const readBackMax = maxPoolLenByItem(readBackRows);
  const stillMissing = readBackIds.filter((id) => (readBackMax.get(id) ?? 0) <= 200).length;
  summary.read_back = { pool_now_present: readBackIds.length - stillMissing, still_missing: stillMissing };
  summary.note = `Captured ${captured}/${toCapture.length} (${truncatedCount} cut at the ${MAX_CHARS}-char cap, full length recorded per item); roadblocked ${roadblocked.length}.` +
    (flagWritten ? " 1 summary integrity flag written." : " No roadblocks.");

  return summary;
}

// ---------------------------------------------------------------------------------------------------
// buildDeps -- the real DB/fetch wiring (D22 rule: exported, real-wiring tested).
// ---------------------------------------------------------------------------------------------------

export async function buildDeps() {
  const directFetch = makeDirectFetch({ max: MAX_CHARS });
  const lastFetchAtByHost = new Map();
  return {
    holdEngaged: () => holdEngaged(),
    readUnscopedCandidates: () =>
      readAll("intelligence_items", ITEM_COLUMNS, {
        match: (q) => q.eq("is_archived", false).in("item_type", REG_FAMILY_ITEM_TYPES),
      }),
    readByIds: (ids) => readAllByIds("intelligence_items", ITEM_COLUMNS, ids),
    // fitness-allow: F39 (a batch-scoped .in(intelligence_item_id, ids) read over the run's own small
    // candidate id set, never a whole-table agent_run_searches scan). D32 (defect-fix-plan-2026-09-12.md,
    // lane L21): reads result_chars (migration 322's trigger-maintained length), never result_content --
    // this idempotency check only needs to know how long a capture is, not its text.
    readPoolRows: (ids) => (ids?.length
      ? readAllByIds("agent_run_searches", "intelligence_item_id, result_chars", ids, { idColumn: "intelligence_item_id" })
      : Promise.resolve([])),
    fetchViaLadder: (url) => escalateToFetchResult(url, MAX_CHARS, { directFetch, renderAllowed: false }),
    paceHost: (host) => paceHost(lastFetchAtByHost, host),
    insertRow: async (row) => {
      const r = await guardedInsert("agent_run_searches", row, { cite: CITE, select: "id, result_url" });
      return r.inserted;
    },
    insertRoadblockFlag: async (row) => {
      const r = await guardedInsert("integrity_flags", row, { cite: CITE, select: "id" });
      return r.inserted;
    },
  };
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "capture-static-primaries",
    main,
    needsDb: true,
    buildDeps,
  });
}
