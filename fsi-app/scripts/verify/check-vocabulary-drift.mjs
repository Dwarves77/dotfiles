/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (Section 2, Class-Over-
 *  Instance) + D7 (docs/plans/defect-fix-plan-2026-09-12.md). CHECK-VOCABULARY DRIFT: the tracked
 *  inventory (fsi-app/docs/inventories/db-check-constraints.json, written by
 *  scripts/maintenance/schema-vocabulary-inventory.mjs) is the source lanes and check-vocabulary.test.mjs
 *  read to validate a literal a writer is about to use. It drifts from the live schema the moment a
 *  migration widens or narrows a CHECK constraint and nobody re-runs the inventory step. This audit runs
 *  the SAME query live and reports every constraint whose allowed set differs from the tracked JSON.
 *
 *  Three states (the sibling-audit convention): exit 0 = no drift; exit 1 = at least one constraint's
 *  live allowed set differs from the tracked JSON, or a constraint is present on only one side (REPORTED,
 *  fails the hard lane); exit 2 = no DB creds / engine error (cannot verify).
 *
 *  Read-only (pg-direct via scripts/lib/pg-conn.mjs's shared resolver, the same one schema-drift-audit.mjs
 *  and vocab-sync-audit.mjs use). Never writes the database or the tracked JSON: a drift is REPORTED for
 *  a human/lane to re-run the inventory step, never auto-corrected here.
 *
 *  CREDENTIALS CHECKED BEFORE THE CLIENT IS EVEN IMPORTED (D7 Fix round 3, PR #660 red): pg-conn.mjs
 *  statically imports the "pg" npm package, so a bare `import { connectPg } from "../lib/pg-conn.mjs"` at
 *  this file's own top level pulls "pg" in at MODULE LOAD, before any code runs. This script's own test
 *  (check-vocabulary-drift.test.mjs) spawns it as a subprocess to prove the exit-2 self-skip, and CI's
 *  no-npm "Discipline engine unit tests" job has no node_modules at all -- the spawned process died with
 *  ERR_MODULE_NOT_FOUND instead of the documented exit 2, because the import happened unconditionally
 *  regardless of whether credentials existed to use it. hasPlausibleCredentials() (a cheap process.env
 *  read, no import) now runs FIRST; pg-conn.mjs is imported dynamically, only on the branch that already
 *  knows it has something to try connecting with. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLiveInventoryEntry } from "../maintenance/lib/vocab-inventory.mjs";
import { QUERY, OUTPUT_PATH } from "../maintenance/schema-vocabulary-inventory.mjs";
import { diffVocabulary } from "./lib/vocab-drift.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// CHECK_VOCAB_DRIFT_NO_ENV_FILE=1 skips the env-file load. The no-credential tests set it: without it the
// child process read the env file from disk, so in a worktree that HAS one "no credentials" was false and
// the self-skip tests failed there and nowhere else (2026-09-18, it stopped lane M2's push).
if (process.env.CHECK_VOCAB_DRIFT_NO_ENV_FILE !== "1") {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env from secrets */ }
}

/** Mirrors pg-conn.mjs's own candidateConnStrings() gate: the local-link and NEXT_PUBLIC_SUPABASE_URL-
 *  derived pooler candidates both still require SUPABASE_DB_PASSWORD, so these three names cover every
 *  branch that could ever produce a real connection string. Pure (env in, boolean out); exported for the
 *  test. */
export function hasPlausibleCredentials(env = process.env) {
  return Boolean(env.SUPABASE_DB_URL || env.DATABASE_URL || env.SUPABASE_DB_PASSWORD);
}

async function main() {
  if (!hasPlausibleCredentials()) {
    console.error("check-vocabulary-drift: no working Postgres connection, cannot verify here (exit 2).");
    process.exit(2);
  }

  // Dynamic, and only reached past the check above: a credential-less run (this exact no-npm simulation
  // included) never touches pg-conn.mjs, so it never touches the "pg" package either.
  const { connectPg } = await import("../lib/pg-conn.mjs");
  const client = await connectPg();
  if (!client) {
    console.error("check-vocabulary-drift: no working Postgres connection, cannot verify here (exit 2).");
    process.exit(2);
  }

  try {
    const { rows } = await client.query(QUERY);
    const liveEntries = rows.map((r) => buildLiveInventoryEntry(r));

    let trackedDoc;
    try {
      trackedDoc = JSON.parse(readFileSync(OUTPUT_PATH, "utf8"));
    } catch (e) {
      console.error(`check-vocabulary-drift: cannot read/parse the tracked inventory at ${OUTPUT_PATH}: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(2);
    }

    const { drift, onlyLive, onlyTracked } = diffVocabulary(liveEntries, trackedDoc.constraints ?? []);
    console.log(`check-vocabulary-drift: ${liveEntries.length} live constraint(s), ${(trackedDoc.constraints ?? []).length} tracked (source: ${trackedDoc.source ?? "unknown"}, generated: ${trackedDoc.generated ?? "unknown"}).`);

    if (drift.length === 0 && onlyLive.length === 0 && onlyTracked.length === 0) {
      console.log("PASS: every tracked constraint's allowed set matches the live schema.");
      process.exit(0);
    }

    if (drift.length) {
      console.error(`\nDRIFT: ${drift.length} constraint(s) whose allowed set differs from the tracked JSON:`);
      for (const d of drift) console.error(`  ${d.table}.${d.column} (${d.constraint}): live=[${(d.live ?? []).join(",")}] tracked=[${(d.tracked ?? []).join(",")}]`);
    }
    if (onlyLive.length) {
      console.error(`\nNEW LIVE: ${onlyLive.length} constraint(s) live but absent from the tracked JSON:`);
      for (const e of onlyLive) console.error(`  ${e.table}.${e.column ?? "?"} (${e.constraint})`);
    }
    if (onlyTracked.length) {
      console.error(`\nSTALE TRACKED: ${onlyTracked.length} constraint(s) tracked but no longer live:`);
      for (const e of onlyTracked) console.error(`  ${e.table}.${e.column ?? "?"} (${e.constraint})`);
    }
    console.error("\nRemediation: dispatch maintenance.yml's schema-vocabulary-inventory step (mode=dry) to refresh docs/inventories/db-check-constraints.json.");
    process.exit(1);
  } catch (e) {
    console.error(`check-vocabulary-drift: engine/cred error, ${e instanceof Error ? e.message : String(e)}. Exit 2.`);
    process.exit(2);
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();
