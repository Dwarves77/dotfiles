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
