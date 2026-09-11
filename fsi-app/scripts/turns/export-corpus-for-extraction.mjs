#!/usr/bin/env node
// export-corpus-for-extraction.mjs — corpus-turn family (RT lane, 2026-09-01). Builds the exact
// `{ items: [...] }` corpus-file shape `scripts/forward-events/run-extraction.mjs`'s `loadCorpus()`
// consumes (see that runner's own header + `src/lib/forward-events/extract-forward-events.mjs`'s
// `@param` doc: `{ id, claims: [{claim_id, kind, text, span}], sections: [{section_id, key, md}] }` per
// item), scoped to items that CURRENTLY HAVE ZERO ROWS in `item_forward_events` (migration 274/275) —
// "items lacking events," the corpus-turn workflow's brief.
//
// READ-ONLY. This script writes only a local JSON file, never the database — uses db.mjs's `readClient()`
// (rule-015 read-only proxy: `.insert/.update/.delete/.upsert` all throw on it) so a bug here cannot
// accidentally mutate anything. The write half (`item_forward_events` inserts) is
// `apply-extraction-output.mjs`, this family's other half, and only through the guarded path.
//
// COLUMN MAPPING imports `src/lib/forward-events/read-and-extract.mjs`'s own row-mapping functions
// (`mapClaimRow`/`mapSectionRow`) and `CLAIM_KIND_FILTER` directly (lane FE-SLOT-2, 2026-09-04 — see that
// module's own header, "THE ONE READER") rather than hand-copying them a second time, so the corpus file
// this script emits is shape-identical to what that module's live per-item read would produce BY
// CONSTRUCTION, not by convention. That module reads ONE item at a time via a live `sb` client (it drives
// the extractor directly, at mint/update time); this script batches the SAME read across many items via
// `db.mjs`'s `readAll` (a different mechanism neither this script nor that module's own `sb`-shaped read
// fits — each keeps its own DB-call mechanism, per that module's header) because it only PREPARES
// run-extraction.mjs's input file — run-extraction.mjs stays the forward-events family's one canonical
// entry point and the only place that writes this family's harness artifact. Lane FE-SLOT-2 also adds the
// due_date slot claims' `context` field (that module's own "THE THIRD INPUT" header note) via the SAME
// shared `attachDueDateContext` function, over a batched `agent_run_searches` pool read below.
//
// POOL READ IS SCOPED (lane FE-SLOT-2b, 2026-09-04 — see read-and-extract.mjs's own header, "FETCH ONLY
// WHAT MIGHT BE CONSUMED"). FE-SLOT-2 batched the pool read across the WHOLE id chunk regardless of
// whether any of those items even had a due_date claim; `agent_run_searches.result_content` is the full
// grounding source pool per ADR-016, never truncated, so that was tens of KB per capture times several
// captures times every item in scope — measured live this lane, project kwrsbpiseruzbfwjpvsp: the whole
// table is 6,037 rows / ~617 MB, but only 118 of the 1,875 items that carry any pool rows at all have a
// `[due_date]` claim whose span even has a calendar year in it (2.2% of the bytes), and fewer still would
// ever have that context actually consulted (see `claimNeedsDueDateContext`'s own doc). This script now
// computes `itemIdsNeedingContext(claims)` over each chunk's OWN claim rows and reads the pool only for
// that subset — chunked at the same 200-id size this script already uses for everything else.
//
// WITH-POOL-TEXT + CHAR-BUDGET (Part 3 task 3.1, W9 brief-chain plan 2026-09-11): a second, opt-in
// consumer of this same exporter, a session lane authoring a brief from stored source text (never
// re-fetching), where the forward-events corpus (id/claims/sections only) is not enough. `--with-pool-text`
// additionally exports, per item: `title`, `item_type`, `format_type`, `jurisdiction_iso`,
// `canonical_instrument_key`, `source_id`, `source_url` (plain pass-through of the intelligence_items
// row's own columns, read in the same query as `id`/`created_at`; a stub item's `format_type` can be null,
// never derived here, format-derivation is a separate concern, task 2.4's `specForItemType` backfill),
// `required_slots` (the item_type's slot_key list, read from `item_type_required_slots` with the SAME
// query shape `canonical-pipeline.ts`'s own `requiredSlotsFor`/grounding read uses:
// `.select("slot_key", ...).eq("item_type", ...)`, batched via `.in("item_type", ...)` across the distinct
// item_types in scope rather than one call per item type), and the FULL `agent_run_searches` pool
// (`result_url`, `result_content`, column names confirmed live against migration 112's CREATE TABLE and
// migration 264's rename, keyed to items by `intelligence_item_id`), filtered to the SAME "usable capture"
// floor `read-and-extract.mjs`'s own `usableCapturesOrdered` already enforces (trimmed length > 200 chars,
// the floor `canonical-pipeline.ts` uses to decide whether a captured row is real evidence at all) so the
// exported pool is exactly what the pipeline itself would treat as grounding-worthy, never a second,
// drifting copy of that threshold. All of this lands on each item `buildCorpusItems` returns as
// `pool: [{ url, text }]` plus the eight metadata/slot fields above. SELECT-only, and every one of these
// reads (and every one of these output fields) is reached ONLY when this flag is passed; the default
// (unflagged) path is byte-for-byte unchanged from before this lane, so `run-extraction.mjs`'s
// `loadCorpus()` (the other, pre-existing caller, confirmed by re-reading it: it only reads
// `items[].claims`/`items[].sections`) sees no difference at all.
// `--char-budget N` (default 3,000,000) then splits the exported items into numbered `--out` parts so a
// single session lane never receives more than N characters in one file. The plan's own measurement of
// this corpus is a 1,337-to-2,590,651-char spread per item once pool text is included, wide enough that a
// handful of large items could otherwise blow well past a lane's usable context in one part. Chunking by
// character budget ONLY activates under `--with-pool-text` (see `main()`'s write step below); the
// unflagged path keeps writing exactly one file at `--out`, so no existing caller's file-count expectation
// changes. An item whose own size exceeds the budget cannot be split without breaking "the pool text the
// lane read" as one unit, so it goes alone in its own part, flagged `oversize: true` (no-silent-truncation:
// the lane still gets that item's FULL pool, just alone). The per-item size is the JSON character count of
// the WHOLE exported item (`JSON.stringify(it).length`, computed in `main()`'s write step, after all of
// the above fields are already on the object), so the budget covers everything a part actually carries,
// not just the pool text.
//
// Usage:
//   node scripts/turns/export-corpus-for-extraction.mjs --out path.json [--since ISO-date] [--limit N]
//   node scripts/turns/export-corpus-for-extraction.mjs --out path.json --ids <uuid,uuid,...> [--limit N]
//   node scripts/turns/export-corpus-for-extraction.mjs --out path.json --ids <uuid,...> --with-pool-text [--char-budget N]
//
// SELECTION (lane TURNREQ, 2026-09-04): --ids scopes the export to EXACTLY the given
// intelligence_items.id list (still ANDed with the verified/live filter below — a ticket for an item
// that has since been archived is not re-exported) — the shape corpus-turn.yml's ticket-queue selection
// (scripts/turns/consume-turn-requests.mjs) needs, matching discover-for-items.mjs's own --ids contract.
// --since is unchanged: the pre-ticket, date-scoped mechanism, kept ONLY as an explicit backfill override
// (see CORPUS-TURN-RUNBOOK.md). --ids and --since are mutually exclusive (ambiguous selection otherwise,
// same rule discover-for-items.mjs's own parseArgs enforces for the identical pair of flags).
// Exit 0 (writes --out, even for 0 matched items — an empty corpus is a valid, honestly-reported outcome,
//   not a script failure) · 1 bad args · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, parse, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAIM_KIND_FILTER,
  mapClaimRow,
  mapSectionRow,
  attachDueDateContext,
  itemIdsNeedingContext,
  usableCapturesOrdered,
} from "../../src/lib/forward-events/read-and-extract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const DEFAULT_LIMIT = 10000; // well above today's corpus size (~a few hundred items); an explicit,
// bounded default rather than an unbounded read — mirrors dateRange's 366-day cap and discover-for-items'
// --limit default, this codebase's standing "no silently unbounded sweep" convention.

const DEFAULT_CHAR_BUDGET = 3_000_000; // Part 3 task 3.1, see this file's header, "WITH-POOL-TEXT +
// CHAR-BUDGET." Only consulted when --with-pool-text is set.

function usage() {
  return (
    "Usage: node scripts/turns/export-corpus-for-extraction.mjs --out path.json [--since ISO-date] [--limit N]\n" +
    "       node scripts/turns/export-corpus-for-extraction.mjs --out path.json --ids <uuid,uuid,...> [--limit N]\n" +
    "       node scripts/turns/export-corpus-for-extraction.mjs --out path.json --ids <uuid,...> --with-pool-text [--char-budget N]"
  );
}

/** Pure CLI arg parse/validate. @param {string[]} argv @returns {{ok:true,out:string,since:string|null,ids:string[]|null,limit:number,withPoolText:boolean,charBudget:number}|{ok:false,error:string}} */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        out: { type: "string" },
        since: { type: "string" },
        limit: { type: "string" },
        ids: { type: "string" },
        "with-pool-text": { type: "boolean" },
        "char-budget": { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.out) return { ok: false, error: "--out <path.json> is required." };
  if (values.ids !== undefined && values.since !== undefined) {
    return { ok: false, error: "pass --ids OR --since, not both (ambiguous selection)." };
  }
  if (values.since && Number.isNaN(Date.parse(values.since))) {
    return { ok: false, error: `--since value is not a parseable date: ${JSON.stringify(values.since)}` };
  }
  let ids = null;
  if (values.ids !== undefined) {
    ids = values.ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return { ok: false, error: "--ids requires at least one uuid." };
  }
  const limit = values.limit ? Number(values.limit) : DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: false, error: `--limit must be a positive number, got ${JSON.stringify(values.limit)}` };
  }
  const charBudget = values["char-budget"] ? Number(values["char-budget"]) : DEFAULT_CHAR_BUDGET;
  if (!Number.isFinite(charBudget) || charBudget <= 0) {
    return { ok: false, error: `--char-budget must be a positive number, got ${JSON.stringify(values["char-budget"])}` };
  }
  const withPoolText = values["with-pool-text"] === true;
  return { ok: true, out: values.out, since: values.since || null, ids, limit, withPoolText, charBudget };
}

/** Split an array into chunks of at most `size` (pure). @param {Array} arr @param {number} size */
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Groups items into numbered parts so no part's total `size` exceeds `budget`, preserving input order.
 * PURE, no I/O, no knowledge of the corpus-item shape beyond a numeric `size` field the caller computes
 * (e.g. `JSON.stringify(item).length`); this is what lets the chunking test run with no database (Part 3
 * task 3.1's own interface note). An item whose OWN size exceeds the budget cannot share a part with
 * anything else without breaking "one part = the pool text the lane actually reads", so it goes ALONE in
 * its own part, flagged `oversize: true` (that part's own total then exceeds `budget`; this is the
 * documented escape hatch, never a defect: the item still carries its FULL content, never truncated).
 * @param {Array<{size:number}>} items
 * @param {number} budget
 * @returns {Array<{part:number, items:Array, oversize?:true}>}
 */
export function chunkByCharBudget(items, budget) {
  const parts = [];
  let current = [];
  let currentSize = 0;
  const flushCurrent = () => {
    if (current.length) {
      parts.push({ items: current });
      current = [];
      currentSize = 0;
    }
  };
  for (const it of items) {
    if (it.size > budget) {
      flushCurrent();
      parts.push({ items: [it], oversize: true });
      continue;
    }
    if (current.length && currentSize + it.size > budget) flushCurrent();
    current.push(it);
    currentSize += it.size;
  }
  flushCurrent();
  return parts.map((p, i) => ({ part: i + 1, ...p }));
}

/**
 * Group flat claim/section/pool rows by their parent item id and merge into the corpus-item shape — the
 * per-row mapping itself is `read-and-extract.mjs`'s own `mapClaimRow`/`mapSectionRow` (lane FE-SLOT-2,
 * 2026-09-04 — see this file's own header, "COLUMN MAPPING"), never re-typed here; due_date slot claims
 * gain `context` via that module's own `attachDueDateContext`, over this item's own `poolRows` slice.
 * PURE — no I/O. @param {{id:string}[]} items @param {{intelligence_item_id:string}[]} claimRows
 * @param {{item_id:string}[]} sectionRows @param {{intelligence_item_id:string}[]} poolRows
 * @param {{withPoolText?:boolean}} [opts] Part 3 task 3.1 (Fix round 1): when `withPoolText` is true, each
 *   returned item ALSO carries: `title`, `item_type`, `format_type`, `jurisdiction_iso`,
 *   `canonical_instrument_key`, `source_id`, `source_url` (plain pass-through of the matching field on
 *   `items[]`, defaulting to `null` when absent) and `required_slots` (plain pass-through of `it.required_slots`,
 *   defaulting to `[]`; `main()` attaches this before calling, from the SAME `item_type_required_slots`
 *   query shape `canonical-pipeline.ts` uses); plus `pool: [{url, text}]` built from `poolRows`, filtered to
 *   the SAME "usable capture" floor `read-and-extract.mjs`'s own `usableCapturesOrdered` enforces (trimmed
 *   `result_content` length > 200 chars, `MIN_USABLE_POOL_CHARS`; reused via that exported function rather
 *   than a second copy of the threshold) and to rows that also carry a `result_url` (a capture with no URL
 *   cannot be cited back). Default `withPoolText: false` preserves the exact pre-existing return shape (no
 *   extra keys at all, byte-identical to before this lane) for `run-extraction.mjs`'s `loadCorpus()`, the
 *   other, pre-existing caller of this function (confirmed by re-reading that runner: it reads only
 *   `item.claims`/`item.sections`, so extra keys were always harmless there too, but this exporter still
 *   NEVER adds them on that path, keeping the two callers' outputs provably distinct rather than relying on
 *   the consumer's tolerance).
 * @returns {Array<{id:string, claims:object[], sections:object[], title?:string|null, item_type?:string|null,
 *   format_type?:string|null, jurisdiction_iso?:string|null, canonical_instrument_key?:string|null,
 *   source_id?:string|null, source_url?:string|null, required_slots?:string[], pool?:Array<{url:string,text:string}>}>}
 */
export function buildCorpusItems(items, claimRows, sectionRows, poolRows = [], opts = {}) {
  const { withPoolText = false } = opts;
  const claimsByItem = new Map();
  for (const r of claimRows) {
    const list = claimsByItem.get(r.intelligence_item_id) ?? [];
    list.push(mapClaimRow(r));
    claimsByItem.set(r.intelligence_item_id, list);
  }
  const sectionsByItem = new Map();
  for (const r of sectionRows) {
    const list = sectionsByItem.get(r.item_id) ?? [];
    list.push(mapSectionRow(r));
    sectionsByItem.set(r.item_id, list);
  }
  const poolByItem = new Map();
  for (const r of poolRows) {
    const list = poolByItem.get(r.intelligence_item_id) ?? [];
    list.push(r);
    poolByItem.set(r.intelligence_item_id, list);
  }
  return items.map((it) => {
    const out = {
      id: it.id,
      claims: attachDueDateContext(claimsByItem.get(it.id) ?? [], poolByItem.get(it.id) ?? []),
      sections: sectionsByItem.get(it.id) ?? [],
    };
    if (withPoolText) {
      out.title = it.title ?? null;
      out.item_type = it.item_type ?? null;
      out.format_type = it.format_type ?? null;
      out.jurisdiction_iso = it.jurisdiction_iso ?? null;
      out.canonical_instrument_key = it.canonical_instrument_key ?? null;
      out.source_id = it.source_id ?? null;
      out.source_url = it.source_url ?? null;
      out.required_slots = it.required_slots ?? [];
      out.pool = usableCapturesOrdered(poolByItem.get(it.id) ?? [])
        .filter((r) => typeof r.result_url === "string")
        .map((r) => ({ url: r.result_url, text: r.result_content }));
    }
    return out;
  });
}

if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`export-corpus-for-extraction: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("export-corpus-for-extraction: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const { readAll } = await import("../lib/db.mjs");
  const { out, since, ids, limit, withPoolText, charBudget } = parsed;

  // Fix round 1 (reviewer, 2026-09-11): the Interfaces section's per-item shape needs 8 more
  // intelligence_items columns than the forward-events family's own id/created_at read. Selected ONLY
  // under --with-pool-text (kept off the default path so a routine, possibly much larger, forward-events
  // export never pays for columns loadCorpus's caller never reads, confirmed by re-reading
  // scripts/forward-events/run-extraction.mjs: it reads only item.claims/item.sections). Column names are
  // the same ones src/lib/supabase-server.ts's own RESOURCE_COLUMNS selects (title, item_type, source_id,
  // source_url, jurisdiction_iso) and src/lib/agent/canonical-pipeline.ts's own item read at :958/:1063
  // (canonical_instrument_key); format_type is passed through as stored (null on a never-generated stub,
  // never derived here, that backfill is task 2.4's specForItemType concern, not this exporter's).
  const ITEM_COLUMNS = withPoolText
    ? "id, created_at, title, item_type, format_type, jurisdiction_iso, canonical_instrument_key, source_id, source_url"
    : "id, created_at";

  // 1 — the item scope. --ids: EXACTLY the given items (still ANDed with verified/live — a ticket for an
  // item archived since it was queued is not re-exported), the shape corpus-turn.yml's ticket-queue
  // selection needs. Otherwise: verified/live items, optionally scoped to --since (matching
  // discover-for-items.mjs's own created_at >= since semantics — the ROW-INSERT timestamp, not the
  // editorial added_date) — the explicit-backfill-only path now that --ids is the default selection.
  let items;
  if (ids) {
    items = [];
    for (const idChunk of chunk(ids, 200)) {
      const rows = await readAll("intelligence_items", ITEM_COLUMNS, {
        // fitness-allow: F39 (already chunked above (idChunk/slice pattern) — bounded per chunk, not corpus-scale)
        match: (q) => q.in("id", idChunk).eq("provenance_status", "verified").eq("is_archived", false),
      });
      items.push(...rows);
    }
    const foundIds = new Set(items.map((it) => it.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) {
      console.log(
        `export-corpus-for-extraction: ${missing.length} of ${ids.length} requested id(s) matched no ` +
        `verified/live item (already archived, or not found) — exported anyway for the rest.`
      );
    }
  } else {
    items = await readAll("intelligence_items", ITEM_COLUMNS, {
      match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
    });
    if (since) {
      const sinceMs = Date.parse(since);
      items = items.filter((it) => it.created_at && Date.parse(it.created_at) >= sinceMs);
    }
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (items.length > limit) items = items.slice(0, limit);

  // 2 — items that ALREADY carry ≥1 forward event — excluded (the family's own idempotency guarantee,
  // PROTOCOL.md §4, means a re-extraction would just reproduce identical rows apply-extraction-output.mjs
  // would then skip anyway; scoping the export itself keeps a routine turn's corpus small and honest
  // about what it actually re-processed). IRRELEVANT under --with-pool-text (Part 3 task 3.1's
  // brief-authoring export): that consumer cares about brief content, not forward-event status. A stub
  // item that already carries forward events still needs a brief, so this filter (and the query behind
  // it) is skipped entirely for that path; --ids/--since already scoped the batch to exactly what was
  // asked for.
  let targetItems;
  if (withPoolText) {
    targetItems = items;
  } else {
    const existingEventRows = await readAll("item_forward_events", "intelligence_item_id");
    const itemsWithEvents = new Set(existingEventRows.map((r) => r.intelligence_item_id));
    targetItems = items.filter((it) => !itemsWithEvents.has(it.id));
  }

  console.log(
    `export-corpus-for-extraction: ${items.length} verified/live item(s) in scope` +
    `${since ? ` (created_at >= ${since})` : ids ? ` (${ids.length} requested id(s))` : ""}; ` +
    (withPoolText
      ? `${targetItems.length} target(s) for pool-text export (--with-pool-text: forward-event status not filtered).`
      : `${targetItems.length} lack any item_forward_events row.`)
  );

  // 2b: required_slots per item (Fix round 1, --with-pool-text only). The SAME query shape
  // canonical-pipeline.ts's own requiredSlotsFor/grounding read uses against item_type_required_slots
  // (.select("slot_key", ...).eq("item_type", ...)), batched here across the distinct item_types actually
  // in scope (rarely more than a handful) via .in("item_type", ...) rather than one call per item type or
  // per item. An item_type with no rows in the table (never happens for the 12 live types, but no read
  // here assumes the DB matches code) gets required_slots: [], never guessed.
  const requiredSlotsByType = new Map();
  if (withPoolText) {
    const itemTypes = [...new Set(targetItems.map((it) => it.item_type).filter(Boolean))];
    if (itemTypes.length) {
      const slotRows = await readAll("item_type_required_slots", "item_type, slot_key", {
        // itemTypes is a Set-deduplicated list of item_type VALUES, not per-row ids; migration 004's
        // CHECK (item_type IN (...)) fixes the whole vocabulary at 12 values, so this list can never
        // exceed 12 elements no matter how large targetItems is.
        // fitness-allow: F39 (bounded by the fixed 12-value item_type vocabulary, not by input size)
        match: (q) => q.in("item_type", itemTypes),
      });
      for (const r of slotRows) {
        const list = requiredSlotsByType.get(r.item_type) ?? [];
        list.push(r.slot_key);
        requiredSlotsByType.set(r.item_type, list);
      }
    }
    targetItems = targetItems.map((it) => ({
      ...it,
      required_slots: requiredSlotsByType.get(it.item_type) ?? [],
    }));
  }

  // 3 — batched claim/section reads for the target items only (chunked .in() — PostgREST/pg IN-list
  // limits and payload size both bounded by a modest chunk size). The pool read (lane FE-SLOT-2,
  // 2026-09-04, scoped by lane FE-SLOT-2b, 2026-09-04 — see this file's own header, "POOL READ IS
  // SCOPED") is over the SAME `agent_run_searches` table `read-and-extract.mjs`'s live reader consults
  // for due_date slot context, but ONLY for the ids within this chunk whose claims actually need it
  // (`itemIdsNeedingContext`) — never the whole chunk.
  const targetIds = targetItems.map((it) => it.id);
  const claimRows = [];
  const sectionRows = [];
  const poolRows = [];
  for (const idChunk of chunk(targetIds, 200)) {
    if (!idChunk.length) continue;
    const claims = await readAll("section_claim_provenance", "id, intelligence_item_id, claim_kind, claim_text, source_span", {
      // fitness-allow: F39 (already chunked above (idChunk/slice pattern) — bounded per chunk, not corpus-scale)
      match: (q) => q.in("intelligence_item_id", idChunk).in("claim_kind", CLAIM_KIND_FILTER),
    });
    claimRows.push(...claims);
    const sections = await readAll("intelligence_item_sections", "id, item_id, section_key, content_md", {
      // fitness-allow: F39 (already chunked above (idChunk/slice pattern) — bounded per chunk, not corpus-scale)
      match: (q) => q.in("item_id", idChunk),
    });
    sectionRows.push(...sections);

    if (withPoolText) {
      // Part 3 task 3.1: --with-pool-text is an explicit, deliberate request for the FULL grounding pool
      // of every item in scope (never the itemIdsNeedingContext-scoped subset lane FE-SLOT-2b uses below),
      // read once here, and the SAME rows are reused for both attachDueDateContext (via buildCorpusItems)
      // and the item-level `pool` field. `result_url` is included (the due-date-context-only path below
      // never needs it): column names confirmed live against migration 112's CREATE TABLE and migration
      // 264's result_content rename; keyed to items by intelligence_item_id.
      const pool = await readAll("agent_run_searches", "id, intelligence_item_id, result_content, result_url, result_index", {
        // fitness-allow: F39 (already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale)
        match: (q) => q.in("intelligence_item_id", idChunk),
      });
      poolRows.push(...pool);
    } else {
      const contextIds = [...itemIdsNeedingContext(claims)];
      for (const contextIdChunk of chunk(contextIds, 200)) {
        if (!contextIdChunk.length) continue;
        const pool = await readAll("agent_run_searches", "id, intelligence_item_id, result_content, result_index", {
          // fitness-allow: F39 (already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale)
          match: (q) => q.in("intelligence_item_id", contextIdChunk),
        });
        poolRows.push(...pool);
      }
    }
  }

  const corpusItems = buildCorpusItems(targetItems, claimRows, sectionRows, poolRows, { withPoolText });
  const withContent = corpusItems.filter((it) => it.claims.length || it.sections.length).length;
  console.log(
    `export-corpus-for-extraction: ${corpusItems.length} item(s) exported (${withContent} carry ≥1 FACT/GAP ` +
    `claim or section; the rest are ungrounded stubs the extractor will correctly emit 0 events for).`
  );

  // --with-pool-text: split into numbered, char-budgeted parts (this file's header, "WITH-POOL-TEXT +
  // CHAR-BUDGET"). Never the single-file write below, which stays byte-for-byte what run-extraction.mjs's
  // loadCorpus() has always received. Each item's `size` is its own JSON character count (pool text
  // dominates it), computed here rather than inside the pure chunker so chunkByCharBudget stays a plain
  // items-with-sizes-in, parts-out function with no corpus-item-shape knowledge (this file's own test
  // exercises it standalone, no database).
  if (withPoolText) {
    const sized = corpusItems.map((it) => ({ ...it, size: JSON.stringify(it).length }));
    const parts = chunkByCharBudget(sized, charBudget);
    const outPath = resolve(out);
    mkdirSync(dirname(outPath), { recursive: true });
    const { dir, name, ext } = parse(outPath);
    const oversizeCount = parts.filter((p) => p.oversize).length;
    for (const p of parts) {
      const partPath = join(dir, `${name}-part${p.part}${ext || ".json"}`);
      const partItems = p.items.map(({ size, ...rest }) => rest); // strip the internal size field
      const body = { part: p.part, items: partItems, ...(p.oversize ? { oversize: true } : {}) };
      writeFileSync(partPath, JSON.stringify(body, null, 2) + "\n", "utf8");
      console.log(
        `Wrote ${partPath} (${partItems.length} item(s), ${p.items.reduce((n, it) => n + it.size, 0)} char(s)` +
        `${p.oversize ? ", OVERSIZE: exceeds --char-budget on its own, exported whole anyway" : ""})`
      );
    }
    console.log(
      `export-corpus-for-extraction: ${parts.length} part(s) written under --char-budget ${charBudget}` +
      `${oversizeCount ? ` (${oversizeCount} oversize part(s))` : ""}.`
    );
    process.exit(0);
  }

  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ items: corpusItems }, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
  process.exit(0);
}
