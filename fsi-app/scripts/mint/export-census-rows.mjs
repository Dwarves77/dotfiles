#!/usr/bin/env node
// export-census-rows.mjs — the census-worklist exporter Lane POP's record-tier population plan named as
// the one piece it could not build inside its earlier write set
// (docs/plans/record-tier-population-plan-2026-09-01.md §3: "Building this array from the live
// census_worklist + sources + agent_run_searches tables is a SQL join a DB-connected caller runs ... not
// a pure, DB-less script, and therefore out of run-mint-batch.mjs's own scope"). This script IS that
// join, plus item_type/canonical-key/jurisdiction derivation and a $0 capture pass.
//
// ── UPDATE 2026-09-02 (Lane POP2, first live dry run 33639133429, limit 50, capture on) ───────────────
// eligible 3,661; excluded_held 650; exported **0**; held 50 (canonical_key_unresolved 24,
// capture_too_short 24, item_type_unmapped 2). Root causes, all CONFIRMED against that run's own
// census-rows.held.json plus a browser-verified read of the live pages:
//   1. EUR-Lex (24 rows): the old capture target was `legal-content/EN/TXT/?uri=CELEX:...`, which a
//      plain HTTP GET gets a 157-byte WAF/interstitial page for (verified: the SAME url renders ~100k
//      chars in a browser). `legal-content/EN/TXT/HTML/?uri=CELEX:...` — the machine-readable clean-text
//      endpoint — renders 96,777 chars of real act text (browser-verified 2026-09-02). These rows'
//      `canonical_instrument_key` was NEVER the problem (deriveKey already resolves the CELEX from the
//      URL) — the hold was purely the capture target.
//   2. legislation.gov.uk (~15) and federalregister.gov (8): held `canonical_key_unresolved` only because
//      `classifyItemTypeFromCelexKey` (the ONLY identity path that existed) demanded a CELEX-shaped key.
//      Neither host has one — this repo's own `intelligence_items` corpus already carries
//      `canonical_instrument_key = null` for every non-EU host (federalregister/leginfo/imo/...) — so
//      inventing a synthetic key for them would be the false-precision mistake this repo's own doctrine
//      forbids (canonical-key.mjs's header). Dedup for these two families is the URL-holder check
//      (`--exclude-held` / apply-mint-batch.mjs's M4 url-holder rule), which never needed a key.
//   3. `31978H0072` (H = recommendation) and `31978A0311` (A = agreement) held `item_type_unmapped`
//      because the old CELEX-letter map only had R/L/D. H and A are now mapped (see
//      `classifyItemTypeFromCelexKey` below) — every other letter (notably C, "other acts") still holds,
//      explicitly, not guessed.
// This pass adds per-source-family identity + capture resolution (`resolveIdentity` / per-family capture
// in `resolveRowCapture`) so EUR-Lex, legislation.gov.uk and federalregister.gov each resolve identity
// and text the way their own corpus shape requires, instead of forcing every row through the CELEX-only
// path. See MINT-RUNBOOK.md §11 for the full per-family table and the browser-capture escape hatch for a
// site whose automated capture is refused (operator ruling, MINT-RUNBOOK §1a: read it through the
// browser, never report it as a blocker).
//
// WHAT IT DOES, per row of census_worklist WHERE dryrun_disposition = 'would_mint':
//   1. Join sources on source_id (id/url/base_tier/tier_override/status/institution_id/category/name).
//   2. Join agent_run_searches on result_url = document_url, requiring >200 chars result_content (the
//      live-confirmed shape: 680 of 3,661 would_mint rows have this today).
//   3. IDENTITY — `resolveIdentity(censusRow, source)`, deterministic per source family (see its own doc
//      comment below): EUR-Lex/CELEX (canonical key + CELEX-letter item_type), legislation.gov.uk (no
//      canonical scheme — never invented; item_type from the legislation-type path segment),
//      federalregister.gov (no canonical scheme; item_type from the FR API's own `type` field — a live
//      network call, gated behind `--capture` exactly like every other family's capture, see below), any
//      other host held `identity_unmapped_source` (host recorded, never guessed).
//   4. CAPTURE — for a row with NO existing agent_run_searches text, `--capture` fetches it PER FAMILY:
//      EUR-Lex fetches the `/TXT/HTML/?uri=CELEX:...` clean-text endpoint; legislation.gov.uk tries
//      `<url>/data.htm` first, falling back to the page itself; federalregister.gov fetches the
//      document's API JSON for `type`/`title`/`raw_text_url`, then the `raw_text_url` body. A capture
//      that comes back non-2xx or ≤200 chars of text is held `capture_blocked` WITH EVIDENCE
//      (`http_status`, `bytes`, `head` — the first 300 chars of whatever text came back — and the
//      `endpoint` actually tried), never a bare unexplained hold. No capture and no `--capture` → held
//      `no_capture`, as before.
//   5. title: the family's own capture step supplies it when it can (EUR-Lex: first heading of the act,
//      body-lead as a documented fallback; legislation.gov.uk: `<title>`/`<h1>`; federalregister.gov: the
//      API JSON's own `title`, the most reliable of the three); otherwise the source's registered name
//      plus the instrument identifier. `title_origin` records which, honestly, per row.
//   6. --exclude-held (default ON; --include-held turns it off): a row whose document_url already has AN
//      intelligence_items.source_url row -- archived or not -- is excluded before export (not merely
//      held), with the excluded count reported.
//
// A row that cannot be built for ANY reason is emitted to a SIBLING `<out>.held.json` file with a `hold`
// reason -- per this lane's charter, "never silently dropped". Rows excluded by --exclude-held are
// counted and reported but are NOT written to the held file (they are not a build failure -- they are a
// row this run correctly declines to touch because the corpus already holds it).
//
// OUTPUT SHAPE: exactly the enriched-row array run-mint-batch.mjs's --census-rows mode documents (see
// that file's own header above loadCensusRows) -- row_id, source_url, item_type, title,
// instrument_identifier, canonical_instrument_key, jurisdiction_iso, priority, source{}, captured_text,
// fetched_length, plus this script's own title_origin (additionalProperties is true throughout that
// contract -- an extra field is never rejected). `canonical_instrument_key` is legitimately `null` for a
// non-EU-instrument row (legislation.gov.uk, federalregister.gov) — that field is documented OPTIONAL in
// run-mint-batch.mjs's own --census-rows contract, and apply-mint-batch.mjs's M4 pre-check already
// tolerates a null key (it falls back to the same-source_url holder check).
//
// USAGE:
//   node scripts/mint/export-census-rows.mjs [--limit 50] [--source-id <uuid>] [--celex-prefix 32024]
//        [--include-held] [--capture] [--out path/to/census-rows.json]
//
// Zero DB writes. Reads via scripts/lib/db.mjs's readAll (paginated, capped-read-safe). --capture makes
// real outbound HTTP GETs to census_worklist.document_url values (and, for EUR-Lex/federalregister rows,
// a family-specific derived endpoint) only -- never a DB write, never an LLM call, $0. WITHOUT --capture
// this script makes NO outbound HTTP request at all, including for federalregister.gov's item_type
// lookup (that lookup is gated behind --capture exactly like text capture, so a --capture-off run stays
// fully network-free and predictable — see buildRows below; a federalregister.gov row that already has
// existing agent_run_searches text but no --capture run yet to classify its type holds
// `fr_type_pending_capture`, distinct from `no_capture`, so the two cases are never confused in a report).
//
// [UNCONFIRMED] legislation.gov.uk's `/data.htm` endpoint: confirmed (WebFetch, 2026-09-02) to return
// HTTP 200 with the instrument's real text present, but this sandbox could not confirm at the byte level
// that it is meaningfully SMALLER/cleaner than the ordinary page (WebFetch renders through an HTML→
// markdown→LLM-summary pipeline, not a raw byte inspection, and this sandbox's Bash has no general
// outbound network access to check with curl). Implemented as instructed (tried first, page as fallback);
// flagged here and in MINT-RUNBOOK.md §11 rather than asserted as verified.
//
// [UNCONFIRMED→CORRECTED] the federalregister.gov API's `type` field is NOT the RULE/PRORULE/NOTICE/
// PRESDOCU short codes (those are the *search-filter* query-param codes) — a per-document JSON's own
// `type` field is a human-readable string: "Rule", "Proposed Rule", "Notice", "Presidential Document"
// (WebFetch-verified against a live document and a live RULE-filtered search, 2026-09-02). This script's
// `classifyFrDocType` matches against those actual field values, case-insensitively.

import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey } from "../lib/canonical-key.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

// ── pure helpers (unit-tested directly, no I/O) ─────────────────────────────────────────────────────

/**
 * item_type from a CELEX-shaped canonical_instrument_key ("3YYYY<letter>NNNN[(NN)]"). Pure. R/L/D are
 * the original recorded lane decision (D -> "initiative", not "decision" -- not a legal item_type; see
 * this file's header). H (recommendation) -> "guidance" and A (international agreement) -> "framework"
 * are added 2026-09-02 (Lane POP2) once the first live dry run showed both letters holding
 * `item_type_unmapped` with no home — "guidance" and "framework" are both legal `intelligence_items.
 * item_type` values (migration 004's CHECK constraint) and both already route through `domainForItemType`
 * without a new domain branch. C ("other acts") and every other sector-3 letter this repo's item_type
 * enum has no legitimate home for still hold `item_type_unmapped`, explicitly, never guessed.
 * @param {string|null} canonicalKey
 * @returns {{itemType: string|null, hold: string|null}}
 */
export function classifyItemTypeFromCelexKey(canonicalKey) {
  if (typeof canonicalKey !== "string" || !/^3\d{4}[A-Z]\d{4}/.test(canonicalKey)) {
    return { itemType: null, hold: "canonical_key_unresolved" };
  }
  const letter = canonicalKey.charAt(5);
  const MAP = { R: "regulation", L: "directive", D: "initiative", H: "guidance", A: "framework" };
  const itemType = MAP[letter] ?? null;
  return itemType ? { itemType, hold: null } : { itemType: null, hold: "item_type_unmapped" };
}

/** UK Statutory-Instrument-family path segments this script maps to item_type "regulation" (the ONLY
 *  item_type legislation.gov.uk rows map to today — a re-scope to directive/framework/etc. per instrument
 *  type is a future refinement, not silently guessed here). No canonical-key scheme exists for UK
 *  legislation in this system (unlike CELEX/ELI) — inventing one would be false precision this repo's own
 *  canonical-key doctrine forbids, so `resolveIdentity` below always returns `canonicalKey: null` for
 *  this family; the URL-holder check is this family's whole dedup story. */
const UK_LEGISLATION_TYPE_RE = /\/(uksi|ukpga|wsi|ssi|nisr)\//i;

/** item_type from a legislation.gov.uk document_url's path segment, or null (held item_type_unmapped by
 *  the caller) when the path carries none of the mapped instrument-type segments. Pure. */
export function classifyUkLegislationType(documentUrl) {
  return UK_LEGISLATION_TYPE_RE.test(String(documentUrl ?? "")) ? "regulation" : null;
}

/** The federalregister.gov document number out of a `/documents/YYYY/MM/DD/<docnum>/...` URL path (the
 *  shape the census `document_url` carries). Pure. Returns null when the URL does not carry this shape
 *  (e.g. a `/d/<docnum>` short-link or a non-document federalregister.gov URL) -- held
 *  `fr_document_number_unresolved` by the caller rather than guessed. */
const FR_DOCNUM_RE = /\/documents\/\d{4}\/\d{2}\/\d{2}\/([A-Za-z0-9-]+)/;
export function extractFrDocumentNumber(documentUrl) {
  const m = String(documentUrl ?? "").match(FR_DOCNUM_RE);
  return m ? m[1] : null;
}

/** item_type from the federalregister.gov API document JSON's own `type` field (the ACTUAL field value,
 *  e.g. "Rule" — see this file's header for the RULE/PRORULE/NOTICE/PRESDOCU correction: those are the
 *  search-API's *filter* codes, not what a per-document JSON's `type` field carries). Only "Rule" has a
 *  legal `intelligence_items.item_type` home ("regulation" — an enacted rule is the FR analogue of an EU
 *  regulation). "Proposed Rule" (not yet enacted), "Notice", and "Presidential Document" hold
 *  `item_type_unmapped`, naming the FR type verbatim in the hold record (never forced into "regulation").
 *  Pure. Case-insensitive (API responses have been observed capitalized; this stays robust to either). */
export function classifyFrDocType(frType) {
  const t = String(frType ?? "").trim().toLowerCase();
  if (t === "rule") return { itemType: "regulation", hold: null };
  return { itemType: null, hold: "item_type_unmapped" };
}

/** The hostname of a URL, lowercased, or null for an unparseable URL. Pure. */
export function getHostname(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Which source family a document_url (or, failing that, the source's own url) belongs to, for
 *  `resolveIdentity` below. Pure. Returns null for any host not yet mapped -- held
 *  `identity_unmapped_source`, host recorded, never guessed at. */
export function classifyHost(url) {
  const host = getHostname(url);
  if (!host) return null;
  if (host.endsWith("eur-lex.europa.eu")) return "eurlex";
  if (host.endsWith("legislation.gov.uk")) return "uk_legislation";
  if (host.endsWith("federalregister.gov")) return "federal_register";
  return null;
}

/**
 * Per-source-family identity resolution: `{ scheme, canonicalKey, itemType, jurisdictionIso, hold, host,
 * needsFrLookup?, frDocumentNumber?, frType? }`. Pure, deterministic given its inputs — federalregister.
 * gov's item_type genuinely requires an external API value (`frDocType`); when that has not been resolved
 * yet, this returns `needsFrLookup: true` and `frDocumentNumber` instead of guessing, and the CALLER
 * (buildRows) is responsible for the actual network call (gated behind --capture, see buildRows) and a
 * second call to this function with `frDocType` supplied. This keeps the function itself free of I/O —
 * the same "caller resolves, function classifies" split this file already uses for capture (buildExportRow
 * takes an already-resolved `capture`, never fetches itself).
 * @param {object} censusRow @param {object|null} source @param {{frDocType?: string}} opts
 */
export function resolveIdentity(censusRow, source, { frDocType } = {}) {
  const documentUrl = censusRow?.document_url ?? null;
  const host = getHostname(documentUrl) ?? getHostname(source?.url) ?? null;
  const family = classifyHost(documentUrl) ?? classifyHost(source?.url);

  if (family === "eurlex") {
    const canonicalKey = deriveKey(censusRow?.instrument_identifier ?? null, documentUrl);
    const { itemType, hold } = classifyItemTypeFromCelexKey(canonicalKey);
    return { scheme: "celex", canonicalKey, itemType, jurisdictionIso: "EU", hold, host };
  }

  if (family === "uk_legislation") {
    const itemType = classifyUkLegislationType(documentUrl);
    return {
      scheme: "uk_legislation",
      canonicalKey: null,
      itemType,
      jurisdictionIso: "GB",
      hold: itemType ? null : "item_type_unmapped",
      host,
    };
  }

  if (family === "federal_register") {
    const frDocumentNumber = extractFrDocumentNumber(documentUrl);
    if (!frDocumentNumber) {
      return { scheme: "federal_register", canonicalKey: null, itemType: null, jurisdictionIso: "US", hold: "fr_document_number_unresolved", host };
    }
    if (frDocType === undefined) {
      return { scheme: "federal_register", canonicalKey: null, itemType: null, jurisdictionIso: "US", hold: null, host, needsFrLookup: true, frDocumentNumber };
    }
    const { itemType, hold } = classifyFrDocType(frDocType);
    return { scheme: "federal_register", canonicalKey: null, itemType, jurisdictionIso: "US", hold, host, frType: frDocType, frDocumentNumber };
  }

  return { scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "identity_unmapped_source", host };
}

/** Strip HTML to plain text. Mirrors src/lib/sources/canonical-fetch.mjs's inline `stripText` (that
 *  function is not exported, so this is a documented re-implementation of the SAME two-line pattern, not
 *  a second design -- see this file's header). Also decodes the handful of entities a raw (un-browser-
 *  rendered) fetch leaves undecoded. Pure. Harmless (a no-op past whitespace collapse) on plain text input
 *  such as a federalregister.gov raw_text_url body or an FR API JSON body -- no tags to strip. */
export function stripHtmlToText(html) {
  return String(html ?? "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract a title from raw HTML: <title> first, then the first <h1>. Returns null when neither is
 *  present or both are blank after stripping. Pure. */
export function extractTitleFromHtml(html) {
  const h = String(html ?? "");
  const titleM = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) {
    const t = stripHtmlToText(titleM[1]);
    if (t) return { title: t, origin: "captured_title" };
  }
  const h1M = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1M) {
    const t = stripHtmlToText(h1M[1]);
    if (t) return { title: t, origin: "captured_heading" };
  }
  return null;
}

/** Title for a freshly-captured EUR-Lex clean-text page: `extractTitleFromHtml`'s <title>/<h1> first (in
 *  case the endpoint does carry one), else the first ~300 chars of the stripped body text — EUR-Lex's
 *  clean-text endpoint opens directly with the act's own title (e.g. "COUNCIL DECISION of 14 October 2004
 *  concerning ..." -- coordinator-verified in a browser, 2026-09-02). [UNCONFIRMED] the exact markup
 *  around that opening line: eur-lex.europa.eu's robots.txt blocks this sandbox's own WebFetch from
 *  reading a live page to confirm it (`ROBOTS_DISALLOWED`), so this stays a documented text-lead
 *  heuristic, not a verified tag-targeted extractor. Pure. */
export function extractEurlexTitle(html) {
  const heading = extractTitleFromHtml(html);
  if (heading) return heading;
  const text = stripHtmlToText(html);
  if (!text) return null;
  const lead = text.slice(0, 300).trim();
  return lead ? { title: lead, origin: "captured_body_lead" } : null;
}

/** Select the would_mint census rows this run will consider, in order: disposition filter, then the
 *  optional --source-id / --celex-prefix narrowing, then --limit. Pure. */
export function selectCensusRows(censusRows, { sourceId = null, celexPrefix = null, limit = 50 } = {}) {
  return (censusRows ?? [])
    .filter((r) => r?.dryrun_disposition === "would_mint")
    .filter((r) => !sourceId || r.source_id === sourceId)
    .filter((r) => !celexPrefix || String(r.instrument_identifier ?? "").startsWith(celexPrefix))
    .slice(0, limit == null ? undefined : limit); // null = no cap (main() caps AFTER the held-exclusion)
}

/** Partition selected rows into { kept, excludedHeld } against a Set of source_urls that already have an
 *  intelligence_items row (archived or not). Pure. When `excludeHeld` is false, nothing is excluded
 *  (every row passes through as `kept`) -- the caller still gets the same shape either way. */
export function partitionExcludeHeld(rows, heldUrlSet, excludeHeld = true) {
  if (!excludeHeld) return { kept: rows.slice(), excludedHeld: [] };
  const kept = [], excludedHeld = [];
  for (const r of rows) {
    if (heldUrlSet.has(r.document_url)) excludedHeld.push(r);
    else kept.push(r);
  }
  return { kept, excludedHeld };
}

/**
 * Build one enriched export row (or a hold record) from a census_worklist row plus its resolved source,
 * resolved identity, and resolved capture. Pure -- every input is already resolved by the caller (no I/O
 * in here); this is the same "caller resolves, this classifies" split `resolveIdentity` documents above.
 * @param {object} censusRow census_worklist row (id, document_url, instrument_identifier, ...)
 * @param {object|null} source the resolved `sources` row, or null if none was found
 * @param {object} identity `resolveIdentity`'s (already-finalized — no `needsFrLookup` pending) output
 * @param {{text:string|null, html?:string|null, title?:string|null, titleOrigin?:string|null}} capture
 *   the resolved capture: `text` becomes captured_text; `title`/`titleOrigin` when the capture step
 *   already resolved a title (federalregister.gov's API title, EUR-Lex's body-lead, ...); `html`, when
 *   present and no `title` was supplied, is read via `extractTitleFromHtml` as a last attempt before the
 *   source-name fallback.
 * @returns {{row:object}|{hold:object}}
 */
export function buildExportRow(censusRow, source, identity, capture) {
  const rowId = censusRow?.id ?? null;
  const documentUrl = censusRow?.document_url ?? null;

  if (!source) {
    return { hold: { row_id: rowId, document_url: documentUrl, reason: "source_not_found" } };
  }

  if (identity?.hold) {
    return {
      hold: {
        row_id: rowId,
        document_url: documentUrl,
        instrument_identifier: censusRow?.instrument_identifier ?? null,
        canonical_instrument_key: identity.canonicalKey ?? null,
        scheme: identity.scheme ?? null,
        host: identity.host ?? null,
        ...(identity.frType ? { fr_type: identity.frType } : {}),
        reason: identity.hold,
      },
    };
  }

  const capturedText = capture?.text ?? null;
  if (!capturedText || capturedText.trim().length <= 200) {
    return {
      hold: {
        row_id: rowId,
        document_url: documentUrl,
        reason: "capture_too_short",
        fetched_length: capturedText ? capturedText.length : 0,
      },
    };
  }

  let title = capture?.title ?? null;
  let titleOrigin = capture?.titleOrigin ?? null;
  if (!title && capture?.html) {
    const t = extractTitleFromHtml(capture.html);
    if (t) { title = t.title; titleOrigin = t.origin; }
  }
  if (!title) {
    title = censusRow?.instrument_identifier
      ? `${source.name ?? source.url} — ${censusRow.instrument_identifier}`
      : (source.name ?? source.url);
    titleOrigin = "source_name_fallback";
  }

  return {
    row: {
      row_id: rowId,
      source_url: documentUrl,
      item_type: identity.itemType,
      title,
      title_origin: titleOrigin,
      instrument_identifier: censusRow?.instrument_identifier ?? null,
      canonical_instrument_key: identity.canonicalKey ?? null,
      jurisdiction_iso: identity.jurisdictionIso ?? null,
      priority: "MODERATE",
      source: {
        id: source.id,
        url: source.url,
        base_tier: source.base_tier ?? null,
        tier_override: source.tier_override ?? null,
        status: source.status,
        institution_id: source.institution_id ?? null,
        category: source.category ?? null,
        name: source.name ?? null,
      },
      captured_text: capturedText,
      fetched_length: capturedText.length,
    },
  };
}

// ── live capture (network; injected fetchImpl so tests never hit the network) ──────────────────────────

/** Politely fetch one URL and reduce it to { ok, status, text, html, error }. `fetchImpl` defaults to
 *  the global fetch; a caller may inject a stub for tests. Times out at `timeoutMs` (default 20000).
 *  Generic across every family below -- HTML gets tag-stripped, plain text (an FR raw_text_url body, an
 *  FR API JSON body) passes through `stripHtmlToText` as a harmless no-op past whitespace collapse. */
export async function captureDocument(url, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "user-agent": "FSI-population-turn/1.0 (+population-turn)",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en",
      },
      signal: controller.signal,
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, text: stripHtmlToText(html), error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: null, html: null, text: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** A rate-limited fetch bound to one politeness gap (POPULATION_FETCH_GAP_MS, default 1000ms), matching
 *  run-source-sweep.mjs's politeFetch discipline (1 req/s, never a burst). Fetch-shaped (not
 *  capture-shaped) so it can be handed to `captureDocument` as `fetchImpl` for ANY of this row's fetches
 *  -- a federalregister.gov row's two requests (API JSON, then raw_text_url) share ONE politeFetch
 *  instance via buildRows below, so the gap is enforced across BOTH, not just within one family's own
 *  internal retry. */
export function makePoliteFetch({ gapMs = Number(process.env.POPULATION_FETCH_GAP_MS ?? 1000), fetchImpl = fetch } = {}) {
  let lastFetchAt = 0;
  return async function politeFetch(url, opts) {
    const wait = lastFetchAt + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return fetchImpl(url, opts);
  };
}

/** Fetch + parse a federalregister.gov document's API JSON (`/api/v1/documents/<docnum>.json`), reducing
 *  it to exactly what identity + capture need: `{ ok, status, bytes, head, endpoint, frType, title,
 *  rawTextUrl, error }`. `bytes`/`head` are always populated (even on failure) so a hold built from this
 *  carries the same evidence shape `capture_blocked` requires elsewhere in this file. */
export async function fetchFrDocumentMeta(documentNumber, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const endpoint = `https://www.federalregister.gov/api/v1/documents/${documentNumber}.json`;
  const res = await captureDocument(endpoint, { fetchImpl, timeoutMs });
  const bytes = Buffer.byteLength(res.html ?? "", "utf8");
  const head = (res.text ?? "").slice(0, 300);
  if (!res.ok) {
    return { ok: false, status: res.status, bytes, head, endpoint, frType: null, title: null, rawTextUrl: null, error: res.error };
  }
  let json;
  try {
    json = JSON.parse(res.html ?? "");
  } catch (err) {
    return { ok: false, status: res.status, bytes, head, endpoint, frType: null, title: null, rawTextUrl: null, error: `unparseable FR API JSON: ${err.message}` };
  }
  return {
    ok: true,
    status: res.status,
    bytes,
    head,
    endpoint,
    frType: json?.type ?? null,
    title: json?.title ?? null,
    rawTextUrl: json?.raw_text_url ?? null,
    error: null,
  };
}

/** Reduce one `captureDocument` result into the unified capture envelope every family below returns:
 *  `{ usable, status, bytes, head, endpoint, text, html, title?, titleOrigin?, error, ...extra }`.
 *  `usable` is the SAME test buildExportRow's own capture_too_short check makes (ok AND >200 stripped
 *  chars) — computed once here so a `capture_blocked` hold and a usable row never disagree about the
 *  threshold. `titleFn`, when usable, is called on the raw html/text to pre-resolve a title. */
function envelopeFromCaptureDocument(res, endpoint, { titleFn = null, ...extra } = {}) {
  const bytes = Buffer.byteLength(res.html ?? "", "utf8");
  const text = res.text ?? "";
  const head = text.slice(0, 300);
  const usable = !!(res.ok && text.trim().length > 200);
  const envelope = { usable, status: res.status, bytes, head, endpoint, text: usable ? text : null, html: res.html ?? null, error: res.error, ...extra };
  if (usable && titleFn) {
    const t = titleFn(res.html);
    if (t) { envelope.title = t.title; envelope.titleOrigin = t.origin; }
  }
  return envelope;
}

/**
 * Per-family live capture, given an already-resolved `identity` (its `needsFrLookup` case must already be
 * resolved by the caller -- see buildRows). Returns the unified envelope `envelopeFromCaptureDocument`
 * documents, or `{ usable: false, ... }` when this identity carries no capture path at all (should not
 * happen in practice -- buildRows only calls this after `identity.hold` is already false).
 */
export async function resolveRowCapture(censusRow, identity, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const documentUrl = censusRow?.document_url ?? null;

  if (identity.scheme === "celex" && identity.canonicalKey) {
    const endpoint = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${identity.canonicalKey}`;
    const res = await captureDocument(endpoint, { fetchImpl, timeoutMs });
    return envelopeFromCaptureDocument(res, endpoint, { titleFn: extractEurlexTitle });
  }

  if (identity.scheme === "uk_legislation") {
    const dataEndpoint = `${String(documentUrl ?? "").replace(/\/+$/, "")}/data.htm`;
    const first = await captureDocument(dataEndpoint, { fetchImpl, timeoutMs });
    const firstEnv = envelopeFromCaptureDocument(first, dataEndpoint, { titleFn: extractTitleFromHtml });
    if (firstEnv.usable) return firstEnv;
    const fb = await captureDocument(documentUrl, { fetchImpl, timeoutMs });
    return envelopeFromCaptureDocument(fb, documentUrl, { titleFn: extractTitleFromHtml, fallbackFrom: dataEndpoint });
  }

  if (identity.scheme === "federal_register") {
    const meta = identity._frMeta ?? (await fetchFrDocumentMeta(identity.frDocumentNumber, { fetchImpl, timeoutMs }));
    if (!meta.ok || !meta.rawTextUrl) {
      return { usable: false, status: meta.status ?? null, bytes: meta.bytes ?? 0, head: meta.head ?? "", endpoint: meta.endpoint ?? null, error: meta.error ?? "FR API response carried no raw_text_url" };
    }
    const res = await captureDocument(meta.rawTextUrl, { fetchImpl, timeoutMs });
    const env = envelopeFromCaptureDocument(res, meta.rawTextUrl, { apiEndpoint: meta.endpoint });
    if (env.usable) { env.title = meta.title ?? null; env.titleOrigin = "fr_api_title"; }
    return env;
  }

  return { usable: false, status: null, bytes: 0, head: "", endpoint: null, error: "no capture path for this identity scheme" };
}

/** Build the { rows, held } arrays for every kept census row, given lookup maps for source and existing
 *  capture text. Rows with no existing capture are captured PER FAMILY (see resolveRowCapture) ONLY when
 *  `capture` is true; otherwise they hold "no_capture" immediately. federalregister.gov's item_type
 *  ALSO needs a live API call (see this file's header) — that lookup is likewise gated behind `capture`
 *  so a --capture-off run stays fully network-free; an FR row that already carries existing DB text but
 *  has never had its type classified holds the distinct `fr_type_pending_capture` in that case, never
 *  silently exported with a guessed type. Returns counts alongside the arrays so the CLI summary and the
 *  tests share one source of truth. */
export async function buildRows(
  keptCensusRows,
  { sourcesById, existingCaptureByUrl, capture = false, fetchImpl = fetch, timeoutMs = 20000 } = {},
) {
  const rows = [];
  const held = [];
  let captured = 0;
  let captureFailed = 0;

  for (const censusRow of keptCensusRows) {
    const source = sourcesById.get(censusRow.source_id) ?? null;
    if (!source) {
      held.push({ row_id: censusRow.id, document_url: censusRow.document_url, reason: "source_not_found" });
      continue;
    }

    let identity = resolveIdentity(censusRow, source);
    let existingCapture = existingCaptureByUrl.get(censusRow.document_url) ?? null;

    if (identity.needsFrLookup) {
      if (!capture) {
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          reason: existingCapture ? "fr_type_pending_capture" : "no_capture",
        });
        continue;
      }
      const meta = await fetchFrDocumentMeta(identity.frDocumentNumber, { fetchImpl, timeoutMs });
      if (!meta.ok) {
        captureFailed += 1;
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          reason: "capture_blocked",
          http_status: meta.status,
          bytes: meta.bytes,
          head: meta.head,
          endpoint: meta.endpoint,
        });
        continue;
      }
      identity = resolveIdentity(censusRow, source, { frDocType: meta.frType });
      identity._frMeta = meta;
      if (existingCapture) existingCapture = { text: existingCapture.text, html: null, title: meta.title, titleOrigin: "fr_api_title" };
    }

    if (identity.hold) {
      held.push({
        row_id: censusRow.id,
        document_url: censusRow.document_url,
        instrument_identifier: censusRow.instrument_identifier ?? null,
        canonical_instrument_key: identity.canonicalKey ?? null,
        scheme: identity.scheme ?? null,
        host: identity.host ?? null,
        ...(identity.frType ? { fr_type: identity.frType } : {}),
        reason: identity.hold,
      });
      continue;
    }

    let captureResult = existingCapture;
    if (!captureResult) {
      if (!capture) {
        held.push({ row_id: censusRow.id, document_url: censusRow.document_url, reason: "no_capture" });
        continue;
      }
      const envelope = await resolveRowCapture(censusRow, identity, { fetchImpl, timeoutMs });
      if (!envelope || !envelope.usable) {
        captureFailed += 1;
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          reason: "capture_blocked",
          http_status: envelope?.status ?? null,
          bytes: envelope?.bytes ?? null,
          head: envelope?.head ?? null,
          endpoint: envelope?.endpoint ?? null,
        });
        continue;
      }
      captured += 1;
      captureResult = envelope;
    }

    const built = buildExportRow(censusRow, source, identity, captureResult);
    if (built.hold) held.push(built.hold);
    else rows.push(built.row);
  }

  return { rows, held, captured, captureFailed };
}

// ── summary formatting (pure) ───────────────────────────────────────────────────────────────────────

export function summarize({ eligibleCount, excludedHeldCount, rows, held, captured, captureFailed }) {
  const heldByReason = {};
  for (const h of held) heldByReason[h.reason] = (heldByReason[h.reason] ?? 0) + 1;
  const lines = [
    `export-census-rows: eligible (post filters/limit)=${eligibleCount}`,
    `  excluded_held (already have an intelligence_items row at this URL)=${excludedHeldCount}`,
    `  exported=${rows.length}`,
    `  held=${held.length}${held.length ? " -> " + Object.entries(heldByReason).map(([k, v]) => `${k}=${v}`).join(", ") : ""}`,
    `  captured=${captured} capture_failed=${captureFailed}`,
  ];
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

function usage() {
  return [
    "Usage: node scripts/mint/export-census-rows.mjs [--limit 50] [--source-id <uuid>]",
    "         [--celex-prefix 32024] [--include-held] [--capture] [--out path/to/census-rows.json]",
  ].join("\n");
}

function defaultOutPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(FSI_ROOT, "scripts", "_snapshots", `population-${ts}`, "census-rows.json");
}

function heldPathFor(outPath) {
  return outPath.replace(/\.json$/i, ".held.json");
}

/** Read `columns` from `table` for rows whose `keyColumn` is in `values`, in chunks (PostgREST `in`
 *  filters are URL-encoded; 50 keeps a chunk of long document URLs under the request-line limit). */
export async function fetchRowsIn(sb, table, columns, keyColumn, values, { chunk = 50 } = {}) {
  const out = [];
  for (let i = 0; i < values.length; i += chunk) {
    const slice = values.slice(i, i + chunk);
    const { data, error } = await sb.from(table).select(columns).in(keyColumn, slice);
    if (error) throw new Error(`fetchRowsIn(${table}) failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** Distinct values of `column` for rows whose `keyColumn` is in `values`. */
export async function fetchColumnIn(sb, table, column, keyColumn, values, opts) {
  const rows = await fetchRowsIn(sb, table, column, keyColumn, values, opts);
  return [...new Set(rows.map((r) => r[column]).filter(Boolean))];
}

export async function main() {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", default: "50" },
      "source-id": { type: "string" },
      "celex-prefix": { type: "string" },
      "include-held": { type: "boolean", default: false },
      capture: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(usage());
    return;
  }

  const limit = Number(values.limit);
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error(`export-census-rows: --limit must be a positive number (got ${JSON.stringify(values.limit)}).\n${usage()}`);
    process.exit(1);
  }

  try { process.loadEnvFile(resolve(FSI_ROOT, ".env.local")); } catch { /* CI: env injected */ }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("export-census-rows: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, readClient } = await import("../lib/db.mjs");

  // READ SHAPE (population-turn run 33631394941, 2026-09-02): the first live dry run read ALL of
  // agent_run_searches (result_url, result_content) through readAll and Postgres cancelled the statement
  // ("canceling statement due to statement timeout"): result_content is the grounding pool, full captured
  // documents per ADR-016, and the table is far larger than any batch this script exports. Reads are now
  // batch-scoped: census rows first (would_mint only), the selection applied, and only THEN the captures,
  // holder urls and sources for the selected rows, fetched by `in (...)` in chunks. Nothing here reads a
  // table it does not need whole.
  console.log("export-census-rows: reading census_worklist (would_mint)...");
  const censusRows = await readAll(
    "census_worklist",
    "id, source_id, document_url, lane, shape_class, enumeration_status, dryrun_disposition, hold_reason, surface_tags, instrument_identifier",
    { match: (q) => q.eq("dryrun_disposition", "would_mint") }, // readAll's match is a query fn (db.mjs:135), not an object
  );
  const preselected = selectCensusRows(censusRows, {
    sourceId: values["source-id"] || null,
    celexPrefix: values["celex-prefix"] || null,
    limit: null, // the held-exclusion below needs the full ordered candidate set; the limit is applied after it
  });
  const sb = readClient();
  const candidateUrls = [...new Set(preselected.map((r) => r.document_url).filter(Boolean))];
  const heldUrlSet = new Set(await fetchColumnIn(sb, "intelligence_items", "source_url", "source_url", candidateUrls));
  const excludeHeld = !values["include-held"];
  const { kept: keptAll, excludedHeld } = partitionExcludeHeld(preselected, heldUrlSet, excludeHeld);
  const kept = limit ? keptAll.slice(0, limit) : keptAll;
  const selected = preselected;

  const sourceIds = [...new Set(kept.map((r) => r.source_id).filter(Boolean))];
  const sources = await fetchRowsIn(sb, "sources", "id, url, name, base_tier, tier_override, status, institution_id, category", "id", sourceIds);
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const keptUrls = [...new Set(kept.map((r) => r.document_url).filter(Boolean))];
  const searches = await fetchRowsIn(sb, "agent_run_searches", "result_url, result_content", "result_url", keptUrls);
  const existingCaptureByUrl = new Map();
  for (const s of searches) {
    if (!s.result_url || typeof s.result_content !== "string" || s.result_content.length <= 200) continue;
    if (!existingCaptureByUrl.has(s.result_url)) existingCaptureByUrl.set(s.result_url, { text: s.result_content, html: null });
  }

  const fetchImpl = values.capture ? makePoliteFetch() : fetch;
  const { rows, held, captured, captureFailed } = await buildRows(kept, {
    sourcesById,
    existingCaptureByUrl,
    capture: values.capture,
    fetchImpl,
  });

  const outPath = resolve(values.out || defaultOutPath());
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath} (${rows.length} row(s))`);

  const heldPath = heldPathFor(outPath);
  writeFileSync(heldPath, JSON.stringify(held, null, 2) + "\n", "utf8");
  console.log(`Wrote ${heldPath} (${held.length} held row(s))`);

  console.log(summarize({ eligibleCount: selected.length, excludedHeldCount: excludedHeld.length, rows, held, captured, captureFailed }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("export-census-rows: fatal:", e);
    process.exit(1);
  });
}
