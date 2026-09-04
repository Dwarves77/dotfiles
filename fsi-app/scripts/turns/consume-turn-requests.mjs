#!/usr/bin/env node
// consume-turn-requests.mjs — lane EV, 2026-09-01. Reads OPEN corpus_turn_requests rows (migration 277 —
// the trigger `enqueue_corpus_turn_request()` that fills this table lives there), prints the distinct
// item id list, optionally writes the full snapshot to --out as JSON, and — only with --mark-consumed
// --by <label> — stamps consumed_at/consumed_by on exactly the rows this run read, through the guarded
// write path (scripts/lib/db.mjs guardedUpdate: cite + prior-value snapshot + read-back).
//
// This script is the PRODUCER side of the hand-off, not the consumer: it does not itself run connection
// discovery or forward-event extraction. `scripts/connections/discover-for-items.mjs --ids <comma-list>`
// (or the corpus-turn GitHub Actions workflow another lane owns) is the actual turn — this script only
// tells that caller WHICH items need one and, once told, retires the ticket so the same item is not
// re-offered on the next run.
//
// Usage:
//   node scripts/turns/consume-turn-requests.mjs [--out path/to/turn-requests.json]
//                                                  [--mark-consumed --by <label>]
//
//   --out <path>       write this run's open-request snapshot (id list + per-row reason/requested_at) as
//                       JSON to <path>. Optional — without it the script only prints.
//   --mark-consumed     stamp consumed_at=now()/consumed_by=<label> on every open row THIS RUN READ (never
//                       a second, possibly-different re-read — the rows marked are exactly the rows
//                       printed/written, so a caller can trust its own snapshot was the one consumed).
//                       Requires --by.
//   --by <label>        free-text consumer identity (a workflow run id, an operator handle). Required
//                       with --mark-consumed; an error without it (silently defaulting to some placeholder
//                       label would make consumed_by useless for tracing which run cleared a ticket).
//
// Exit 0 done (including "0 open requests", which is a legitimate steady state, not an error) · 1 bad
// args or a read/write failure · 2 no DB creds (cannot run here).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * Parse + validate CLI args. PURE (no process.env, no I/O, no process.exit) so it has a real colocated
 * test without faking a DB — same discipline as discover-for-items.mjs's own parseArgs.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ok:true, out:string|null, markConsumed:boolean, by:string|null} | {ok:false, error:string}}
 */
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];

  const outIdx = args.indexOf("--out");
  const outRaw = outIdx !== -1 ? args[outIdx + 1] : undefined;
  const out = outIdx !== -1 && outRaw && !outRaw.startsWith("--") ? outRaw : null;

  const markConsumed = args.includes("--mark-consumed");

  const byIdx = args.indexOf("--by");
  const byRaw = byIdx !== -1 ? args[byIdx + 1] : undefined;
  const by = byIdx !== -1 && byRaw && !byRaw.startsWith("--") ? byRaw : null;

  if (outIdx !== -1 && !out) {
    return { ok: false, error: "--out requires a path argument." };
  }
  if (markConsumed && !by) {
    return { ok: false, error: "--mark-consumed requires --by <label>." };
  }
  if (by && !markConsumed) {
    return { ok: false, error: "--by has no effect without --mark-consumed (nothing is being marked)." };
  }

  return { ok: true, out, markConsumed, by };
}

/**
 * The unique, insertion-ordered list of intelligence_item_id values across a set of corpus_turn_requests
 * rows — exactly the shape discover-for-items.mjs's own `--ids <uuid,uuid,...>` flag expects. Migration
 * 277's partial-unique index already guarantees at most one OPEN row per item, so this dedup is
 * defensive (keeps the function correct even handed a raw/unfiltered rows array), not load-bearing
 * against the live data.
 * @param {Array<{intelligence_item_id: string}>} rows
 * @returns {string[]}
 */
export function toIdList(rows) {
  const seen = new Set();
  const ids = [];
  for (const r of rows ?? []) {
    const id = r?.intelligence_item_id;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** The comma-joined id string discover-for-items.mjs's --ids flag consumes directly. "" for an empty
 *  list (never a stray comma, never the literal string "undefined"). */
export function formatIdsLine(ids) {
  return (ids ?? []).join(",");
}

/**
 * The JSON payload written to --out. Carries the convenience id list (for --ids) AND each row's own
 * reason/requested_at (so a workflow can log or branch on why a turn was requested), plus a by-reason
 * count for a quick human summary. PURE — takes the already-read rows and a caller-supplied timestamp so
 * it is deterministic under test (no Date.now() inside).
 * @param {Array<{id:string, intelligence_item_id:string, reason:string, requested_at:string}>} rows
 * @param {{generatedAt: string}} opts
 */
export function buildOutputPayload(rows, { generatedAt }) {
  const ids = toIdList(rows);
  const byReason = {};
  for (const r of rows ?? []) {
    const reason = r?.reason ?? "unknown";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
  return {
    generated_at: generatedAt,
    count: ids.length,
    by_reason: byReason,
    ids,
    requests: (rows ?? []).map((r) => ({
      id: r.id,
      intelligence_item_id: r.intelligence_item_id,
      reason: r.reason,
      requested_at: r.requested_at,
    })),
  };
}

if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`consume-turn-requests: ${parsed.error}`);
    process.exit(1);
  }
  const { out, markConsumed, by } = parsed;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("consume-turn-requests: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  let rows;
  try {
    rows = await readAll("corpus_turn_requests", "id, intelligence_item_id, reason, requested_at", {
      match: (q) => q.is("consumed_at", null),
      orderBy: "requested_at",
    });
  } catch (e) {
    console.error(`consume-turn-requests: read failed: ${e.message}`);
    process.exit(1);
  }

  const ids = toIdList(rows);
  console.error(`consume-turn-requests: ${rows.length} open request(s), ${ids.length} distinct item(s).`);

  if (out) {
    const payload = buildOutputPayload(rows, { generatedAt: new Date().toISOString() });
    const outPath = resolve(out);
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.error(`consume-turn-requests: wrote ${outPath}`);
  }

  // The id list is the ONE line of real stdout output — every status line above is console.error — so a
  // caller can capture it directly: IDS=$(node scripts/turns/consume-turn-requests.mjs), then feed it
  // straight into: node scripts/connections/discover-for-items.mjs --ids "$IDS" --execute
  console.log(formatIdsLine(ids));

  if (markConsumed) {
    if (!rows.length) {
      console.error("consume-turn-requests: --mark-consumed requested but 0 open rows — nothing to stamp.");
      return;
    }
    const cite = {
      skill: "corpus-turn-workflow",
      reason: `mark ${rows.length} open corpus_turn_requests row(s) consumed by ${by}`,
    };
    const nowIso = new Date().toISOString();
    const requestIds = rows.map((r) => r.id);
    try {
      // IN-CHUNK (2026-09-04): chunked by id (100 per request); see analyze-corpus.mjs IN_CHUNK.
      const res = await guardedUpdateByIds(
        "corpus_turn_requests",
        requestIds,
        { consumed_at: nowIso, consumed_by: by },
        { cite, select: "id", chunk: 100 }
      );
      console.error(`consume-turn-requests: marked ${res.updated} request(s) consumed_by=${by}.`);
    } catch (e) {
      console.error(`consume-turn-requests: mark-consumed FAILED: ${e.message}`);
      process.exit(1);
    }
  }
}
