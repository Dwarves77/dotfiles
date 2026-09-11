#!/usr/bin/env node
// backfill-format-type.mjs -- MAINT step for task 2.4 of the brief-chain build plan (2026-09-11):
// format_type catch-up for live briefs that carry none (measured live corpus count, 2026-09-11
// [CONFIRMED, SQL against kwrsbpiseruzbfwjpvsp]: 128 rows where item_grade='brief', is_archived=false,
// format_type IS NULL).
//
// WHY format_type CAN BE NULL ON A LIVE BRIEF. canonical-pipeline.ts's synthesiseAndWriteBrief stamps
// format_type on every WRITE (`:844`, per task 1.2's own citation), but that stamp only fires on a
// generation pass. A row minted at item_grade='brief' before that stamp existed, or one whose most
// recent write predates it, carries a real full_brief with no format_type -- this script is the one-time
// sweep that catches those rows up, mirroring origin-class-backfill.mjs's shape for a NULL-column
// catch-up (same file for the pure-decision-vs-orchestration split, same idempotent IS NULL scope).
//
// NO SECOND MAPPING TABLE. The item_type -> format_type resolution is `specForItemType`
// (src/lib/agent/extract-registry.ts) -- the SAME function task 1.2's mint-time stamp and
// synthesiseAndWriteBrief's write site use. This file never hand-encodes that table; the pure
// `planFormatTypeBackfill` below takes specForItemType as an INJECTED function, so:
//   (a) production always resolves through the one real registry (loaded via jiti -- see buildDeps below), and
//   (b) the no-npm-ci discipline test job can unit-test the orchestration with a fake resolver, matching
//       source-type-backfill.test.mjs / origin-class-backfill.test.mjs's own injected-deps style.
// An item_type specForItemType does not resolve (returns null) is SKIPPED and reported by id -- never
// guessed. In the live corpus every intelligence_items.item_type value is covered by a FormatSpec (the
// migration-004 CHECK constraint's 12 values match the 5 FormatSpecs' itemTypes arrays 1:1, verified by
// grep against src/lib/agent/formats/*.ts, 2026-09-11), so the skip branch is a defensive backstop, not
// an expected outcome -- it still must never guess.
//
// WHY jiti IS LOADED LAZILY, INSIDE buildDeps (never at module top level). This file has a companion
// backfill-format-type.test.mjs in run-test-suite.sh's no-npm-ci glob
// (`fsi-app/scripts/maintenance/*.test.mjs` -- see .discipline/glob-portability.test.mjs). extract-
// registry.ts and everything it imports (formats/*.ts -> prose-extractor.ts -> format-spec.ts) resolve
// through the `@/lib/...` TS path alias, which only Next.js's own bundler resolves -- a plain `node`
// import throws immediately (CONFIRMED precedent: run-ledger-consume.mjs's own header, jiti-probe
// 2026-09-02). A TOP-LEVEL `import { createJiti } from "jiti"` or a top-level jiti.import(...) of a .ts
// file would therefore make `node --test backfill-format-type.test.mjs` throw ERR_MODULE_NOT_FOUND in
// the discipline CI job, which runs that glob with NO `npm ci` (by design -- see run-test-suite.sh /
// glob-portability.test.mjs's own header: "audit-gate.test.mjs imported jiti" is the exact recurrence
// this avoids). jiti is imported dynamically, and only inside buildDeps() -- a function this file's own
// `if (IS_MAIN)` block calls, which is false whenever the test file merely imports this module's
// exports. scripts/verify/format-structure.mjs is the sibling precedent for the jiti+alias shape itself
// (that file has no companion test, so it loads jiti at top level; this one cannot).
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 task 2.4",
  reason:
    "format_type catch-up for live intelligence_items (item_grade='brief', is_archived=false) whose " +
    "format_type is NULL, derived from specForItemType(item_type) -- the same resolver task 1.2's " +
    "mint-time stamp and canonical-pipeline.ts's synthesiseAndWriteBrief write site use. No second " +
    "mapping table. Idempotent (WHERE format_type IS NULL, re-checked per chunk via applyMatch); an " +
    "item_type specForItemType does not resolve is skipped and reported by id, never guessed.",
});

/**
 * Pure: groups rows needing a format_type by the value specForItemTypeFn resolves for their item_type.
 * specForItemTypeFn is INJECTED (never a second mapping table here) so this stays unit-testable with no
 * jiti/.ts loading. Returns { byFormatType: Map<formatType, id[]>, skipped: {id, item_type}[] } -- an
 * item_type the resolver does not recognize (returns null/undefined, or a spec with no formatType) is
 * skipped, never guessed.
 * @param {{ id: string, item_type: string|null }[]} rows
 * @param {(itemType: string|null|undefined) => { formatType: string }|null} specForItemTypeFn
 */
export function planFormatTypeBackfill(rows, specForItemTypeFn) {
  const byFormatType = new Map();
  const skipped = [];
  for (const r of rows) {
    const spec = specForItemTypeFn(r.item_type);
    if (!spec || !spec.formatType) {
      skipped.push({ id: r.id, item_type: r.item_type });
      continue;
    }
    if (!byFormatType.has(spec.formatType)) byFormatType.set(spec.formatType, []);
    byFormatType.get(spec.formatType).push(r.id);
  }
  return { byFormatType, skipped };
}

/** --limit N / --after-id UUID: the same bounded/resumable idiom backfill-item-timelines.mjs /
 *  forward-events/dispatch-extraction.mjs already use (id-ordered scan; --after-id resumes past the
 *  last id a prior run reported). Neither runCli's shared --mode/--arg/--out parser (scripts/maintenance
 *  /lib/cli.mjs) carries these -- no other MAINT wrapper needs pagination flags of its own, so they are
 *  parsed here rather than widening a shared parser for one caller. Pure; unit-tested directly. */
export function parseBatchArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const limitRaw = get("--limit");
  const limitNum = limitRaw !== undefined ? Number(limitRaw) : undefined;
  return {
    limit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
    afterId: get("--after-id"),
  };
}

/**
 * @param {{ mode?: "dry"|"apply", limit?: number, afterId?: string }} opts
 * @param {{ readAll: Function, guardedUpdateByIds: Function, specForItemType: Function }} deps
 */
export async function main({ mode = "dry", limit, afterId } = {}, deps) {
  const apply = mode === "apply";
  const summary = {
    step: "backfill-format-type",
    mode,
    counts: {},
    applied: 0,
    read_back: {},
    skipped: [],
    exitCode: 0,
  };

  const rows = await deps.readAll("intelligence_items", "id, item_type, format_type", {
    match: (q) => {
      let qq = q.eq("item_grade", "brief").eq("is_archived", false).is("format_type", null);
      if (afterId) qq = qq.gt("id", afterId);
      return qq;
    },
  });
  const page = typeof limit === "number" && limit > 0 ? rows.slice(0, limit) : rows;

  const { byFormatType, skipped } = planFormatTypeBackfill(page, deps.specForItemType);
  const wouldWrite = [...byFormatType.values()].reduce((n, ids) => n + ids.length, 0);

  summary.counts = {
    null_candidates_scanned: rows.length,
    page_size: page.length,
    would_write: wouldWrite,
    by_format_type: Object.fromEntries([...byFormatType.entries()].map(([k, ids]) => [k, ids.length])),
    unknown_item_type_skipped: skipped.length,
  };
  summary.skipped = skipped;
  if (page.length) summary.last_id_processed = page[page.length - 1].id;

  if (!apply) return summary;

  let applied = 0;
  const writes = [];
  for (const [formatType, ids] of byFormatType) {
    const res = await deps.guardedUpdateByIds(
      "intelligence_items",
      ids,
      { format_type: formatType },
      { cite: CITE, applyMatch: (q) => q.is("format_type", null) },
    );
    applied += res.updated;
    writes.push({ format_type: formatType, attempted: ids.length, updated: res.updated });
  }
  summary.applied = applied;
  summary.counts.writes = writes;

  const after = await deps.readAll("intelligence_items", "id, format_type", {
    match: (q) => q.eq("item_grade", "brief").eq("is_archived", false).not("format_type", "is", null),
  });
  const byFormatAfter = {};
  for (const r of after) byFormatAfter[r.format_type] = (byFormatAfter[r.format_type] ?? 0) + 1;
  summary.read_back = { format_type_not_null_total: after.length, by_format_type: byFormatAfter };

  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const { limit, afterId } = parseBatchArgs(process.argv.slice(2));
  await runCli({
    step: "backfill-format-type",
    main: (opts, deps) => main({ ...opts, limit, afterId }, deps),
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
      // Lazy, dynamic on purpose -- see this file's header for why a top-level jiti/.ts import would
      // break the no-npm-ci discipline test job. Same alias shape scripts/verify/format-structure.mjs
      // already uses against this exact module (extract-registry.ts).
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(fsiRoot(), "src") } });
      const { specForItemType } = await jiti.import("../../src/lib/agent/extract-registry.ts");
      return { readAll, guardedUpdateByIds, specForItemType };
    },
  });
}
