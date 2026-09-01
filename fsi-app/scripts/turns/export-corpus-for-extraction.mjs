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
// COLUMN MAPPING mirrors `src/lib/forward-events/read-and-extract.mjs`'s query shape exactly (same two
// tables — `section_claim_provenance`, `intelligence_item_sections` — same `claim_kind IN ('FACT','GAP')`
// filter, same id-bearing row mapping) so the corpus file this script emits is byte-shape-identical to
// what that module's live per-item read would produce. That module reads ONE item at a time (it drives
// the extractor directly, at mint/update time); this script batches the same read across many items
// because it only PREPARES run-extraction.mjs's input file — run-extraction.mjs stays the forward-events
// family's one canonical entry point and the only place that writes this family's harness artifact.
//
// Usage:
//   node scripts/turns/export-corpus-for-extraction.mjs --out path.json [--since ISO-date] [--limit N]
// Exit 0 (writes --out, even for 0 matched items — an empty corpus is a valid, honestly-reported outcome,
//   not a script failure) · 1 bad args · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const DEFAULT_LIMIT = 10000; // well above today's corpus size (~a few hundred items); an explicit,
// bounded default rather than an unbounded read — mirrors dateRange's 366-day cap and discover-for-items'
// --limit default, this codebase's standing "no silently unbounded sweep" convention.

function usage() {
  return (
    "Usage: node scripts/turns/export-corpus-for-extraction.mjs --out path.json [--since ISO-date] [--limit N]"
  );
}

/** Pure CLI arg parse/validate. @param {string[]} argv @returns {{ok:true,out:string,since:string|null,limit:number}|{ok:false,error:string}} */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        out: { type: "string" },
        since: { type: "string" },
        limit: { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.out) return { ok: false, error: "--out <path.json> is required." };
  if (values.since && Number.isNaN(Date.parse(values.since))) {
    return { ok: false, error: `--since value is not a parseable date: ${JSON.stringify(values.since)}` };
  }
  const limit = values.limit ? Number(values.limit) : DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { ok: false, error: `--limit must be a positive number, got ${JSON.stringify(values.limit)}` };
  }
  return { ok: true, out: values.out, since: values.since || null, limit };
}

/** Split an array into chunks of at most `size` (pure). @param {Array} arr @param {number} size */
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Group flat claim/section rows by their parent item id and merge into the corpus-item shape.
 * PURE — no I/O. @param {{id:string}[]} items @param {{intelligence_item_id:string}[]} claimRows
 * @param {{item_id:string}[]} sectionRows @returns {Array<{id:string, claims:object[], sections:object[]}>}
 */
export function buildCorpusItems(items, claimRows, sectionRows) {
  const claimsByItem = new Map();
  for (const r of claimRows) {
    const list = claimsByItem.get(r.intelligence_item_id) ?? [];
    list.push({ claim_id: r.id, kind: r.claim_kind, text: r.claim_text, span: r.source_span ?? null });
    claimsByItem.set(r.intelligence_item_id, list);
  }
  const sectionsByItem = new Map();
  for (const r of sectionRows) {
    const list = sectionsByItem.get(r.item_id) ?? [];
    list.push({ section_id: r.id, key: r.section_key, md: r.content_md ?? "" });
    sectionsByItem.set(r.item_id, list);
  }
  return items.map((it) => ({
    id: it.id,
    claims: claimsByItem.get(it.id) ?? [],
    sections: sectionsByItem.get(it.id) ?? [],
  }));
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
  const { out, since, limit } = parsed;

  // 1 — verified, live items (optionally scoped to --since, matching discover-for-items.mjs's own
  // created_at >= since semantics — the ROW-INSERT timestamp, not the editorial added_date).
  let items = await readAll("intelligence_items", "id, created_at", {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  });
  if (since) {
    const sinceMs = Date.parse(since);
    items = items.filter((it) => it.created_at && Date.parse(it.created_at) >= sinceMs);
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (items.length > limit) items = items.slice(0, limit);

  // 2 — items that ALREADY carry ≥1 forward event — excluded (the family's own idempotency guarantee,
  // PROTOCOL.md §4, means a re-extraction would just reproduce identical rows apply-extraction-output.mjs
  // would then skip anyway; scoping the export itself keeps a routine turn's corpus small and honest
  // about what it actually re-processed).
  const existingEventRows = await readAll("item_forward_events", "intelligence_item_id");
  const itemsWithEvents = new Set(existingEventRows.map((r) => r.intelligence_item_id));
  const targetItems = items.filter((it) => !itemsWithEvents.has(it.id));

  console.log(
    `export-corpus-for-extraction: ${items.length} verified/live item(s) in scope` +
    `${since ? ` (created_at >= ${since})` : ""}; ${targetItems.length} lack any item_forward_events row.`
  );

  // 3 — batched claim/section reads for the target items only (chunked .in() — PostgREST/pg IN-list
  // limits and payload size both bounded by a modest chunk size).
  const ids = targetItems.map((it) => it.id);
  const claimRows = [];
  const sectionRows = [];
  for (const idChunk of chunk(ids, 200)) {
    if (!idChunk.length) continue;
    const claims = await readAll("section_claim_provenance", "id, intelligence_item_id, claim_kind, claim_text, source_span", {
      match: (q) => q.in("intelligence_item_id", idChunk).in("claim_kind", ["FACT", "GAP"]),
    });
    claimRows.push(...claims);
    const sections = await readAll("intelligence_item_sections", "id, item_id, section_key, content_md", {
      match: (q) => q.in("item_id", idChunk),
    });
    sectionRows.push(...sections);
  }

  const corpusItems = buildCorpusItems(targetItems, claimRows, sectionRows);
  const withContent = corpusItems.filter((it) => it.claims.length || it.sections.length).length;
  console.log(
    `export-corpus-for-extraction: ${corpusItems.length} item(s) exported (${withContent} carry ≥1 FACT/GAP ` +
    `claim or section; the rest are ungrounded stubs the extractor will correctly emit 0 events for).`
  );

  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ items: corpusItems }, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
  process.exit(0);
}
