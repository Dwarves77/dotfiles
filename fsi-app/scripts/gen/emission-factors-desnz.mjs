/**
 * WO-18 seeder — UK DESNZ modal-default emission factors, from the committed fixture
 * fixtures/emission-factors/desnz-modal-defaults-2025.json. $0, offline: no fetch at run time, every
 * number is already in the fixture (see that file's own header for full provenance, including the
 * [UNCONFIRMED]-against-primary-spreadsheet flag — read it before the first --apply).
 *
 * source_key = 'desnz_ghg_factors', confirmed licence-clear live this session:
 *   SELECT redistribution, embeddable FROM data_sources WHERE source_key = 'desnz_ghg_factors';
 *   -> redistribution='permitted', embeddable=true.
 *
 * DRY-RUN by default; --apply writes through the guarded path (scripts/lib/db.mjs guardedInsertMany).
 * Idempotent on the natural key emission-factors-common.mjs defines (no DB-level unique constraint
 * exists on emission_factors beyond factor_id — confirmed live, rule 0.15, see that module's header).
 *
 * Rule-012: import.meta.url-relative fixture + env paths, no hardcoded absolute paths.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtureRows, seedFactors } from "./emission-factors-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const FIXTURE = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");
const APPLY = process.argv.includes("--apply");

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason: "WO-18 emission-factors seeding: UK DESNZ modal defaults (master execution plan v2, Stage 7)",
};

async function main() {
  const rows = loadFixtureRows(FIXTURE);
  const summary = await seedFactors({ label: "desnz-seed", rows, cite: CITE, apply: APPLY });
  if (summary.mode === "apply" && !summary.written && summary.toWrite > 0) process.exit(1);
}

main().catch((e) => { console.error("[desnz-seed] fatal:", e.message); process.exit(1); });
