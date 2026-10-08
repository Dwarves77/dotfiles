#!/usr/bin/env node
// run-attacks.mjs -- the chain-proof ATTACK SUITE runner (lane PROOF-4, 2026-10-07; ADR-045; CLAUDE.md rule 15).
//
// Every security guard in the product is attacked against the REAL schema the chain-proof job built on its disposable
// local Supabase stack, and each attack MUST FAIL: the guard holds, or the run is red. The attacks are declared in
// attacks.json (invariant, steps, expected refusal); this runner executes them and writes attacks-report.json
// (invariant, expected, observed, pass or fail) into the job's output directory, which the workflow uploads.
//
//   kind "sql"            steps in a rolled-back transaction, impersonating roles (attack-engine.mjs)
//   kind "script"         an existing adversarial audit, called as a child process (script-attack.mjs)
//   kind "sql-block"      a migration's own self-check block, re-run on the loaded data (script-attack.mjs)
//   kind "tier-override"  the real recompute-tiers writer against an overridden source (tier-override-attack.mjs)
//
// "Pass" means the invariant HELD. An attack that was not exercised (an empty fixture, a skipped probe, a control
// that did not move) is a failure, never a skip: a proof that does not execute is not a proof (rule 15).
//
// Attack on the attacker: run-attacks.test.mjs feeds the runner a database that lets the forbidden action through
// and requires exit 1.
//
// LOCAL ONLY. The runner refuses (exit 2) unless the environment is the local stack's (loopback database and API
// hosts, CHAIN_PROOF_LOCAL=1, no production host named anywhere). scripts/proof/preflight.mjs says the same before the
// step; this is the belt to that brace, because the fixtures and the tier attack WRITE.
//
// Exit: 0 every attack held; 1 at least one attack did not hold (or none ran); 2 cannot run (not local, no database,
// bad manifest).
//
// Usage: node scripts/proof/attacks/run-attacks.mjs [--out-dir <dir>] [--only id,id] [--list]
// The output directory defaults to CP_OUT_DIR, which the workflow exports to every step.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../lib/is-main.mjs";
import { isLoopbackHost } from "../../lib/pg-conn.mjs";
import { runSqlAttack, parseRole, STEP_KINDS, EXPECT_KEYS } from "./attack-engine.mjs";
import { runScriptAttack, runSqlBlockAttack } from "./script-attack.mjs";
import { runTierOverrideAttack } from "./tier-override-attack.mjs";
import { setupFixtures, teardownFixtures, fixtureContext } from "./fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..", "..");
export const MANIFEST_PATH = join(HERE, "attacks.json");
export const KINDS = Object.freeze(["sql", "script", "sql-block", "tier-override"]);

const PRODUCTION_MARKERS = ["supabase.co", "supabase.com", "carosledge.com", "vercel.app", "vercel.com"];
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };

/** Read and parse the manifest. Validation is a separate call. */
export function loadManifest(path = MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Local-stack environment check. PURE. Names variables, never values. */
export function assertLocalOnly(env) {
  const violations = [];
  if (env.CHAIN_PROOF_LOCAL !== "1") violations.push("CHAIN_PROOF_LOCAL is not 1");
  for (const name of ["SUPABASE_DB_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const v = env[name];
    if (!v || !String(v).trim()) violations.push(`${name} is missing`);
    else if (!isLoopbackHost(hostOf(v))) violations.push(`${name} does not name a loopback host`);
  }
  if (env.DATABASE_URL && !isLoopbackHost(hostOf(env.DATABASE_URL))) violations.push("DATABASE_URL does not name a loopback host");
  for (const [name, value] of Object.entries(env)) {
    const lower = String(value ?? "").toLowerCase();
    if (PRODUCTION_MARKERS.some((m) => lower.includes(m))) violations.push(`production host named in ${name}`);
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";
const compiles = (p) => { try { new RegExp(p, "m"); return true; } catch { return false; } };

function validateSteps(a, errors) {
  if (!Array.isArray(a.steps) || a.steps.length === 0) { errors.push(`${a.id}: steps must be a non-empty array`); return; }
  a.steps.forEach((s, i) => {
    const at = `${a.id} step ${i + 1}`;
    if (!nonEmpty(s.label)) errors.push(`${at}: label is required`);
    if (!STEP_KINDS.includes(s.kind)) errors.push(`${at}: kind "${s.kind}" is not one of ${STEP_KINDS.join(", ")}`);
    if (!nonEmpty(s.sql)) errors.push(`${at}: sql is required`);
    if (!s.expect || typeof s.expect !== "object" || Object.keys(s.expect).length === 0) errors.push(`${at}: expect is required`);
    else for (const k of Object.keys(s.expect)) if (!EXPECT_KEYS.includes(k)) errors.push(`${at}: unknown expectation key "${k}"`);
    try { parseRole(s.as); } catch (e) { errors.push(`${at}: ${e.message}`); }
    if (s.params !== undefined && !Array.isArray(s.params)) errors.push(`${at}: params must be an array`);
  });
}

/** Every defect in a manifest, as strings. PURE. */
export function validateManifest(m) {
  const errors = [];
  if (!m || m.version !== 1) errors.push("manifest version must be 1");
  if (!m || !Array.isArray(m.attacks) || m.attacks.length === 0) { errors.push("manifest has no attacks: an empty suite proves nothing"); return errors; }
  const seen = new Set();
  for (const a of m.attacks) {
    if (!nonEmpty(a.id)) { errors.push("an attack has no id"); continue; }
    if (seen.has(a.id)) errors.push(`duplicate attack id ${a.id}`);
    seen.add(a.id);
    if (!KINDS.includes(a.kind)) errors.push(`${a.id}: kind "${a.kind}" is not one of ${KINDS.join(", ")}`);
    if (!nonEmpty(a.invariant)) errors.push(`${a.id}: invariant is required`);
    if (!nonEmpty(a.expected)) errors.push(`${a.id}: expected is required`);
    if (a.kind === "sql") validateSteps(a, errors);
    if (a.kind === "script") {
      if (!nonEmpty(a.script)) errors.push(`${a.id}: script is required`);
      for (const list of ["require", "forbid"]) {
        for (const q of a[list] ?? []) if (!nonEmpty(q.label) || !compiles(q.pattern)) errors.push(`${a.id}: ${list} entry needs a label and a valid pattern`);
      }
    }
    if (a.kind === "sql-block") {
      for (const k of ["file", "start_marker", "end_marker", "require_notice"]) if (!nonEmpty(a[k])) errors.push(`${a.id}: ${k} is required`);
    }
  }
  return errors;
}

/** Assemble the report. PURE. */
export function buildReport({ results, fixtures, startedAt, finishedAt }) {
  const passed = results.filter((r) => r.status === "pass").length;
  return {
    schema: 1,
    suite: "chain-proof-attacks",
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    seconds: Math.round((finishedAt - startedAt) / 1000),
    local_only: true,
    fixtures,
    summary: { attacks: results.length, passed, failed: results.length - passed },
    attacks: results,
  };
}

/** 0 only when at least one attack ran and every attack held. PURE. */
export function exitCodeFor(report) {
  return report.summary.attacks > 0 && report.summary.failed === 0 ? 0 : 1;
}

const firstLine = (s, n = 140) => String(s ?? "").split("\n")[0].slice(0, n);

/** Run the attacks. Every dependency is injectable. Returns the report. */
export async function runAll({
  manifest, client, spawn = spawnSync, env = process.env, cwd = FSI_ROOT, only = null,
  echo = (s) => process.stdout.write(s), now = () => new Date(),
  readFile = (f) => readFileSync(f, "utf8"),
}) {
  const startedAt = now();
  const attacks = only?.length ? manifest.attacks.filter((a) => only.includes(a.id)) : manifest.attacks;
  const needed = attacks.some((a) => a.needs_fixtures);
  const fixtures = { needed, created: false, removed: false, error: null, teardown_error: null };
  let ctx = {};
  if (needed) {
    try {
      await setupFixtures(client);
      fixtures.created = true;
      ctx = fixtureContext();
    } catch (e) {
      fixtures.error = firstLine(e.message);
    }
  }

  const results = [];
  for (const a of attacks) {
    let outcome;
    if (a.needs_fixtures && !fixtures.created) {
      outcome = { status: "fail", observed: `not exercised: the fixture users were not created (${fixtures.error})` };
    } else {
      try {
        if (a.kind === "sql") outcome = await runSqlAttack(client, a, ctx);
        else if (a.kind === "script") outcome = runScriptAttack({ attack: a, spawn, cwd, env, echo });
        else if (a.kind === "sql-block") outcome = await runSqlBlockAttack({ client, attack: a, readFile: (f) => readFile(join(cwd, f)) });
        else outcome = await runTierOverrideAttack({ attack: a, client, spawn, cwd, env, echo });
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch { /* no transaction to roll back */ }
        outcome = { status: "fail", observed: `engine error: ${firstLine(e.message)}` };
      }
    }
    results.push({
      id: a.id, group: a.group ?? null, kind: a.kind, invariant: a.invariant, expected: a.expected, reference: a.reference ?? null,
      status: outcome.status, observed: outcome.observed, ...(outcome.steps ? { steps: outcome.steps } : {}),
    });
  }

  if (fixtures.created) {
    try { await teardownFixtures(client); fixtures.removed = true; } catch (e) { fixtures.teardown_error = firstLine(e.message); }
  }
  return buildReport({ results, fixtures, startedAt, finishedAt: now() });
}

function parseArgs(argv) {
  const out = { outDir: null, only: null, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") out.outDir = argv[++i];
    else if (argv[i] === "--only") out.only = String(argv[++i]).split(",").filter(Boolean);
    else if (argv[i] === "--list") out.list = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

/** The CLI body, with every side effect injectable. Returns the exit code. */
export async function cliMain({
  argv = process.argv.slice(2), env = process.env,
  connect = async () => (await import("../../lib/pg-conn.mjs")).connectPg(),
  loadManifest: load = loadManifest, spawn = spawnSync,
  writeFile = writeFileSync, makeDir = mkdirSync, cwd = FSI_ROOT, log = console.log,
}) {
  let args;
  try { args = parseArgs(argv); } catch (e) { log(`run-attacks: ${e.message}`); return 2; }
  let manifest;
  try { manifest = load(); } catch (e) { log(`run-attacks: cannot read the manifest: ${firstLine(e.message)}`); return 2; }
  const defects = validateManifest(manifest);
  if (defects.length) { log("run-attacks: the manifest is invalid:"); defects.forEach((d) => log(`  - ${d}`)); return 2; }
  if (args.list) { manifest.attacks.forEach((a) => log(`${a.id}\t${a.kind}\t${a.invariant}`)); return 0; }

  const local = assertLocalOnly(env);
  if (!local.ok) { log("run-attacks: REFUSED, the environment is not the local stack:"); local.violations.forEach((v) => log(`  - ${v}`)); return 2; }

  const client = await connect();
  if (!client) { log("run-attacks: no database connection to the local stack. Cannot verify, exit 2."); return 2; }
  try {
    const report = await runAll({ manifest, client, spawn, env, cwd, only: args.only, echo: (s) => log(String(s).replace(/\n$/, "")) });
    for (const r of report.attacks) log(`${r.status === "pass" ? "HELD  " : "BROKEN"} ${r.id}  ${firstLine(r.observed, 160)}`);
    log(`run-attacks: ${report.summary.passed} of ${report.summary.attacks} attacks failed to get through; ${report.summary.failed} did not.`);
    if (report.fixtures.teardown_error) log(`run-attacks: fixture teardown error (stack is disposable): ${report.fixtures.teardown_error}`);
    const outDir = args.outDir ?? env.CP_OUT_DIR ?? null;
    if (outDir) {
      makeDir(outDir, { recursive: true });
      writeFile(join(outDir, "attacks-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
    } else {
      log("run-attacks: no output directory (--out-dir or CP_OUT_DIR); the report was not written.");
    }
    return exitCodeFor(report);
  } finally {
    await client.end?.();
  }
}

if (isMainModule(import.meta.url)) {
  process.exit(await cliMain({}));
}
