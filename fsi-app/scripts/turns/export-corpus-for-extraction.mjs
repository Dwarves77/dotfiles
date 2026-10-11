#!/usr/bin/env node
// `@param` doc: `{ id, claims: [{claim_id, kind, text, span}], sections: [{section_id, key, md}] }` per

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
// Task 3.3 fix round 1 (coordinator ruling, rule 13: no cross-lane deferral): the SAME pool-identity hash
// generateBriefFromInjected (src/lib/agent/canonical-pipeline.ts) re-computes at write time to detect a
// stale pool. Imported here (never re-implemented) so the two sides of the seam cannot drift: see that
// module's own header for why it is a standalone leaf (neither this script nor canonical-pipeline.ts
// imports the other) and for the exact canonical input this exporter and that seam must both feed it: the
// item's usable-capture pool (usableCapturesOrdered's own 200-char floor) filtered to rows carrying a
// string result_url, mapped to `{url, text}` from `result_url`/`result_content` -- i.e. precisely the
// `pool` array this file already builds below, unmodified, passed straight through.
import { hashSourcePool } from "../../src/lib/agent/source-pool-hash.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";

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
 *   cannot be cited back); plus `source_pool_hash: hashSourcePool(pool)` (task 3.3 fix round 1) -- the
 *   sha256 identity of THAT SAME `pool` array, via the one shared helper the injected-synthesis write site
 *   re-computes at persist time, so a lane's echoed hash and this exporter's stamped hash are provably the
 *   same function over the same input, never two hand-aligned copies. Default `withPoolText: false`
 *   preserves the exact pre-existing return shape for the 8 pool-text/metadata keys above (none of them
 *   present, byte-identical to before this lane) for `run-extraction.mjs`'s `loadCorpus()`, the other,
 *   pre-existing caller of this function (confirmed by re-reading that runner: it reads only
 *   `item.claims`/`item.sections`, so extra keys were always harmless there too, but this exporter still
 *   never adds those 8 on that path, keeping the two callers' outputs provably distinct rather than
 *   relying on the consumer's tolerance). The ONE exception, added by D1 below, is `provenance_status`,
 *   present on both paths.
 * `forwardEventRows`/`timelineRows` (task 6.2b, brief-chain-build-plan-2026-09-11, task-6.1-audit.md fix
 *   3): under `withPoolText`, each item ALSO carries `forward_events: [{event_date, event_kind,
 *   obligation_text, confidence, source_span}]` (from `item_forward_events`, migration 274 -- exactly the
 *   four columns the audit's own fix names plus `source_span` so the lane can cite the same span back into
 *   the brief) and `timelines: [{milestone_date, label, is_completed}]` (from `item_timelines`, migration
 *   004). The audit's own finding: 7 of the pilot's 10 items had DB-recorded forward events that never
 *   reached the brief's own "Anticipated Guidance and Pending Regulatory Events" section -- the forward
 *   intelligence existed as a row the exporter never handed the lane in the first place. Both arrays
 *   default to `[]` (an item can genuinely have none of either), never omitted, so a session lane can
 *   always check `item.forward_events.length` without a presence guard.
 * D1 fix (defect-fix-plan-2026-09-12.md, task 6.2d): every returned item ALSO carries
 * `provenance_status` (plain pass through of `it.provenance_status`, defaulting to `null` only when the
 * input item genuinely has no such field, a live row is NOT NULL), regardless of `withPoolText`, so a
 * lane can tell a quarantined item apart from a verified one without a second lookup. This is the field
 * a lane checks before writing a record-briefs entry for an item the `--ids` scope now includes even
 * when quarantined (see `selectItemsByIds` and the item-scope block in `main()`).
 * @returns {Array<{id:string, provenance_status:string|null, claims:object[], sections:object[], title?:string|null, item_type?:string|null,
 *   format_type?:string|null, jurisdiction_iso?:string|null, canonical_instrument_key?:string|null,
 *   source_id?:string|null, source_url?:string|null, required_slots?:string[], pool?:Array<{url:string,text:string}>,
 *   source_pool_hash?:string, forward_events?:object[], timelines?:object[]}>}
 */
export function buildCorpusItems(items, claimRows, sectionRows, poolRows = [], opts = {}) {
  const { withPoolText = false, forwardEventRows = [], timelineRows = [] } = opts;
  const claimsByItem = new Map();
  for (const r of claimRows) {
    const list = claimsByItem.get(r.intelligence_item_id) ?? [];
    list.push(mapClaimRow(r));
    claimsByItem.set(r.intelligence_item_id, list);
  }
  const forwardEventsByItem = new Map();
  for (const r of forwardEventRows) {
    const list = forwardEventsByItem.get(r.intelligence_item_id) ?? [];
    list.push({
      event_date: r.event_date,
      event_kind: r.event_kind,
      obligation_text: r.obligation_text,
      confidence: r.confidence,
      source_span: r.source_span,
    });
    forwardEventsByItem.set(r.intelligence_item_id, list);
  }
  const timelinesByItem = new Map();
  for (const r of timelineRows) {
    const list = timelinesByItem.get(r.item_id) ?? [];
    list.push({ milestone_date: r.milestone_date, label: r.label, is_completed: r.is_completed });
    timelinesByItem.set(r.item_id, list);
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
      // D1 fix (defect-fix-plan-2026-09-12.md): always present, never omitted, so a lane sees a
      // quarantined item for what it is regardless of which export mode produced it.
      provenance_status: it.provenance_status ?? null,
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
      // Task 3.3 fix round 1: stamp the pool-identity hash over this EXACT array, via the one shared helper
      // -- the injected-synthesis write site recomputes the same function over the item's live pool at
      // persist time and refuses on a mismatch (a stale echo means the lane read text that no longer
      // matches what is stored).
      out.source_pool_hash = hashSourcePool(out.pool);
      // Task 6.2b (task-6.1-audit.md fix 3): forward_events/timelines the lane must carry into the brief's
      // own "Anticipated Guidance and Pending Regulatory Events" section and the "Confirmed Regulatory
      // Timeline" section respectively -- never omitted when empty, so a lane can always check `.length`.
      out.forward_events = forwardEventsByItem.get(it.id) ?? [];
      out.timelines = timelinesByItem.get(it.id) ?? [];
    }
    return out;
  });
}

/**
 * D1 fix (defect-fix-plan-2026-09-12.md): resolves the --ids item scope to EXACTLY the given ids with
 * is_archived = false and provenance_status IN ('verified', 'quarantined'). The prior verified-only
 * filter silently dropped a quarantined id even when named explicitly by a ticket (brief-export run
 * 34717714753, item 00a8c0d9), blocking the only path (brief-apply --allow-brief-overwrite) that
 * re-grounds it. A requested id that still does not come back is classified: "archived" when a row
 * exists with is_archived = true, "not_found" otherwise (no matching row at all, or present with
 * neither accepted provenance_status; the same two-bucket shape the pre-existing "already archived, or
 * not found" log line already used, now made explicit per id). Injected `readAll` (db.mjs's
 * read-only-guarded client shape: `readAll(table, columns, { match })`) so this runs against a fake in
 * tests, never a live DB.
 * @param {string[]} ids
 * @param {string} itemColumns
 * @param {{ readAll: Function }} deps
 * @returns {Promise<{ items: Array<object>, notExported: Array<{id: string, reason: "archived"|"not_found"}> }>}
 */
export async function selectItemsByIds(ids, itemColumns, { readAll }) {
  const items = [];
  for (const idChunk of chunk(ids, 200)) {
    const rows = await readAll("intelligence_items", itemColumns, {
      // fitness-allow: F39 (already chunked above (idChunk/slice pattern), bounded per chunk, not corpus-scale)
      match: (q) => q.in("id", idChunk).in("provenance_status", ["verified", "quarantined"]).eq("is_archived", false),
    });
    items.push(...rows);
  }
  const foundIds = new Set(items.map((it) => it.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (!missing.length) return { items, notExported: [] };
  const archivedIds = new Set();
  for (const idChunk of chunk(missing, 200)) {
    const rows = await readAll("intelligence_items", "id, is_archived", {
      // fitness-allow: F39 (already chunked above (idChunk/slice pattern), bounded per chunk, not corpus-scale)
      match: (q) => q.in("id", idChunk),
    });
    for (const r of rows) if (r.is_archived) archivedIds.add(r.id);
  }
  const notExported = missing.map((id) => ({ id, reason: archivedIds.has(id) ? "archived" : "not_found" }));
  return { items, notExported };
}

if (IS_MAIN) await main();

async function main() {
  loadLocalEnvFile();

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
  // D1 fix (defect-fix-plan-2026-09-12.md): provenance_status is now selected on BOTH branches (not just
  // under --with-pool-text) so every exported item carries it; buildCorpusItems stamps it onto every
  // returned item regardless of withPoolText, which is how a lane sees a quarantined id for what it is.
  const ITEM_COLUMNS = withPoolText
    ? "id, created_at, title, item_type, format_type, jurisdiction_iso, canonical_instrument_key, source_id, source_url, provenance_status"
    : "id, created_at, provenance_status";

  // 1: the item scope. --ids: EXACTLY the given items, is_archived = false AND provenance_status IN
  // ('verified', 'quarantined') (D1 fix, defect-fix-plan-2026-09-12.md: the prior verified-only filter
  // silently dropped a quarantined id even when named explicitly, which is exactly the item a
  // brief-apply --allow-brief-overwrite re-ground pass exists to reach; the resolution path must reach
  // every non-archived item, per ADR-030's "items are resolved, never quarantined"). Otherwise: verified,
  // live items, optionally scoped to --since (matching discover-for-items.mjs's own created_at >= since
  // semantics, the ROW-INSERT timestamp, not the editorial added_date), the explicit-backfill-only path
  // now that --ids is the default selection; the auto-selection paths (here and brief-export.yml's own
  // hollow/record auto-select) stay verified-only by design: they pick WHAT to export, never a ticket
  // naming a specific, possibly quarantined id.
  let items;
  let notExported = [];
  if (ids) {
    const selected = await selectItemsByIds(ids, ITEM_COLUMNS, { readAll });
    items = selected.items;
    notExported = selected.notExported;
    if (notExported.length) {
      const archivedCount = notExported.filter((n) => n.reason === "archived").length;
      const notFoundCount = notExported.length - archivedCount;
      console.log(
        `export-corpus-for-extraction: ${notExported.length} of ${ids.length} requested id(s) not exported ` +
        `(${archivedCount} archived, ${notFoundCount} not found); exported anyway for the rest.`
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
    // D1 fix (defect-fix-plan-2026-09-12.md): the --ids path may now include quarantined items, so the
    // scope label says so rather than the old, now-inaccurate "verified/live" for that path.
    `export-corpus-for-extraction: ${items.length} ${ids ? "verified/quarantined" : "verified/live"} item(s) in scope` +
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
  const forwardEventRows = [];
  const timelineRows = [];
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
      // Task 6.2b (task-6.1-audit.md fix 3): forward_events + timelines, read ONLY under --with-pool-text
      // (the forward-events family's own default export already carries claims/sections; this is the
      // brief-authoring export's own additional need, the same posture the pool/required_slots reads above
      // already take). item_forward_events columns per migration 274: event_date/event_kind/
      // obligation_text/confidence per the audit's own fix text, plus source_span so the lane can cite the
      // same verbatim span back into the brief section it carries the event into. item_timelines columns
      // per migration 004: milestone_date/label/is_completed.
      const events = await readAll("item_forward_events", "intelligence_item_id, event_date, event_kind, obligation_text, confidence, source_span", {
        // fitness-allow: F39 (already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale)
        match: (q) => q.in("intelligence_item_id", idChunk),
      });
      forwardEventRows.push(...events);
      const timelines = await readAll("item_timelines", "item_id, milestone_date, label, is_completed", {
        // fitness-allow: F39 (already chunked above (idChunk/slice pattern): bounded per chunk, not corpus-scale)
        match: (q) => q.in("item_id", idChunk),
      });
      timelineRows.push(...timelines);
    }

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

  const corpusItems = buildCorpusItems(targetItems, claimRows, sectionRows, poolRows, {
    withPoolText,
    forwardEventRows,
    timelineRows,
  });
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
      const partItems = p.items.map(({ size: _size, ...rest }) => rest); // strip the internal size field
      // D1 fix (defect-fix-plan-2026-09-12.md): not_exported is a property of the WHOLE run, not one
      // part, so it is carried on every part's own body rather than only the first, in case a lane
      // fetches a single part.
      const body = { part: p.part, items: partItems, not_exported: notExported, ...(p.oversize ? { oversize: true } : {}) };
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
  // D1 fix (defect-fix-plan-2026-09-12.md): not_exported carried in the summary object, never omitted,
  // so a caller can always check its length rather than re-deriving what --ids asked for versus got.
  writeFileSync(outPath, JSON.stringify({ items: corpusItems, not_exported: notExported }, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
  process.exit(0);
}
