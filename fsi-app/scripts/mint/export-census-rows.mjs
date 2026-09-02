#!/usr/bin/env node
// export-census-rows.mjs — the census-worklist exporter Lane POP's record-tier population plan named as
// the one piece it could not build inside its earlier write set
// (docs/plans/record-tier-population-plan-2026-09-01.md §3: "Building this array from the live
// census_worklist + sources + agent_run_searches tables is a SQL join a DB-connected caller runs ... not
// a pure, DB-less script, and therefore out of run-mint-batch.mjs's own scope"). This script IS that
// join, plus the two things §3 named as open items for "whoever writes the exporter": item_type
// derivation (§3 point 4) and a capture pass for rows with no existing agent_run_searches text.
//
// WHAT IT DOES, per row of census_worklist WHERE dryrun_disposition = 'would_mint':
//   1. Join sources on source_id (id/url/base_tier/tier_override/status/institution_id/category/name).
//   2. Join agent_run_searches on result_url = document_url, requiring >200 chars result_content (the
//      live-confirmed shape: 680 of 3,661 would_mint rows have this today).
//   3. --capture: for a row with NO such capture, politely fetch document_url ($0, no LLM) and derive
//      captured_text from the HTML. No capture and no --capture -> held "no_capture".
//   4. item_type from the CELEX shape of the row's canonical_instrument_key (derived via THE canonical
//      derivation this repo already ships, scripts/lib/canonical-key.mjs's deriveKey — imported, never
//      re-implemented; see backfill-canonical-keys.mjs's own header for why a second mirror is
//      forbidden). Sector-3 CELEX type letters: R -> item_type "regulation", L -> "directive". The type
//      letter D (EU decisions) does NOT map to item_type "decision" — "decision" is not a legal value of
//      intelligence_items.item_type (migration 004's CHECK constraint enumerates exactly: regulation,
//      directive, standard, guidance, technology, market_signal, regional_data, research_finding,
//      innovation, framework, tool, initiative — no "decision", no "law" despite domains.ts's comment
//      naming "law" as a historical/legacy value). record-tier-population-plan-2026-09-01.md §3 point 4
//      named exactly this option as "(b) default every WO26-in-scope EUR-Lex row to the CELEX-instrument-
//      type mapping already used at mint time (regulation/directive/decision->initiative, etc.)" and
//      flagged it as "an open item for whoever writes the exporter -- record it, do not silently
//      default." This is that recorded decision: D -> item_type "initiative" (domainForItemType routes
//      initiative+category='regulatory' to the Regulations domain, matching what a decision instrument
//      actually is). Any other letter, or a key this repo's own deriver cannot resolve at all, holds
//      "item_type_unmapped" / "canonical_key_unresolved" rather than guessing.
//   5. canonical_instrument_key itself: the SAME import (deriveKey), never a second regex.
//   6. title: when a fresh --capture fetch returned HTML, the document's own <title>/first <h1> (verbatim,
//      html-stripped); otherwise (an existing agent_run_searches capture -- already plain text, no markup
//      to read a title from -- or a fetch that carried neither tag) the source's registered name plus the
//      instrument identifier. `title_origin` records which, honestly, per row.
//   7. --exclude-held (default ON; --include-held turns it off): a row whose document_url already has AN
//      intelligence_items.source_url row -- archived or not -- is excluded before export (not merely
//      held), with the excluded count reported. This is the "31 of 680 have no item at that source_url"
//      live measurement's inverse: nothing this script emits duplicates an existing item at its own URL
//      (the apply script's M4 pre-check catches the CANONICAL-KEY collision case separately -- a
//      different key at a different URL naming the same instrument).
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
// contract -- an extra field is never rejected).
//
// USAGE:
//   node scripts/mint/export-census-rows.mjs [--limit 50] [--source-id <uuid>] [--celex-prefix 32024]
//        [--include-held] [--capture] [--out path/to/census-rows.json]
//
// Zero DB writes. Reads via scripts/lib/db.mjs's readAll (paginated, capped-read-safe). --capture makes
// real outbound HTTP GETs to census_worklist.document_url values only -- never a DB write, never an LLM
// call, $0.

import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey } from "../lib/canonical-key.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

// ── pure helpers (unit-tested directly, no I/O) ─────────────────────────────────────────────────────

/**
 * item_type from a CELEX-shaped canonical_instrument_key ("3YYYY<letter>NNNN[(NN)]"). Pure. See this
 * file's header for why D -> "initiative" (not "decision" -- not a legal item_type) is a deliberate,
 * recorded lane decision, not a silent default.
 * @param {string|null} canonicalKey
 * @returns {{itemType: string|null, hold: string|null}}
 */
export function classifyItemTypeFromCelexKey(canonicalKey) {
  if (typeof canonicalKey !== "string" || !/^3\d{4}[A-Z]\d{4}/.test(canonicalKey)) {
    return { itemType: null, hold: "canonical_key_unresolved" };
  }
  const letter = canonicalKey.charAt(5);
  const MAP = { R: "regulation", L: "directive", D: "initiative" };
  const itemType = MAP[letter] ?? null;
  return itemType ? { itemType, hold: null } : { itemType: null, hold: "item_type_unmapped" };
}

/** Strip HTML to plain text. Mirrors src/lib/sources/canonical-fetch.mjs's inline `stripText` (that
 *  function is not exported, so this is a documented re-implementation of the SAME two-line pattern, not
 *  a second design -- see this file's header). Also decodes the handful of entities a raw (un-browser-
 *  rendered) fetch leaves undecoded. Pure. */
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

/** Select the would_mint census rows this run will consider, in order: disposition filter, then the
 *  optional --source-id / --celex-prefix narrowing, then --limit. Pure. */
export function selectCensusRows(censusRows, { sourceId = null, celexPrefix = null, limit = 50 } = {}) {
  return (censusRows ?? [])
    .filter((r) => r?.dryrun_disposition === "would_mint")
    .filter((r) => !sourceId || r.source_id === sourceId)
    .filter((r) => !celexPrefix || String(r.instrument_identifier ?? "").startsWith(celexPrefix))
    .slice(0, limit);
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
 * Build one enriched export row (or a hold record) from a census_worklist row plus its resolved source
 * and captured text. Pure -- every input is already resolved by the caller (no I/O in here).
 * @param {object} censusRow census_worklist row (id, document_url, instrument_identifier, ...)
 * @param {object|null} source the resolved `sources` row, or null if none was found
 * @param {{text:string|null, html:string|null}} capture the resolved capture: `text` is what becomes
 *   captured_text (either an existing agent_run_searches.result_content or freshly html-stripped fetch
 *   text); `html` is the raw fetched HTML when this row was freshly captured (null for an existing
 *   agent_run_searches capture, which is already plain text with no markup to read a title from).
 * @returns {{row:object}|{hold:object}}
 */
export function buildExportRow(censusRow, source, capture) {
  const rowId = censusRow?.id ?? null;
  const documentUrl = censusRow?.document_url ?? null;

  if (!source) {
    return { hold: { row_id: rowId, document_url: documentUrl, reason: "source_not_found" } };
  }

  const canonicalKey = deriveKey(censusRow?.instrument_identifier ?? null, documentUrl);
  const { itemType, hold: typeHold } = classifyItemTypeFromCelexKey(canonicalKey);
  if (typeHold) {
    return {
      hold: {
        row_id: rowId,
        document_url: documentUrl,
        instrument_identifier: censusRow?.instrument_identifier ?? null,
        canonical_instrument_key: canonicalKey,
        reason: typeHold,
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

  let title = null, titleOrigin = null;
  if (capture?.html) {
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
      item_type: itemType,
      title,
      title_origin: titleOrigin,
      instrument_identifier: censusRow?.instrument_identifier ?? null,
      canonical_instrument_key: canonicalKey,
      // Every mappable item_type here comes from a sector-3 CELEX key, i.e. an EU instrument.
      jurisdiction_iso: "EU",
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

/** Build the { rows, held } arrays for every kept census row, given lookup maps for source and existing
 *  capture text. Rows with no existing capture are handed to `resolveCapture` (async, injected) ONLY when
 *  `capture` is true; otherwise they hold "no_capture" immediately. Returns counts alongside the arrays
 *  so the CLI summary and the tests share one source of truth. */
export async function buildRows(
  keptCensusRows,
  { sourcesById, existingCaptureByUrl, capture = false, resolveCapture = null } = {},
) {
  const rows = [];
  const held = [];
  let captured = 0;
  let captureFailed = 0;

  for (const censusRow of keptCensusRows) {
    const source = sourcesById.get(censusRow.source_id) ?? null;
    let captureResult = existingCaptureByUrl.get(censusRow.document_url) ?? null;

    if (!captureResult) {
      if (!capture) {
        held.push({ row_id: censusRow.id, document_url: censusRow.document_url, reason: "no_capture" });
        continue;
      }
      const fetched = await resolveCapture(censusRow.document_url);
      if (!fetched || !fetched.ok) {
        captureFailed += 1;
        held.push({
          row_id: censusRow.id,
          document_url: censusRow.document_url,
          reason: "capture_failed",
          http_status: fetched?.status ?? null,
          error: fetched?.error ?? null,
        });
        continue;
      }
      captured += 1;
      captureResult = { text: fetched.text, html: fetched.html };
    }

    const built = buildExportRow(censusRow, source, captureResult);
    if (built.hold) held.push(built.hold);
    else rows.push(built.row);
  }

  return { rows, held, captured, captureFailed };
}

// ── live capture (network; injected fetch so tests never hit the network) ──────────────────────────

/** Politely fetch one URL and reduce it to { ok, status, text, html, error }. `fetchImpl` defaults to
 *  the global fetch; a caller may inject a stub for tests. Times out at `timeoutMs` (default 20000). */
export async function captureDocument(url, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "user-agent": "FSI-population-turn/1.0 (+population-turn)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
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

/** A rate-limited capture function bound to one politeness gap (POPULATION_FETCH_GAP_MS, default
 *  1000ms), matching run-source-sweep.mjs's politeFetch discipline (1 req/s, never a burst). Returns an
 *  async fn(url) suitable as `buildRows`'s `resolveCapture`. */
export function makePoliteCapture({ gapMs = Number(process.env.POPULATION_FETCH_GAP_MS ?? 1000), fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  let lastFetchAt = 0;
  return async function politeCapture(url) {
    const wait = lastFetchAt + gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return captureDocument(url, { fetchImpl, timeoutMs });
  };
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

async function main() {
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
  const { readAll } = await import("../lib/db.mjs");

  console.log("export-census-rows: reading census_worklist (would_mint), sources, agent_run_searches, intelligence_items...");
  const [censusRows, sources, searches, items] = await Promise.all([
    readAll("census_worklist", "id, source_id, document_url, lane, shape_class, enumeration_status, dryrun_disposition, hold_reason, surface_tags, instrument_identifier"),
    readAll("sources", "id, url, name, base_tier, tier_override, status, institution_id, category"),
    readAll("agent_run_searches", "result_url, result_content"),
    readAll("intelligence_items", "source_url"),
  ]);

  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const heldUrlSet = new Set(items.map((i) => i.source_url).filter(Boolean));
  const existingCaptureByUrl = new Map();
  for (const s of searches) {
    if (!s.result_url || typeof s.result_content !== "string" || s.result_content.length <= 200) continue;
    if (!existingCaptureByUrl.has(s.result_url)) existingCaptureByUrl.set(s.result_url, { text: s.result_content, html: null });
  }

  const selected = selectCensusRows(censusRows, {
    sourceId: values["source-id"] || null,
    celexPrefix: values["celex-prefix"] || null,
    limit,
  });
  const excludeHeld = !values["include-held"];
  const { kept, excludedHeld } = partitionExcludeHeld(selected, heldUrlSet, excludeHeld);

  const resolveCapture = values.capture ? makePoliteCapture() : null;
  const { rows, held, captured, captureFailed } = await buildRows(kept, {
    sourcesById,
    existingCaptureByUrl,
    capture: values.capture,
    resolveCapture,
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
