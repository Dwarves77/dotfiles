/** LEDGER RECONCILIATION (standing dispatch step 1b, ruling 2026-07-04). The 4c judge-runner spent through the
 *  spend-client (spendStream) but NEVER called logSpendRun, so ~$0.41 of real Haiku judge spend across four
 *  runs was accounted only in the per-process in-memory ledger and NEVER written to agent_runs. The durable
 *  program ledger (agent_runs SUM, which seeds the ceiling) therefore UNDER-COUNTS by that amount. This inserts
 *  ONE corrective agent_runs row via the PURE-NODE guarded path (proven durable) with a full audit breakdown,
 *  so the seeded ceiling reflects true spend. Root cause of the omission: spendStream only account()s in-memory;
 *  logSpendRun is the agent_runs writer and the runner didn't call it. FIX forward: the plan-apply runner
 *  template logs its own telemetry + reads it back cross-process (dispatch step 3c). DRY-RUN default; --apply. */
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readClient, guardedInsert } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");

// Unlogged 4c judge spend, from each run's in-process DONE line (the durable in-process logs):
const RUNS = [
  { run: "4c judge sample-of-3", usd: 0.0161, calls: 26 },
  { run: "4c judge full run 1", usd: 0.1885, calls: 293 },
  { run: "4c judge full run 2 (hardened persistence check)", usd: 0.1871, calls: 292 },
  { run: "4c judge --limit 8 (jiti-import test)", usd: 0.0227, calls: 36 },
];
const total = Number(RUNS.reduce((a, r) => a + r.usd, 0).toFixed(6));
const calls = RUNS.reduce((a, r) => a + r.calls, 0);

const sb = readClient();
// idempotency: refuse if a 4c-judge-reconcile row already exists
const { data: existing } = await sb.from("agent_runs").select("id,cost_usd_estimated").eq("fetch_method", "4c-judge-reconcile");
console.log(`\n=== 4c JUDGE LEDGER RECONCILE (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`unlogged 4c judge spend: $${total} across ${calls} Haiku calls / ${RUNS.length} runs`);
for (const r of RUNS) console.log(`  ${r.run.padEnd(48)} $${r.usd.toFixed(4)} (${r.calls} calls)`);
if (existing && existing.length) { console.log(`ALREADY RECONCILED: ${existing.length} row(s) totaling $${existing.reduce((a, r) => a + Number(r.cost_usd_estimated), 0).toFixed(4)} — no-op.`); process.exit(0); }

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to insert the corrective agent_runs row.`); process.exit(0); }

const nowIso = new Date().toISOString();
const { inserted } = await guardedInsert("agent_runs", {
  intelligence_item_id: null, source_url: null, fetch_method: "4c-judge-reconcile",
  started_at: nowIso, ended_at: nowIso, status: "success",
  cost_usd_estimated: total,
  errors: [{ telemetry: { reconcile: "4c judge spendStream calls never logged via logSpendRun", calls, runs: RUNS } }],
}, { cite: { skill: "remediation-discipline", reason: "step-1b ledger reconcile: record unlogged 4c judge spend so the seeded ceiling reflects true program total" } });
console.log(`\nINSERTED corrective row id=${inserted?.id}. Re-read program total to confirm the corrected total.`);
process.exit(0);
