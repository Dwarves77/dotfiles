import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** @param {string} flag @returns {string|undefined} */
function argAfter(flag, argv) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/**
 * Reads `--csv <path>` and `--org-id <uuid>` off `process.argv`, resolving relative paths against
 * `process.cwd()`. Returns `{ csvText, orgId }` with any absent flag left `undefined`: a producer with
 * no `--csv` falls back to its own no-op "no operator rows file given" branch.
 */
export function readCliCsvArgs(argv = process.argv.slice(2)) {
  const csvPath = argAfter("--csv", argv);
  const orgId = argAfter("--org-id", argv);
  return {
    csvText: csvPath ? readFileSync(resolve(process.cwd(), csvPath), "utf8") : undefined,
    orgId,
  };
}
