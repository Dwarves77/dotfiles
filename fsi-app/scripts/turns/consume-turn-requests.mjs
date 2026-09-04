#!/usr/bin/env node
// consume-turn-requests.mjs — lane EV, 2026-09-01; wired as corpus-turn's own item-selection mechanism
// by lane TURNREQ, 2026-09-04 (see CORPUS-TURN-RUNBOOK.md — this table replaces the old
// last-turn-date.mjs marker as the ONE "what changed" mechanism). Reads OPEN corpus_turn_requests rows
// (migration 277 — the trigger `enqueue_corpus_turn_request()` that fills this table lives there),
// bounded by --limit (oldest-first — the DB read is already ordered by requested_at ascending, so a
// limit is a plain slice; migration 277's partial-unique index guarantees at most one open row per item,
// so bounding rows bounds distinct items 1:1 — "grouped by item" needs no separate dedup step), prints
// the distinct item id list, optionally writes the full snapshot to --out as JSON, and — only with
// --mark-consumed --by <label> — stamps consumed_at/consumed_by on exactly the rows this run read,
// through the guarded write path (scripts/lib/db.mjs guardedUpdate: cite + prior-value snapshot +
// read-back).
//
// This script is the PRODUCER side of the hand-off, not the consumer: it does not itself run connection
// discovery or forward-event extraction. `scripts/connections/discover-for-items.mjs --ids <comma-list>`
// plus `scripts/turns/export-corpus-for-extraction.mjs --ids <comma-list>` (chained by
// .github/workflows/corpus-turn.yml) is the actual turn — this script only tells that caller WHICH items
// need one and, once the turn's writes have succeeded, retires the ticket so the same item is not
// re-offered on the next run.
//
// TWO MODES, never combined in one invocation:
//
//   MODE 1 — read (the normal path). Reads the open queue, optionally bounded, optionally marks exactly
//   what it just read:
//     node scripts/turns/consume-turn-requests.mjs [--out path/to/turn-requests.json] [--limit N]
//                                                    [--mark-consumed --by <label>]
//     --out <path>       write this run's open-request snapshot (id list + per-row reason/requested_at)
//                         as JSON to <path>. Optional — without it the script only prints.
//     --limit N           bound the read to at most N open rows, oldest (earliest requested_at) first.
//                         Optional — without it every open row is read (today's steady-state ceiling is
//                         a few thousand rows, small enough to read whole; a caller with a real batch-size
//                         concern, like corpus-turn.yml, should always pass this).
//     --mark-consumed     stamp consumed_at=now()/consumed_by=<label> on every open row THIS RUN READ
//                         (never a second, possibly-different re-read — the rows marked are exactly the
//                         rows printed/written, so a caller can trust its own snapshot was the one
//                         consumed). Requires --by. Use this ONLY when the caller's downstream turn work
//                         happens synchronously inside this same process invocation — a caller whose turn
//                         work is a SEPARATE later step (corpus-turn.yml: discover → export → extract →
//                         apply, all of which can fail) should use MODE 2 instead, so marking never
//                         precedes the writes it is meant to follow.
//
//   MODE 2 — --mark-file <path> --by <label>. Marks EXACTLY the request rows named in a PRIOR --out
//   snapshot (never a fresh "what's open now" re-read — the whole point is retiring exactly what an
//   earlier step already selected and processed, even if the open set has changed since: new tickets
//   arrived, or a different run already consumed some). This is corpus-turn.yml's own shape: read the
//   scope BEFORE the turn's writes (MODE 1, no --mark-consumed), run discover/export/extract/apply, and
//   only after every one of those steps has succeeded, call MODE 2 against that same snapshot file — a
//   GitHub Actions step ordering (no continue-on-error) is what makes "only after success" true: this
//   step is simply unreached if an earlier one failed. Mutually exclusive with --out/--limit/--mark-consumed
//   (those are MODE 1's read-shaping flags; MODE 2 does no read of "open" rows at all).
//
//   --by <label>        free-text consumer identity (a workflow run id, an operator handle). Required
//                       with --mark-consumed or --mark-file; an error without it (silently defaulting to
//                       some placeholder label would make consumed_by useless for tracing which run
//                       cleared a ticket).
//
// Exit 0 done (including "0 open requests", which is a legitimate steady state, not an error) · 1 bad
// args or a read/write failure · 2 no DB creds (cannot run here).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * Parse + validate CLI args. PURE (no process.env, no I/O, no process.exit) so it has a real colocated
 * test without faking a DB — same discipline as discover-for-items.mjs's own parseArgs.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ok:true, out:string|null, markConsumed:boolean, by:string|null, limit:number|null, markFile:string|null} | {ok:false, error:string}}
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

  const limitIdx = args.indexOf("--limit");
  const limitRaw = limitIdx !== -1 ? args[limitIdx + 1] : undefined;
  const limitNum = limitIdx !== -1 && limitRaw && !limitRaw.startsWith("--") ? Number(limitRaw) : NaN;

  const markFileIdx = args.indexOf("--mark-file");
  const markFileRaw = markFileIdx !== -1 ? args[markFileIdx + 1] : undefined;
  const markFile = markFileIdx !== -1 && markFileRaw && !markFileRaw.startsWith("--") ? markFileRaw : null;

  if (outIdx !== -1 && !out) {
    return { ok: false, error: "--out requires a path argument." };
  }
  if (limitIdx !== -1 && (!Number.isInteger(limitNum) || limitNum <= 0)) {
    return { ok: false, error: `--limit must be a positive integer, got ${JSON.stringify(limitRaw)}` };
  }
  if (markFileIdx !== -1 && !markFile) {
    return { ok: false, error: "--mark-file requires a path argument." };
  }
  if (markConsumed && !by) {
    return { ok: false, error: "--mark-consumed requires --by <label>." };
  }
  if (markFile && !by) {
    return { ok: false, error: "--mark-file requires --by <label>." };
  }
  if (by && !markConsumed && !markFile) {
    return { ok: false, error: "--by has no effect without --mark-consumed or --mark-file (nothing is being marked)." };
  }
  if (markFile && (markConsumed || out || limitIdx !== -1)) {
    return {
      ok: false,
      error: "--mark-file marks a prior snapshot's exact rows and cannot be combined with --out, " +
        "--limit, or --mark-consumed (those shape MODE 1's read; --mark-file is MODE 2, no read of " +
        "\"open\" rows at all).",
    };
  }

  return {
    ok: true,
    out,
    markConsumed,
    by,
    limit: limitIdx !== -1 ? limitNum : null,
    markFile,
  };
}

/**
 * Bound `rows` to at most `limit` entries, keeping their existing order. `rows` is always already
 * oldest-first (the DB read orders by requested_at ascending) — this is a plain slice, not a re-sort, so
 * "bounded by --limit, oldest first" is exactly what a caller sees whether or not a limit was given.
 * PURE. @param {Array} rows @param {number|null|undefined} limit @returns {Array}
 */
export function applyLimit(rows, limit) {
  const list = rows ?? [];
  if (!Number.isInteger(limit) || limit <= 0) return list;
  return list.slice(0, limit);
}

/**
 * The corpus_turn_requests row ids (never intelligence_item_id — the thing MODE 2 marks consumed is the
 * TICKET, and a --mark-file caller must retire exactly the tickets a prior --out snapshot named, not
 * re-derive them from the item list) named in a --out snapshot payload (buildOutputPayload's own shape).
 * PURE. @param {{requests?: Array<{id?: string}>}} payload @returns {string[]}
 */
export function extractRequestIdsFromSnapshot(payload) {
  const requests = Array.isArray(payload?.requests) ? payload.requests : [];
  const ids = [];
  for (const r of requests) {
    if (r?.id) ids.push(r.id);
  }
  return ids;
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
  const { out, markConsumed, by, limit, markFile } = parsed;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("consume-turn-requests: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  // MODE 2 — mark exactly the rows a PRIOR --out snapshot named. No "open" read at all: retiring what an
  // earlier step already selected and processed must never depend on what the queue looks like NOW.
  if (markFile) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(resolve(markFile), "utf8"));
    } catch (e) {
      console.error(`consume-turn-requests: --mark-file read/parse failed: ${e.message}`);
      process.exit(1);
    }
    const requestIds = extractRequestIdsFromSnapshot(payload);
    if (!requestIds.length) {
      console.error(`consume-turn-requests: --mark-file ${markFile} names 0 request(s) — nothing to stamp.`);
      return;
    }
    const cite = {
      skill: "corpus-turn-workflow",
      reason: `mark ${requestIds.length} corpus_turn_requests row(s) from snapshot ${markFile} consumed by ${by}`,
    };
    const nowIso = new Date().toISOString();
    try {
      // IN-CHUNK (2026-09-04): chunked by id (100 per request); see analyze-corpus.mjs IN_CHUNK.
      const res = await guardedUpdateByIds(
        "corpus_turn_requests",
        requestIds,
        { consumed_at: nowIso, consumed_by: by },
        { cite, select: "id", chunk: 100 }
      );
      console.error(`consume-turn-requests: marked ${res.updated} request(s) consumed_by=${by} (from ${markFile}).`);
    } catch (e) {
      console.error(`consume-turn-requests: --mark-file mark FAILED: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  // MODE 1 — read the open queue, bounded by --limit (oldest-first), optionally mark exactly what was read.
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
  const totalOpen = rows.length;
  rows = applyLimit(rows, limit);

  const ids = toIdList(rows);
  console.error(
    `consume-turn-requests: ${totalOpen} open request(s) total, ${rows.length} selected` +
    `${limit ? ` (--limit ${limit})` : ""}, ${ids.length} distinct item(s).`
  );

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
      console.error("consume-turn-requests: --mark-consumed requested but 0 open rows selected — nothing to stamp.");
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
