// Pure orchestration for POST /api/admin/statutory-rows, split out of route.ts (F34's named residual:
// Next 16's route-type validator rejects a route.ts that exports anything besides route handlers/
// config, so the testable logic lives here and route.ts only wires request parsing + the admin gate).
//
// ONE PATH, NOT A FORK. Imports validateRowsFile/parseRow/writeOneRow from
// src/lib/propagation/statutory-rows.ts , the ONE pure home for this logic (lane M7a FIX, 2026-09-21).
// scripts/propagation/validate-statutory-rows-file.mjs (propagation-drain.yml's pre-flight gate) and
// scripts/propagation/write-statutory.mjs (the CLI --apply path) import from the SAME pure home , this
// route does NOT import either CLI script directly any more: doing so previously dragged
// scripts/lib/db.mjs's fs-backed guarded-write snapshot path into this route's Vercel function trace
// (db.mjs computes its snapshot directory from import.meta.url, a statically-resolvable path, so Next's
// output-file tracer pulled the entire fs-backed scripts/_snapshots/ directory , hundreds of MB of
// historical run artifacts , into the trace; see docs/ops/session-log.d/2026-09-20-m7a.md's Correction
// entry for the measured before/after). Nothing here reimplements row validation or the write itself ,
// logic.test.mjs asserts the route and the CLI both import from this one home and neither defines its own.
import { validateRowsFile, parseRow, writeOneRow } from "../../../../../src/lib/propagation/statutory-rows.ts";

/**
 * Validate + apply (or preview) a whole statutory rows-file body against statutory_computations.
 * A validator violation refuses the WHOLE body , nothing is parsed or written (the same "no partial
 * apply of an unreviewed file" posture validate-statutory-rows-file.mjs's own header documents for the
 * workflow gate).
 *
 * @param {object} supabase
 * @param {unknown} body
 * @param {"dry"|"apply"} mode
 * @param {{ validateRowsFileFn?: typeof validateRowsFile, parseRowFn?: typeof parseRow, writeOneRowFn?: typeof writeOneRow }} [deps]
 */
export async function processStatutoryRowsFile(supabase, body, mode, deps = {}) {
  const validateRowsFileFn = deps.validateRowsFileFn ?? validateRowsFile;
  const parseRowFn = deps.parseRowFn ?? parseRow;
  const writeOneRowFn = deps.writeOneRowFn ?? writeOneRow;

  const violations = validateRowsFileFn(body);
  if (violations.length) {
    return { ok: false, status: 422, violations };
  }

  const rawRows = Array.isArray(body) ? body : (body && body.rows) || [];
  const outcomes = [];
  const counts = { written: 0, wouldWrite: 0, skippedAlready: 0, refused: 0, errored: 0 };

  for (let i = 0; i < rawRows.length; i++) {
    let parsed;
    try {
      parsed = parseRowFn(rawRows[i], i);
    } catch (e) {
      counts.refused += 1;
      outcomes.push({ index: i, action: "refused-structural", detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    let out;
    try {
      out = await writeOneRowFn(supabase, parsed, mode);
    } catch (e) {
      // Every Supabase/unexpected error is destructured and logged (agent/run error-swallow post-mortem,
      // fsi-app/.claude/CLAUDE.md) , never swallowed into a generic failure with no detail.
      console.error(`[admin/statutory-rows] row[${i}] unexpected error:`, e instanceof Error ? e.message : e);
      counts.errored += 1;
      outcomes.push({ index: i, shipKey: parsed.shipKey, action: "errored", detail: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (out.action === "written") counts.written += 1;
    else if (out.action === "would-write") counts.wouldWrite += 1;
    else if (out.action === "skipped-already-computed") counts.skippedAlready += 1;
    else if (out.action === "refused-inadmissible") counts.refused += 1;
    else counts.errored += 1;
    outcomes.push({ index: i, shipKey: out.shipKey, action: out.action, detail: out });
  }

  return { ok: true, status: 200, total: rawRows.length, counts, outcomes };
}
