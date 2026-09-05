#!/usr/bin/env node
// apply-extraction-output.mjs — corpus-turn family (RT lane, 2026-09-01). The "load" half
// `scripts/harness-runs/forward-events/PROTOCOL.md` §2 always assigns to the coordinator/guarded-write
// path, never to the extraction lane itself: "Turning a run's events array into live rows is the
// coordinator's act... never by the extraction lane applying its own INSERTs directly against the live
// database." This script IS that guarded-write-path act, run under the corpus-turn harness.
//
// INPUT: `scripts/forward-events/run-extraction.mjs --execute`'s own `<out-basename>.events.json` output
// — the exact `allEvents` shape that runner's `runExtraction()` builds: one object per emitted event,
// `{ item_id, event_date, date_precision, event_kind, obligation_text, source_kind, source_claim_id,
// source_section_id, source_span, confidence, extractor_version }` (see that runner's own header/
// `runExtraction` doc comment).
//
// IDEMPOTENCY RESPECTS MIGRATION 307's DEDUPE KEY (lane FE-DEDUP, 2026-09-04), NOT AN EARLIER ONE. 274
// shipped `UNIQUE (intelligence_item_id, event_date, event_kind, source_span)`; 275 replaced it (see that
// migration's own header — the first full-corpus run showed the 274 key silently collapsing 54% of
// distinct events sharing a bare-year span) with
//   (intelligence_item_id, event_date, event_kind, md5(obligation_text), coalesce(source_claim_id, source_section_id));
// 307 replaced 275's key in turn — the source-object term let a claim-backed row and a section-backed row
// with byte-identical obligation_text coexist as an undetected duplicate (359 live groups, measured; see
// 307's own header) — with the narrower
//   (intelligence_item_id, event_kind, event_date, md5(obligation_text))
// THIS FILE'S `dedupeKey` MUST MIRROR WHICHEVER KEY IS LIVE: it existed to keep this script's own
// pre-insert idempotency check in step with the DB's actual unique index, not to independently invent a
// notion of "same event" — a divergence here does not fail silently, it fails LOUD, as a real unique-
// violation from `guardedInsertMany`'s bare INSERT the next time a stale, wider key wrongly calls a true
// content-duplicate "new". `db.mjs`'s `guardedInsertMany` is a BARE INSERT (no ON CONFLICT) — a naive
// re-run would throw a unique-violation against the live index rather than skip cleanly. This script makes
// a re-run idempotent the same way `db.mjs`'s own `registerSource` does for the `sources` table: read the
// existing keys for the items in this batch FIRST, compute the same key client-side (Node's `crypto` `md5`
// hex digest is byte-identical to Postgres's `md5()` text function for the same input string), and insert
// only the rows that are genuinely new.
//
// Usage:
//   node scripts/turns/apply-extraction-output.mjs --events path/to/x.events.json [--execute]
// --execute is required to write; the default is a dry preview (compute + report, write nothing).
// Exit 0 done · 1 bad args / malformed input · 2 no DB creds (cannot run here).

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usage() {
  return "Usage: node scripts/turns/apply-extraction-output.mjs --events path/to/x.events.json [--execute]";
}

/** Pure CLI arg parse/validate. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: { events: { type: "string" }, execute: { type: "boolean", default: false } },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.events) return { ok: false, error: "--events <path.json> is required." };
  return { ok: true, events: values.events, execute: values.execute === true };
}

/** Load + shape-check run-extraction.mjs's events output file. Throws on unreadable/malformed input
 *  (a usage error) — never silently coerces a bad shape into an empty batch. */
export function loadEventsFile(path) {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`--events must be a JSON array of event objects (run-extraction.mjs's *.events.json shape); got ${typeof parsed}`);
  }
  return parsed;
}

/** md5 hex digest, byte-identical to Postgres's md5(text) for the same input string. */
export function md5Hex(text) {
  return createHash("md5").update(String(text ?? ""), "utf8").digest("hex");
}

/** Migration 307's dedupe key for one event row, as a single string (lane FE-DEDUP, 2026-09-04 — see this
 *  file's own header for why this dropped the source-object term migration 275's key carried). PURE.
 *  @param {{intelligence_item_id:string, event_date:string, event_kind:string, obligation_text:string}} row */
// The separator is written as the escape `"\u0000"`, never as a raw NUL byte in the source text: a raw
// byte makes grep/diff treat this file as binary (it did — "binary file matches", 2026-09-01) and
// invites an editor to strip it silently, which would change every key. Same runtime value.
export function dedupeKey(row) {
  return [row.intelligence_item_id, row.event_date, row.event_kind, md5Hex(row.obligation_text)].join("\u0000");
}

/**
 * Validate + map one run-extraction.mjs event entry to an item_forward_events insert row. Returns
 * `{ok:true, row}` or `{ok:false, reason}` — a malformed row is REPORTED, never silently dropped or
 * silently written with a garbage FK. PURE.
 */
export function toInsertRow(event) {
  if (!event || typeof event !== "object") return { ok: false, reason: "not an object" };
  const itemId = event.item_id;
  if (typeof itemId !== "string" || !UUID_RE.test(itemId)) {
    return { ok: false, reason: `item_id is not a UUID (got ${JSON.stringify(itemId)}) — likely a corpus row with no real intelligence_items.id (run-extraction.mjs's own corpus-index-N fallback); refusing to write a garbage FK` };
  }
  for (const key of ["event_date", "date_precision", "event_kind", "obligation_text", "source_kind", "source_span", "confidence", "extractor_version"]) {
    if (typeof event[key] !== "string" || event[key].length === 0) {
      return { ok: false, reason: `${key} missing or not a non-empty string` };
    }
  }
  return {
    ok: true,
    row: {
      intelligence_item_id: itemId,
      event_date: event.event_date,
      date_precision: event.date_precision,
      event_kind: event.event_kind,
      obligation_text: event.obligation_text,
      source_kind: event.source_kind,
      source_claim_id: event.source_claim_id ?? null,
      source_section_id: event.source_section_id ?? null,
      source_span: event.source_span,
      confidence: event.confidence,
      extractor_version: event.extractor_version,
    },
  };
}

/** Partition already-mapped insert rows into {new, alreadyLive} against a Set of existing dedupe keys.
 *  PURE. Two rows in the SAME input batch that collapse to the same key are also deduped (keeps the
 *  first, reports the rest as alreadyLive) — the extractor is deterministic so this only ever fires on a
 *  genuine re-run over overlapping corpus slices, never on two truly distinct events. */
export function partitionNew(rows, existingKeys) {
  const seen = new Set(existingKeys);
  const fresh = [];
  const alreadyLive = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) { alreadyLive.push(row); continue; }
    seen.add(key);
    fresh.push(row);
  }
  return { fresh, alreadyLive };
}

if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`apply-extraction-output: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("apply-extraction-output: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  let events;
  try {
    events = loadEventsFile(resolve(parsed.events));
  } catch (err) {
    console.error(`apply-extraction-output: failed to read/parse --events: ${err.message}`);
    process.exit(1);
  }

  if (!events.length) {
    console.log("apply-extraction-output: 0 events in input file — nothing to do.");
    process.exit(0);
  }

  const mapped = events.map(toInsertRow);
  const bad = mapped.filter((m) => !m.ok);
  const rows = mapped.filter((m) => m.ok).map((m) => m.row);
  for (const b of bad) console.warn(`apply-extraction-output: SKIPPING malformed event row: ${b.reason}`);

  const { readAll, guardedInsertMany } = await import("../lib/db.mjs");

  // Scope the existing-row read to the items THIS batch actually touches (chunked .in()).
  const itemIds = [...new Set(rows.map((r) => r.intelligence_item_id))];
  const existing = [];
  const CHUNK = 200;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const idChunk = itemIds.slice(i, i + CHUNK);
    if (!idChunk.length) continue;
    const page = await readAll(
      "item_forward_events",
      // source_claim_id/source_section_id dropped from this select (lane FE-DEDUP, 2026-09-04): dedupeKey
      // no longer reads them -- migration 307 dropped the source-object term from the live key.
      "intelligence_item_id, event_date, event_kind, obligation_text",
      { match: (q) => q.in("intelligence_item_id", idChunk) }
    );
    existing.push(...page);
  }
  const existingKeys = existing.map(dedupeKey);

  const { fresh, alreadyLive } = partitionNew(rows, existingKeys);

  console.log(
    `apply-extraction-output: ${events.length} event(s) in input, ${bad.length} malformed (skipped), ` +
    `${alreadyLive.length} already live (skip, idempotent), ${fresh.length} new.`
  );

  if (!parsed.execute) {
    console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
    process.exit(0);
  }

  if (!fresh.length) {
    console.log("WROTE: 0 rows (nothing new to insert).");
    process.exit(0);
  }

  const CITE = {
    skill: "corpus-turn-runbook",
    reason: "corpus-turn apply-extraction-output: load run-extraction.mjs's emitted events into item_forward_events through the guarded path, respecting migration 307's dedupe key.",
  };
  const res = await guardedInsertMany("item_forward_events", fresh, { cite: CITE, select: "id" });
  console.log(`WROTE: ${res.inserted} new item_forward_events row(s). Snapshot: ${res.snapshot}`);
  process.exit(0);
}
