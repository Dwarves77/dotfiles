// STOP THE SCRAPE — honor the operator HOLD (2026-06-28), authorized by Jason.
// Guarded writes (snapshot prior rows -> reversible) via scripts/lib/db.mjs:
//   (3) system_state.global_processing_paused = true
//   (4) flip the 89 sources.auto_run_enabled true -> false
// Then read-back verify: 0 auto_run_enabled, global pause true, and report the snapshot files.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedUpdate, readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = readClient();
const CITE = { skill: "remediation-discipline", reason: "honor operator scraping HOLD (2026-06-28): stop active check-sources auto-scrape; reversible via snapshot" };

// prior state (for the report; guardedUpdate also snapshots full rows)
const { count: priorTrue } = await sb.from("sources").select("id", { count: "exact", head: true }).eq("auto_run_enabled", true);
const { data: ssPrior } = await sb.from("system_state").select("global_processing_paused").eq("id", true).maybeSingle();
console.log(`PRIOR: auto_run_enabled=true: ${priorTrue} | global_processing_paused: ${ssPrior?.global_processing_paused}`);

// (3) global pause = true
const g = await guardedUpdate("system_state", (qb) => qb.eq("id", true), { global_processing_paused: true }, { cite: CITE });
console.log(`\n[3] system_state.global_processing_paused -> true | updated=${g.updated} | snapshot=${g.snapshot}`);

// (4) flip the 89 auto_run_enabled true -> false (snapshot = full prior rows, reversible)
const a = await guardedUpdate("sources", (qb) => qb.eq("auto_run_enabled", true), { auto_run_enabled: false }, { cite: CITE });
console.log(`[4] sources.auto_run_enabled true->false | updated=${a.updated} | snapshot=${a.snapshot}`);

// READ-BACK VERIFY
const { count: nowTrue } = await sb.from("sources").select("id", { count: "exact", head: true }).eq("auto_run_enabled", true);
const { data: ssNow } = await sb.from("system_state").select("global_processing_paused").eq("id", true).maybeSingle();
console.log(`\n=== VERIFY ===`);
console.log(`  auto_run_enabled=true now: ${nowTrue}  (expect 0)  -> ${nowTrue === 0 ? "PASS" : "FAIL"}`);
console.log(`  global_processing_paused now: ${ssNow?.global_processing_paused}  (expect true) -> ${ssNow?.global_processing_paused === true ? "PASS" : "FAIL"}`);
console.log(`  check-sources will now: global-pause short-circuit AND 0 due sources -> renders NOTHING`);
console.log(`  workflow triggers: disabled_manually (source-monitoring + spot-check) -> crons will not fire`);
const ok = nowTrue === 0 && ssNow?.global_processing_paused === true;
console.log(`\n${ok ? "HOLD ENFORCED AT BOTH LAYERS (triggers off + gates set)." : "!!! VERIFY FAILED — investigate."}`);
process.exit(ok ? 0 : 1);
