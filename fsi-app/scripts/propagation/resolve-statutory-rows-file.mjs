// resolve-statutory-rows-file.mjs -- the ONE place propagation-drain.yml's write-statutory.mjs step
// decides WHICH rows-file to read. Extracted (lane STATUTORY-WRITER, 2026-09-29, coordinator ruling on
// PR #824) so the workflow's own "live path unchanged when the test-only input is absent" behavior is a
// pure, unit-tested function rather than inline shell logic nobody proves.
//
// WHY THIS EXISTS. The coordinator explicitly refused putting a test rows-file at the LIVE default path
// (scripts/propagation/fixtures/fueleu-annex-iv-rows.json): the workflow would later treat a file sitting
// there as real input, forever. Instead, propagation-drain.yml gained an OPT-IN, hand-dispatch-only
// `statutory_rows_file` input: when a coordinator explicitly passes it, the write-statutory.mjs step reads
// THAT path (a clearly-named test fixture under fixtures/, e.g. test-statutory-rows.dry.json) instead of
// the live default, and is forced to --dry regardless of the run's own mode (the workflow YAML's own
// RUN_STATUTORY_FORCE_DRY flag, set alongside this resolution, not this module's job). When the input is
// absent (every workflow_run chained dispatch, and every hand dispatch that doesn't set it), this resolves
// to the EXACT SAME live default path as before -- unchanged behavior, proven by this file's own tests.
//
// $0, no I/O, no env reads -- pure string logic only, so it is trivially unit-testable with no fixtures,
// no DB, no network.

export const DEFAULT_LIVE_ROWS_FILE = "scripts/propagation/fixtures/fueleu-annex-iv-rows.json";

/**
 * Resolve which rows-file path write-statutory.mjs's workflow step should read.
 * @param {string | undefined | null} override the `statutory_rows_file` workflow input, as GitHub Actions
 *   hands it through (an empty string when the input was not set -- workflow_dispatch string inputs never
 *   come through as `undefined`, but this accepts undefined/null too for a defensive, non-YAML caller).
 * @returns {string} `override.trim()` when non-empty, otherwise `DEFAULT_LIVE_ROWS_FILE` unchanged.
 */
export function resolveStatutoryRowsFile(override) {
  const trimmed = typeof override === "string" ? override.trim() : "";
  return trimmed.length ? trimmed : DEFAULT_LIVE_ROWS_FILE;
}

// ── CLI: `node resolve-statutory-rows-file.mjs "$STATUTORY_ROWS_FILE_OVERRIDE"` -- prints the resolved
// path to stdout, nothing else, so the workflow step can capture it with `ROWS_FILE=$(node ...)`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  process.stdout.write(resolveStatutoryRowsFile(process.argv[2]) + "\n");
}
