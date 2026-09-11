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
// re-fetching), where the forward-events corpus (id/claims/sections only) is not enough: the lane needs
// each item's own captured grounding pool. `--with-pool-text` reads the FULL `agent_run_searches` pool
// (`result_url`, `result_content`, column names confirmed live against migration 112's CREATE TABLE and
// migration 264's rename, keyed to items by `intelligence_item_id`) for every target item and adds a
// `pool: [{ url, text }]` array to each item `buildCorpusItems` returns. SELECT-only, and only reached
// when this flag is passed; the default (unflagged) path is byte-for-byte unchanged from before this lane,
// so `run-extraction.mjs`'s `loadCorpus()` (the other, pre-existing caller) sees no difference at all.
// `--char-budget N` (default 3,000,000) then splits the exported items into numbered `--out` parts so a
// single session lane never receives more than N characters in one file. The plan's own measurement of
// this corpus is a 1,337-to-2,590,651-char spread per item once pool text is included, wide enough that a
// handful of large items could otherwise blow well past a lane's usable context in one part. Chunking by
// character budget ONLY activates under `--with-pool-text` (see `main()`'s write step below); the
// unflagged path keeps writing exactly one file at `--out`, so no existing caller's file-count expectation
// changes. An item whose own size exceeds the budget cannot be split without breaking "the pool text the
// lane read" as one unit, so it goes alone in its own part, flagged `oversize: true` (no-silent-truncation:
// the lane still gets that item's FULL pool, just alone).
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
 * @param {{withPoolText?:boolean}} [opts] Part 3 task 3.1: when `withPoolText` is true, each returned item
 *   also carries `pool: [{url, text}]` built from `poolRows` (`result_url`/`result_content`, filtered to
 *   rows that actually have both, see this file's header, "WITH-POOL-TEXT + CHAR-BUDGET"). Default false
 *   preserves the exact pre-existing return shape (no `pool` key at all) for `run-extraction.mjs`'s
 *   `loadCorpus()`, the other caller of this function.
 * @returns {Array<{id:string, claims:object[], sections:object[], pool?:Array<{url:string,text:string}>}>}
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
      out.pool = (poolByItem.get(it.id) ?? [])
        .filter((r) => typeof r.result_url === "string" && typeof r.result_content === "string" && r.result_content.length > 0)
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

  // 1 — the item scope. --ids: EXACTLY the given items (still ANDed with verified/live — a ticket for an
  // item archived since it was queued is not re-exported), the shape corpus-turn.yml's ticket-queue
  // selection needs. Otherwise: verified/live items, optionally scoped to --since (matching
  // discover-for-items.mjs's own created_at >= since semantics — the ROW-INSERT timestamp, not the
  // editorial added_date) — the explicit-backfill-only path now that --ids is the default selection.
  let items;
  if (ids) {
    items = [];
    for (const idChunk of chunk(ids, 200)) {
      const rows = await readAll("intelligence_items", "id, created_at", {
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
    items = await readAll("intelligence_items", "id, created_at", {
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
