/** DATA-AUDIT LANE runner (CI-with-secrets / nightly). GOVERNING: remediation-discipline.
 *  Runs every live-data audit in sequence, captures pass/fail/error per audit, and exits non-zero if ANY
 *  HARD audit failed (so the scheduled job notifies). Each audit is its own process (isolation: one audit's
 *  DB hiccup or process.exit does not abort the lane). Honest reporting: prints each audit's verdict and a
 *  final summary. Secrets come from the environment (never echoed). Run locally with .env.local present. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readClient, guardedUpdate, guardedInsert } from "../lib/db.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
// Load env for the block-state reflect (Layer C). In CI the secrets are injected into the env; locally
// they live in .env.local. The child audits load it themselves; the runner needs it for the reflect.
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env already populated */ }

// LAYER C — the data-audit BLOCK row convention (MUST match src/lib/agent/audit-gate.ts DATA_AUDIT_BLOCK).
// On RED the lane ensures ONE open integrity_flags row of this shape; on GREEN it resolves any open one.
// Generation preflight HALTS while an open block lacks a current dated waiver — so corpus red is cleared
// only by a fix (green here -> resolved) or an explicit waiver, NEVER by waiting. See docs/data-audit-dispositions.md.
const BLOCK = { category: "data_integrity", subject_type: "system", subject_ref: "data-audit-lane", created_by: "data-audit-lane" };
const BLOCK_CITE = { skill: "remediation-discipline", reason: "data-audit lane block-next-run reflect (Layer C teeth)" };
const blockDesc = (labels) =>
  `Data-audit lane RED (block-next-run): ${labels}. Generation is HALTED until this is dispositioned ` +
  `(fix -> green, or a dated waiver in docs/data-audit-dispositions.md + recommended_actions).`;

// Reflect the lane verdict into the block row. Idempotent: never opens a duplicate while one is open;
// resolves all open blocks on green. Writes go through the guarded db.mjs path (rule 015 + reversibility).
// Best-effort — a reflect failure (incl. no DB creds) must not change the lane's own verdict.
async function reflectBlockState(hardFailures) {
  let sb;
  try { sb = readClient(); } catch { console.log("[block-state] no DB creds — skipping integrity_flags reflect (verdict unaffected)."); return; }
  const { data: open, error } = await sb.from("integrity_flags").select("id")
    .eq("category", BLOCK.category).eq("subject_ref", BLOCK.subject_ref).eq("status", "open");
  if (error) { console.warn(`[block-state] read failed: ${error.message}`); return; }
  if (hardFailures.length) {
    const labels = hardFailures.map((r) => r.label).join(", ");
    if (open && open.length) {
      await guardedUpdate("integrity_flags", (qb) => qb.eq("id", open[0].id), { description: blockDesc(labels) }, { cite: BLOCK_CITE });
      console.log(`[block-state] RED — refreshed existing block ${open[0].id} (${labels}).`);
    } else {
      const ins = await guardedInsert("integrity_flags", {
        ...BLOCK, description: blockDesc(labels),
        recommended_actions: [{ action: "fix_then_green", rationale: `resolve the failing checks: ${labels}` }],
        status: "open",
      }, { cite: BLOCK_CITE });
      console.log(`[block-state] RED — opened block ${ins.inserted?.id ?? "?"} (${labels}).`);
    }
  } else if (open && open.length) {
    await guardedUpdate("integrity_flags", (qb) => qb.in("id", open.map((r) => r.id)), { status: "resolved" }, { cite: BLOCK_CITE });
    console.log(`[block-state] GREEN — resolved ${open.length} stale block(s); generation unblocked.`);
  } else {
    console.log("[block-state] GREEN — no open block; nothing to resolve.");
  }
}

// each: [label, scriptPath relative to fsi-app, hard?] — hard audits fail the lane; soft are informational
const AUDITS = [
  ["one-tier-per-host", "scripts/verify/one-tier-per-host-audit.mjs", true],
  ["claims-tier", "scripts/verify/claims-tier-audit.mjs", true],
  ["substrate-agreement", "scripts/verify/substrate-agreement-audit.mjs", true],
  ["ledger-onepass", "scripts/verify/ledger-onepass-audit.mjs", true],
  ["vocab-sync", "scripts/verify/vocab-sync-audit.mjs", true],
  ["orphan-source", "scripts/verify/orphan-source-audit.mjs", true],
  ["quarantine-disposition", "scripts/verify/quarantine-disposition-audit.mjs", true],
  ["unregistered-span-host", "scripts/verify/unregistered-span-host-audit.mjs", true],
  ["schema-drift", "scripts/verify/schema-drift-audit.mjs", true],
  ["skill-conformance", "scripts/audit-skill-conformance.mjs", false],
];

const results = [];
for (const [label, rel, hard] of AUDITS) {
  process.stdout.write(`\n──────── ${label} ────────\n`);
  const r = spawnSync(process.execPath, [resolve(ROOT, rel)], { stdio: "inherit", env: process.env });
  const code = r.status == null ? 2 : r.status; // null => signal/crash
  results.push({ label, hard, code, verdict: code === 0 ? "PASS" : code === 1 ? "FAIL" : "ERROR" });
}

console.log("\n════════ DATA-AUDIT LANE SUMMARY ════════");
for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.hard ? "[hard]" : "[soft]"} ${r.label}`);
const hardFailures = results.filter((r) => r.hard && r.code !== 0);
const softFailures = results.filter((r) => !r.hard && r.code !== 0);
console.log(`\nhard failures/errors: ${hardFailures.length} | soft (informational): ${softFailures.length}`);

// LAYER C teeth — reflect the verdict into the block row so generation preflight can HALT on undisposed red.
await reflectBlockState(hardFailures);

if (hardFailures.length) { console.log(`LANE FAIL: ${hardFailures.map((r) => r.label).join(", ")}`); process.exit(1); }
console.log("LANE GREEN: every hard data-audit passed.");
process.exit(0);
