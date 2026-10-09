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
 *  every golden under scripts/verify/ AT ANY DEPTH, by one name rule (isGoldenFile): `*.golden.{mjs,cjs}`,
 *  `*.goldens.{mjs,cjs}`, `*-golden.{mjs,cjs}` and `golden-*.{mjs,cjs}`. Dropping a new golden in the
 *  directory wires it here automatically; there is no hand list to forget to update. (GATE-9, 2026-10-08,
 *  AUD-AT-5 FC-5: the glob was non-recursive and knew two spellings, so a golden in a subdirectory, or named
 *  `.goldens.` or `golden-x`, was tracked, wired by nothing and green. A golden OUTSIDE scripts/verify/ is
 *  caught by the unrun-test-file check, test-discovery.mjs `--check-unrun`.)
 *
 *  CRED-AWARE, three states per golden (the sibling data-audit convention):
 *    exit 0 = PASS · exit 1 = FAIL (real red — fails this runner) · exit 2 = SKIP (no DB creds / cannot
 *    verify here; a LIVE-DB golden self-skips locally and runs for real in the secrets lane). Any other
 *    non-zero (crash/signal) is treated as FAIL — a golden that cannot even self-skip is itself broken.
 *
 *  A SKIP IS NOT A PASS (GATE-9, AUD-AT-5 FC-4). A golden that always `process.exit(2)`ed read as skipped, the
 *  runner said GOLDENS GREEN, and the proof never ran. Two rules close it: a SKIP must carry a reason line (a
 *  line of its output that says why: skip, cannot verify, no credentials), and a run in which NO golden passed
 *  (every one skipped) fails. A skip with no reason is a FAIL.
 *
 *  Most goldens are pure (no DB, no network, no spend) and run everywhere including the no-secrets CI job;
 *  the LIVE-DB goldens (currently mutation-lease) self-skip without creds. Some goldens import jiti (an npm
 *  dep) to load TS/`@`-aliased modules, so this runner requires `npm ci` — it is wired into a CI job that
 *  installs deps, NOT the no-npm discipline suite.
 *
 *  CLI: node scripts/verify/run-goldens.mjs [--dir=<directory of goldens>]  (--dir exists so the sibling test
 *  can run the real script, with its real exit status, over a fixture directory).
 *  Exit 0 = GOLDENS GREEN, 1 = a golden failed, skipped without a reason, none were found, or none passed. */
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isMainModule } from "../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const GOLDEN_NAME_RE = /(?:\.goldens?|-golden)\.(?:mjs|cjs)$|^golden-.+\.(?:mjs|cjs)$/;
/** A line of golden output that says WHY it skipped. */
const SKIP_REASON_RE = /\b(?:skip(?:ped|ping)?|cannot verify|can't verify|no (?:db )?creds?|credentials?)\b/i;

/** @param {string} name a bare file name @returns {boolean} */
export function isGoldenFile(name) {
  return GOLDEN_NAME_RE.test(String(name));
}

/** Every golden under `dir` at any depth, as sorted paths relative to `dir` (POSIX separators).
 *  @param {string} dir @returns {string[]} */
export function discoverGoldens(dir) {
  const found = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(next);
      else if (isGoldenFile(e.name)) found.push(next);
    }
  };
  walk("");
  return found.sort();
}

/** The verdict for one golden run. PURE.
 *  @param {number|null} code the exit status, null for a signal or crash @param {string} output stdout + stderr
 *  @returns {{verdict: "PASS"|"SKIP"|"FAIL", code: number, note: string}} */
export function classifyGolden(code, output) {
  const c = code == null ? 3 : code; // null => signal/crash => FAIL
  if (c === 0) return { verdict: "PASS", code: c, note: "" };
  if (c === 2) {
    const reason = String(output ?? "").split(/\r?\n/).some((l) => l.trim().length >= 8 && SKIP_REASON_RE.test(l));
    return reason
      ? { verdict: "SKIP", code: c, note: "" }
      : { verdict: "FAIL", code: c, note: "exited 2 (skip) with no reason line in its output, so the skip is unexplained" };
  }
  return { verdict: "FAIL", code: c, note: "" };
}

/** The runner's overall verdict from the per-golden results. PURE.
 *  @param {{f: string, verdict: string}[]} results @returns {{ok: boolean, line: string}} */
export function overallVerdict(results) {
  const failed = results.filter((r) => r.verdict === "FAIL");
  const passed = results.filter((r) => r.verdict === "PASS");
  if (failed.length) return { ok: false, line: `GOLDENS FAIL: ${failed.map((r) => r.f).join(", ")}` };
  if (passed.length === 0) return { ok: false, line: `GOLDENS FAIL: no golden passed (${results.length} found, every one skipped); a run that proved nothing is not green` };
  return { ok: true, line: "GOLDENS GREEN: every behavioral golden passed (or self-skipped, with its reason, for want of creds)." };
}

/**
 * Run every golden under `dir`. Spawn and the two writers are injected so a test needs no real process.
 * @returns {number} the exit status
 */
export function runGoldens({
  dir = HERE,
  spawn = (file) => spawnSync(process.execPath, [file], { stdio: ["inherit", "pipe", "pipe"], env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
  out = (s) => process.stdout.write(s),
  errOut = (s) => process.stderr.write(s),
  log = (s) => console.log(s),
} = {}) {
  const goldens = discoverGoldens(dir);
  if (goldens.length === 0) {
    console.error("run-goldens: no golden files found in scripts/verify/, expected at least one. Failing (a runner that finds nothing is a silent no-op).");
    return 1;
  }

  const results = [];
  for (const f of goldens) {
    out(`\n──────── ${f} ────────\n`);
    const r = spawn(resolve(dir, f));
    const stdout = String(r.stdout ?? "");
    const stderr = String(r.stderr ?? "");
    if (stdout) out(stdout);
    if (stderr) errOut(stderr);
    const { verdict, code, note } = classifyGolden(r.status, `${stdout}\n${stderr}`);
    results.push({ f, code, verdict, note });
  }

  log("\n════════ BEHAVIORAL-GOLDENS SUMMARY ════════");
  for (const r of results) log(`  ${r.verdict.padEnd(5)} ${r.f}${r.verdict === "FAIL" ? ` (exit ${r.code}${r.note ? `: ${r.note}` : ""})` : ""}`);

  const skipped = results.filter((r) => r.verdict === "SKIP");
  log(`\npassed: ${results.filter((r) => r.verdict === "PASS").length} | failed: ${results.filter((r) => r.verdict === "FAIL").length} | skipped (no creds): ${skipped.length} | total: ${results.length}`);
  if (skipped.length) log(`skipped goldens (LIVE-DB, run for real in the secrets lane): ${skipped.map((r) => r.f).join(", ")}`);

  const verdict = overallVerdict(results);
  log(`\n${verdict.line}`);
  return verdict.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  const dirArg = process.argv.find((a) => a.startsWith("--dir="));
  process.exit(runGoldens(dirArg ? { dir: resolve(dirArg.slice("--dir=".length)) } : {}));
}
