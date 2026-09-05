// cli-csv-args.mjs — the ONE place every spec09 CSV producer reads its `--csv <path>` / `--org-id <uuid>`
// / `--custody-csv <path>` CLI flags from process.argv. `runCli` (scripts/maintenance/lib/cli.mjs) only
// parses --mode/--arg/--out itself and hands nothing else through to a wrapper's buildDeps, so each
// producer's buildDeps reads these directly off `process.argv` (same process, no extra plumbing needed
// in cli.mjs, which is shared infra outside this lane's write set). One shared reader here, not six
// copies of the same three-line argv scan.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** @param {string} flag @returns {string|undefined} */
function argAfter(flag, argv) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/**
 * Reads `--csv <path>`, `--org-id <uuid>`, and (for the eudr-custody producer, which writes two tables)
 * `--custody-csv <path>` off `process.argv`, resolving relative paths against `process.cwd()`. Returns
 * `{ csvText, custodyCsvText, orgId }` with any absent flag left `undefined` — a producer with no `--csv`
 * falls back to its own no-op "no customer CSV given" branch exactly as before this lane's change.
 */
export function readCliCsvArgs(argv = process.argv.slice(2)) {
  const csvPath = argAfter("--csv", argv);
  const custodyCsvPath = argAfter("--custody-csv", argv);
  const orgId = argAfter("--org-id", argv);
  return {
    csvText: csvPath ? readFileSync(resolve(process.cwd(), csvPath), "utf8") : undefined,
    custodyCsvText: custodyCsvPath ? readFileSync(resolve(process.cwd(), custodyCsvPath), "utf8") : undefined,
    orgId,
  };
}
