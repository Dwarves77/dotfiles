// Pure orchestration for POST /api/admin/statutory-rows, split out of route.ts (F34's named residual:
// Next 16's route-type validator rejects a route.ts that exports anything besides route handlers/
// config, so the testable logic lives here and route.ts only wires request parsing + the admin gate).
//
// ONE PATH, NOT A FORK. Imports validateRowsFile from scripts/propagation/validate-statutory-rows-file.mjs
// (the SAME module propagation-drain.yml's pre-flight gate uses) and parseRow/writeOneRow from
// scripts/propagation/write-statutory.mjs (the SAME functions the CLI --apply path uses). Nothing here
// reimplements row validation or the write itself , logic.test.mjs asserts these exact import
// specifiers so a fixture route that re-implements validation fails the assertion.
import { validateRowsFile } from "../../../../../scripts/propagation/validate-statutory-rows-file.mjs";
import { parseRow, writeOneRow } from "../../../../../scripts/propagation/write-statutory.mjs";

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
