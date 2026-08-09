/** BEHAVIORAL-GOLDENS runner. GOVERNING: remediation-discipline + the invariant registry (each golden is
 *  a `selftest:` enforcer of a named invariant). Runs every behavioral golden in scripts/verify/ as its own
 *  process and fails non-zero if ANY golden FAILED — so the proofs that back load-bearing invariants
 *  actually EXECUTE in CI instead of merely existing in-tree.
 *
 *  WHY THIS EXISTS (2026-08-09, operator-directed). An audit found all 15 behavioral goldens were referenced
 *  by ZERO workflow/glob/hook: they were `selftest:`-cited as enforcement, git-tracked, and never run. Two
 *  were silently RED for weeks (surface-contract-gate had a real detection bug; two crashed on absent creds
 *  instead of self-skipping) and nobody knew, because nothing executed them. A proof that never runs is
 *  documentation wearing a test costume. This runner + the meta-gate's execution-wiring requirement
 *  (invariant-coverage.mjs: a `selftest:` token must be RUN by a runner, not merely tracked) close that class.
 *
 *  GLOB BY CONSTRUCTION (the run-test-suite.sh lesson — a hand list silently omits files): auto-discovers
 *  every `*.golden.mjs` AND `*-golden.mjs` under scripts/verify/. Dropping a new golden in the directory
 *  wires it here automatically; there is no hand list to forget to update.
 *
 *  CRED-AWARE, three states per golden (the sibling data-audit convention):
 *    exit 0 = PASS · exit 1 = FAIL (real red — fails this runner) · exit 2 = SKIP (no DB creds / cannot
 *    verify here; a LIVE-DB golden self-skips locally and runs for real in the secrets lane). Any other
 *    non-zero (crash/signal) is treated as FAIL — a golden that cannot even self-skip is itself broken.
 *
 *  Most goldens are pure (no DB, no network, no spend) and run everywhere including the no-secrets CI job;
 *  the LIVE-DB goldens (currently mutation-lease) self-skip without creds. Some goldens import jiti (an npm
 *  dep) to load TS/`@`-aliased modules, so this runner requires `npm ci` — it is wired into a CI job that
 *  installs deps, NOT the no-npm discipline suite. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

const goldens = readdirSync(HERE)
  .filter((f) => /(\.golden|-golden)\.mjs$/.test(f))
  .sort();

if (goldens.length === 0) {
  console.error("run-goldens: no golden files found in scripts/verify/ — expected at least one. Failing (a runner that finds nothing is a silent no-op).");
  process.exit(1);
}

const results = [];
for (const f of goldens) {
  process.stdout.write(`\n──────── ${f} ────────\n`);
  const r = spawnSync(process.execPath, [resolve(HERE, f)], { stdio: "inherit", env: process.env });
  const code = r.status == null ? 3 : r.status; // null => signal/crash => treat as FAIL
  const verdict = code === 0 ? "PASS" : code === 2 ? "SKIP" : "FAIL";
  results.push({ f, code, verdict });
}

console.log("\n════════ BEHAVIORAL-GOLDENS SUMMARY ════════");
for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.f}${r.verdict === "FAIL" ? ` (exit ${r.code})` : ""}`);

const failed = results.filter((r) => r.verdict === "FAIL");
const skipped = results.filter((r) => r.verdict === "SKIP");
console.log(`\npassed: ${results.filter((r) => r.verdict === "PASS").length} | failed: ${failed.length} | skipped (no creds): ${skipped.length} | total: ${results.length}`);
if (skipped.length) console.log(`skipped goldens (LIVE-DB, run for real in the secrets lane): ${skipped.map((r) => r.f).join(", ")}`);

if (failed.length) { console.log(`\nGOLDENS FAIL: ${failed.map((r) => r.f).join(", ")}`); process.exit(1); }
console.log("\nGOLDENS GREEN: every behavioral golden passed (or self-skipped for want of creds).");
process.exit(0);
