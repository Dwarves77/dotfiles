/** DATA-AUDIT LANE runner (CI-with-secrets / nightly). GOVERNING: remediation-discipline.
 *  Runs every live-data audit in sequence, captures pass/fail/error per audit, and exits non-zero if ANY
 *  HARD audit failed (so the scheduled job notifies). Each audit is its own process (isolation: one audit's
 *  DB hiccup or process.exit does not abort the lane). Honest reporting: prints each audit's verdict and a
 *  final summary. Secrets come from the environment (never echoed). Run locally with .env.local present. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

// each: [label, scriptPath relative to fsi-app, hard?] — hard audits fail the lane; soft are informational
const AUDITS = [
  ["one-tier-per-host", "scripts/verify/one-tier-per-host-audit.mjs", true],
  ["claims-tier", "scripts/verify/claims-tier-audit.mjs", true],
  ["substrate-agreement", "scripts/verify/substrate-agreement-audit.mjs", true],
  ["vocab-sync", "scripts/verify/vocab-sync-audit.mjs", true],
  ["orphan-source", "scripts/verify/orphan-source-audit.mjs", true],
  ["quarantine-disposition", "scripts/verify/quarantine-disposition-audit.mjs", true],
  ["unregistered-span-host", "scripts/verify/unregistered-span-host-audit.mjs", true],
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
if (hardFailures.length) { console.log(`LANE FAIL: ${hardFailures.map((r) => r.label).join(", ")}`); process.exit(1); }
console.log("LANE GREEN: every hard data-audit passed.");
process.exit(0);
