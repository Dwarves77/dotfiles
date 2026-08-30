/**
 * WO-18 seeder — US EPA modal-default emission factors, from the committed fixture
 * fixtures/emission-factors/epa-modal-defaults-2025.json. $0, offline: no fetch at run time. The
 * fixture's own header carries the full derivation of every number (EPA GHG Emission Factors Hub
 * 2025, Table 8, confirmed against the primary PDF twice — [CONFIRMED], unlike the DESNZ fixture).
 *
 * source_key = 'epa_egrid', confirmed licence-clear live this session:
 *   SELECT redistribution, embeddable FROM data_sources WHERE source_key = 'epa_egrid';
 *   -> redistribution='permitted', embeddable=true.
 *
 * DRY-RUN by default; --apply writes through the guarded path (scripts/lib/db.mjs guardedInsertMany).
 * Idempotent on the natural key emission-factors-common.mjs defines.
 *
 * Rule-012: import.meta.url-relative fixture + env paths, no hardcoded absolute paths.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtureRows, seedFactors } from "./emission-factors-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const FIXTURE = resolve(HERE, "fixtures/emission-factors/epa-modal-defaults-2025.json");
const APPLY = process.argv.includes("--apply");

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason: "WO-18 emission-factors seeding: US EPA modal defaults (master execution plan v2, Stage 7)",
};

async function main() {
  const rows = loadFixtureRows(FIXTURE);
  const summary = await seedFactors({ label: "epa-seed", rows, cite: CITE, apply: APPLY });
  if (summary.mode === "apply" && !summary.written && summary.toWrite > 0) process.exit(1);
}

main().catch((e) => { console.error("[epa-seed] fatal:", e.message); process.exit(1); });
