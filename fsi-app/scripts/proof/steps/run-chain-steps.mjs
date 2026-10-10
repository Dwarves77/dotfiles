#!/usr/bin/env node
// scripts/proof/steps/run-chain-steps.mjs -- PROOF-3 (lane proof3-chain-steps, 2026-10-07): run the chain's
// scripts in hop order, in apply mode, against the chain proof's LOCAL stack, and read the effect back after
// every step. ADR-045: the dry fires of 2026-10-06/07 proved the trigger layer (13 of 13 hops fire); this proves the
// data layer: the same scripts each workflow runs, the same flags, apply mode, a real schema, a production subset.
//
// WHAT RUNS. chain-steps.json lists the steps. A script step is a bash script (the workflow's own run lines, with the
// workflow_run event replaced by the environment the event would have provided: the step's own GITHUB_RUN_ID, the
// upstream step's run id as GITHUB_EVENT_WORKFLOW_RUN_ID, GITHUB_EVENT_NAME). The runner:
//   0. before any step: verifySchemaNames (assertions.mjs) looks every table an assertion reads up in the live
//      stack's information_schema and plans every statement with EXPLAIN, so a wrong name stops the run up front;
//   1. captures the database clock, runs the step's var queries, its prepare hook (verdict fixture, brief batch),
//      its setup statements and its snapshots, and takes the baseline counts its growth assertions need;
//   2. runs the script under bash with the local-stack environment (production names are refused at start);
//   3. lands every harness-run artifact the script wrote into the LOCAL harness_runs (scripts/lib/record-harness-run.mjs,
//      the writer deliver-artifact-branch.sh calls; one call per NEW artifact file, so an earlier step's file is
//      never landed twice);
//   4. evaluates the step's assertions plus the three the runner adds itself (assertions.mjs): the family's row
//      carries the step's run id, a chained step's row carries its upstream's run id, a loop step's row carries the
//      sweep's loop run id.
// The first failing assertion (or a script that exits nonzero, or an artifact that will not land) stops the run with
// the step name, the table, the predicate and the observed value. The last step re-reads the whole ledger and checks
// that every step landed, in order, linked to its upstream (checkHopOrder).
//
// OUTPUT. <CP_OUT_DIR>/chain-steps-report.json after every step: per step the command (the manifest's script text),
// seconds, status, the artifacts landed, and each assertion with its table, predicate, expectation and observed integer.
// Counts only: the repository is public, so a row, a title or an item id is never written to the report. The step
// scripts' own output streams to the job log (see the module note in the PROOF-3 session log on titles in logs).
//
// SAFETY. The runner refuses to start unless scripts/proof/preflight.mjs accepts the environment (loopback hosts only,
// no production credential name, CHAIN_PROOF_LOCAL=1; the workflow runs the same check before this step, this is the
// second lock), and connects through scripts/lib/pg-conn.mjs, whose loopback mode (CHAIN_PROOF_LOCAL=1) holds only
// loopback candidates and never falls through to a production host. Child processes get the environment without any
// forbidden credential name.
//
// Exit: 0 every step and assertion passed; 1 a step or assertion failed (report written); 2 usage or environment.
// Usage: node scripts/proof/steps/run-chain-steps.mjs [--manifest <path>] [--out-dir <dir>] [--plan]

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../lib/is-main.mjs";
import { connectPg } from "../../lib/pg-conn.mjs";
import { checkPreflight, FORBIDDEN_NAMES, FORBIDDEN_PREFIXES } from "../preflight.mjs";
import { loadManifest, loadHops, validateManifest, substitute, DEFAULT_MANIFEST } from "./manifest.mjs";
import { evaluateAssertions, takeBaselines, takeSnapshots, autoAssertions, describeFailure, verifySchemaNames } from "./assertions.mjs";
import { HOOKS } from "./prepare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..", "..");
const REPORT_NAME = "chain-steps-report.json";

/** The environment check: the chain-proof preflight (one source of truth for the forbidden names, the loopback hosts
 *  and CHAIN_PROOF_LOCAL) plus the one rule this runner adds, the research walker kill switch stays off. PURE.
 *  Returns violation strings naming variables, never values. */
export function checkEnvironment(env) {
  const v = [...checkPreflight(env).violations];
  if (env.RESEARCH_WALKER_ENABLED === "1") v.push("RESEARCH_WALKER_ENABLED is 1; the proof keeps the walker's kill switch off");
  return v;
}

/** The environment a step's child process starts from: the runner's own, minus every forbidden credential name. PURE. */
export function scrubbedEnv(env) {
  const out = { ...env };
  for (const n of Object.keys(out)) {
    if (FORBIDDEN_NAMES.includes(n) || FORBIDDEN_PREFIXES.some((p) => n.startsWith(p))) Reflect.deleteProperty(out, n);
  }
  Reflect.deleteProperty(out, "GITHUB_EVENT_WORKFLOW_RUN_ID");
  return out;
}

/** The run id a script step carries as GITHUB_RUN_ID. The first script step IS the loop root (a sweep's loop id is
 *  its own run id); every later one appends its two digit ordinal. PURE. */
export function stepRunIds(manifest, loopRunId) {
  const ids = {};
  let n = 0;
  for (const s of manifest.steps) {
    if (s.kind !== "script") continue;
    ids[s.id] = n === 0 ? String(loopRunId) : `${loopRunId}${String(n).padStart(2, "0")}`;
    n += 1;
  }
  return ids;
}

/** The sweep window: the seven UTC days ending today. PURE. */
export function sweepWindow(now) {
  const day = (d) => d.toISOString().slice(0, 10);
  return { from: day(new Date(now.getTime() - 6 * 86400000)), to: day(now) };
}

/** Artifact files (fsi-app-relative) that appeared between two listings. PURE. */
export function newArtifacts(before, after) {
  const seen = new Set(before);
  return after.filter((f) => !seen.has(f)).sort();
}

/**
 * The closing check. PURE. `rows` are the harness_runs rows of the proof's run ids ({harness_family, github_run_id,
 * upstream_run_id, started_at, loop_run_id}); `steps` are the script steps with their run ids.
 * @returns {{ok: boolean, problems: string[], hops: {step: string, hop: string|null, ok: boolean}[]}}
 */
export function checkHopOrder({ rows, steps, loopRunId }) {
  const problems = [];
  const hops = [];
  let prevStart = null;
  let prevId = null;
  for (const s of steps) {
    const row = rows.find((r) => r.harness_family === s.family && String(r.github_run_id) === s.runId);
    const where = `step "${s.id}"`;
    let ok = true;
    if (!row) { problems.push(`${where}: no harness_runs row of family ${s.family} carries run id ${s.runId}`); hops.push({ step: s.id, hop: s.hop ?? null, ok: false }); continue; }
    const t = Date.parse(row.started_at);
    if (Number.isNaN(t)) { problems.push(`${where}: its row has no readable started_at`); ok = false; }
    else {
      if (prevStart !== null && t < prevStart) { problems.push(`${where}: its row started before the row of the step before it (${prevId}); the ledger does not show manifest order`); ok = false; }
      prevStart = t; prevId = s.id;
    }
    if (s.upstreamRunId && String(row.upstream_run_id) !== s.upstreamRunId) { problems.push(`${where}: its row's upstream_run_id is not the run id of ${s.upstreamStep}`); ok = false; }
    if (s.loop && String(row.loop_run_id) !== String(loopRunId)) { problems.push(`${where}: its row does not carry the loop run id`); ok = false; }
    hops.push({ step: s.id, hop: s.hop ?? null, ok });
  }
  return { ok: problems.length === 0, problems, hops };
}

/** A printable plan: one line per step. PURE. */
export function planLines(manifest) {
  return manifest.steps.map((s, i) => {
    const hop = s.kind === "script" ? (s.hop ? `hop ${s.hop}` : "root  ") : s.kind.padEnd(6);
    const up = s.upstream ? ` <- ${s.upstream.step}` : "";
    const n = (s.assertions ?? []).length + (s.kind === "script" ? 1 + (s.upstream ? 1 : 0) + (s.loop ? 1 : 0) : 0);
    return `${String(i + 1).padStart(2, "0")} ${hop} ${s.id}${up}  (${n} assertion(s)${s.caveat ? ", caveat" : ""})`;
  });
}

/**
 * Run the manifest. Everything external is injected, so the whole flow is exercised on fixtures.
 * deps: { query, setup, dbClock, runScript, listArtifacts, landArtifact, livePromptVersion, hooks, mkStepTmp,
 *         writeFile, readFile, listDir, writeReport, log, now, fsiRoot }
 * @returns {Promise<{ok: boolean, report: object, error: string|null}>}
 */
export async function runChainSteps({ manifest, loopRunId, deps, window = sweepWindow(deps.now()) }) {
  const { query, runScript, listArtifacts, landArtifact, log } = deps;
  const hooks = deps.hooks ?? HOOKS;
  const runIds = stepRunIds(manifest, loopRunId);
  const prelude = manifest.shell_prelude.join("\n");
  const report = {
    schema: 1,
    loop_run_id: String(loopRunId),
    started_at: deps.now().toISOString(),
    finished_at: null,
    ok: false,
    stopped_at: null,
    error: null,
    caveats: manifest.steps.filter((s) => s.caveat).map((s) => ({ step: s.id, caveat: s.caveat })),
    steps: [],
    not_run: [],
  };
  const vars = { loop_run_id: String(loopRunId) };

  const finish = (error, stoppedAt) => {
    report.finished_at = deps.now().toISOString();
    report.ok = error === null;
    report.error = error;
    report.stopped_at = stoppedAt;
    deps.writeReport(report);
    return { ok: report.ok, report, error };
  };

  // Before any step runs: every table and column the assertions name is checked against the live stack (CHAIN-5).
  const names = await verifySchemaNames({ manifest, query });
  report.schema_names = { ok: names.ok, tables_checked: Object.keys(names.tables).length, statements_planned: names.statements, problems: names.problems };
  if (!names.ok) {
    report.not_run = manifest.steps.map((s) => s.id);
    const msg = `chain steps: the stack's schema does not carry ${names.problems.length} name(s) the manifest uses: ${names.problems.slice(0, 6).join("; ")}`;
    log(`chain-steps: STOPPED at schema-names: ${msg}`);
    return finish(msg, "schema-names");
  }

  for (let i = 0; i < manifest.steps.length; i += 1) {
    const step = manifest.steps[i];
    const rec = { step: step.id, hop: step.hop ?? null, title: step.title, kind: step.kind, family: step.family ?? null, run_id: runIds[step.id] ?? null, command: step.script ? step.script.join("\n") : null, network: step.network ?? null, seconds: 0, status: "running", exit_code: null, landed: [], notes: [], assertions: [] };
    report.steps.push(rec);
    try {
      const t0 = deps.now().getTime();
      const startedAt = await deps.dbClock();
      vars.started_at = startedAt;
      vars[`started_at.${step.id}`] = startedAt;
      if (runIds[step.id]) { vars.run_id = runIds[step.id]; vars[`run_id.${step.id}`] = runIds[step.id]; }
      const upId = step.upstream ? runIds[step.upstream.step] : null;
      if (upId) { vars.upstream_run_id = upId; vars[`upstream_run_id.${step.id}`] = upId; } else { Reflect.deleteProperty(vars, "upstream_run_id"); }

      if (step.kind === "check") {
        const scriptSteps = manifest.steps.filter((s) => s.kind === "script").map((s) => ({ id: s.id, family: s.family, hop: s.hop ?? null, runId: runIds[s.id], upstreamStep: s.upstream?.step ?? null, upstreamRunId: s.upstream ? runIds[s.upstream.step] : null, loop: s.loop }));
        const rows = await query(
          "SELECT harness_family, github_run_id, upstream_run_id, started_at::text AS started_at, config->>'loop_run_id' AS loop_run_id FROM public.harness_runs WHERE github_run_id = ANY($1::text[]) ORDER BY started_at",
          [Object.values(runIds)],
        );
        const check = checkHopOrder({ rows, steps: scriptSteps, loopRunId });
        rec.assertions.push({ id: "hop-order", kind: "check", table: "harness_runs", predicate: `rows of ${scriptSteps.length} run ids`, expect: "every step landed, in order, linked, loop carried", observed: check.problems.length, ok: check.ok, error: check.ok ? null : check.problems.slice(0, 8).join("; "), hops: check.hops });
        rec.seconds = Math.round((deps.now().getTime() - t0) / 100) / 10;
        rec.status = check.ok ? "passed" : "failed";
        if (!check.ok) throw new StepFailure(`chain step "${step.id}" failed assertion "hop-order": harness_runs: ${check.problems.slice(0, 4).join("; ")}`);
        continue;
      }

      let childEnv = {};
      let params = {};
      if (step.kind === "script") {
        const cpVars = {};
        for (const q of step.var_queries ?? []) {
          const rows = await query(substitute(q.sql, vars), []);
          cpVars[q.name] = rows?.[0]?.v === null || rows?.[0]?.v === undefined ? "" : String(rows[0].v);
        }
        const stepTmp = deps.mkStepTmp(step.id);
        if (step.prepare) {
          const hook = hooks[step.prepare];
          if (!hook) throw new Error(`step names an unknown prepare hook ${step.prepare}`);
          const out = await hook({ vars: cpVars, query, fsiRoot: deps.fsiRoot, stepTmp, livePromptVersion: deps.livePromptVersion, now: deps.now, writeFile: deps.writeFile, readFile: deps.readFile, listDir: deps.listDir });
          childEnv = { ...childEnv, ...(out.env ?? {}) };
          params = { ...params, ...(out.params ?? {}) };
          rec.notes.push(...(out.notes ?? []));
        }
        for (const st of step.setup ?? []) await deps.setup(substitute(st.sql, vars), (st.params ?? []).map((p) => params[p]), { replica: st.replica === true });
        childEnv = {
          ...childEnv,
          CP_STEP_ID: step.id,
          CP_STEP_RUN_ID: runIds[step.id],
          CP_STEP_EVENT: step.event,
          CP_LOOP_RUN_ID: String(loopRunId),
          CP_STEP_TMP: stepTmp,
          CP_DATE_FROM: window.from,
          CP_DATE_TO: window.to,
          ...(step.upstream ? { CP_UPSTREAM_RUN_ID: upId, CP_UPSTREAM_NAME: step.upstream.name } : {}),
          ...Object.fromEntries(Object.entries(cpVars).map(([k, v]) => [`CP_VAR_${k}`, v])),
        };
      }

      const snapshotDefs = step.snapshots ?? [];
      const snapshots = await takeSnapshots(snapshotDefs, vars, query, params);
      const explicit = step.assertions ?? [];
      const baselines = await takeBaselines(explicit, vars, query);

      if (step.kind === "script") {
        const before = listArtifacts();
        log(`chain-steps: ${step.id} (${step.hop ? `hop ${step.hop}` : "root"}) run ${runIds[step.id]}`);
        const r = await runScript({ script: `${prelude}\n${step.script.join("\n")}`, env: childEnv, cwd: deps.fsiRoot });
        rec.exit_code = r.status;
        const fresh = newArtifacts(before, listArtifacts());
        for (const f of fresh) {
          const landed = await landArtifact(f);
          rec.landed.push({ artifact: basename(f, ".json"), landed: landed.ok });
          if (!landed.ok) throw new StepFailure(`chain step "${step.id}": the harness-run artifact ${basename(f)} would not land in the local harness_runs (${landed.reason ?? "unknown"})`);
        }
        rec.seconds = Math.round((deps.now().getTime() - t0) / 100) / 10;
        if (r.status !== 0) throw new StepFailure(`chain step "${step.id}": the script exited ${r.status}${r.error ? ` (${r.error})` : ""}`);
      }

      const all = [...(step.kind === "script" ? autoAssertions(step) : []), ...explicit];
      const results = await evaluateAssertions({ assertions: all, vars, query, baselines, snapshots, snapshotDefs, snapshotParams: params });
      rec.assertions = results;
      if (step.kind !== "script") rec.seconds = Math.round((deps.now().getTime() - t0) / 100) / 10;
      const bad = results.find((r) => !r.ok);
      if (bad) { rec.status = "failed"; throw new StepFailure(describeFailure(step.id, bad)); }
      rec.status = "passed";
    } catch (e) {
      rec.status = "failed";
      const failure = e instanceof Error ? e.message : String(e);
      report.not_run = manifest.steps.slice(i + 1).map((s) => s.id);
      log(`chain-steps: STOPPED at ${step.id}: ${failure}`);
      return finish(failure, step.id);
    }
    deps.writeReport({ ...report, finished_at: null });
  }
  return finish(null, null);
}

class StepFailure extends Error {}

function parseArgs(argv) {
  const out = { manifest: DEFAULT_MANIFEST, outDir: null, plan: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--plan") out.plan = true;
    else if (a === "--manifest" || a === "--out-dir") {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      out[a === "--manifest" ? "manifest" : "outDir"] = argv[i + 1];
      i += 1;
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

/** The real dependencies: a loopback pg client, bash, the filesystem. Only the CLI builds this. */
export async function realDeps({ env, fsiRoot, outDir }) {
  const client = await connectPg({ env });
  if (!client) throw new Error("could not connect to the local database (loopback candidates only)");
  const query = async (sql, params = []) => (await client.query(sql, params)).rows;
  const tmpRoot = mkdtempSync(join(tmpdir(), "chain-steps-"));
  const listArtifacts = () => {
    const base = join(fsiRoot, "scripts", "harness-runs");
    const files = [];
    for (const fam of readdirSync(base, { withFileTypes: true })) {
      if (!fam.isDirectory()) continue;
      for (const f of readdirSync(join(base, fam.name))) if (/-run-\d+\.json$/.test(f)) files.push(`scripts/harness-runs/${fam.name}/${f}`);
    }
    return files.sort();
  };
  return {
    client,
    tmpRoot,
    fsiRoot,
    query,
    dbClock: async () => (await query("SELECT clock_timestamp()::text AS t"))[0].t,
    setup: async (sql, params, { replica }) => {
      try {
        await client.query("BEGIN");
        if (replica) await client.query("SET LOCAL session_replication_role = replica");
        await client.query(sql, params);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    },
    runScript: async ({ script, env: childEnv, cwd }) => {
      const r = spawnSync("bash", ["-c", script], { cwd, env: { ...scrubbedEnv(env), ...childEnv }, stdio: "inherit" });
      return { status: r.error ? 1 : (r.status ?? 1), error: r.error ? r.error.message : null };
    },
    listArtifacts,
    landArtifact: async (file) => {
      const r = spawnSync(process.execPath, ["scripts/lib/record-harness-run.mjs", "--file", file], { cwd: fsiRoot, env: scrubbedEnv(env), stdio: "inherit" });
      return r.status === 0 ? { ok: true } : { ok: false, reason: r.error ? r.error.message : `record-harness-run exited ${r.status}` };
    },
    livePromptVersion: async () => (await import("./live-prompt-version.mjs")).livePromptVersion(),
    hooks: HOOKS,
    mkStepTmp: (id) => { const d = join(tmpRoot, id); mkdirSync(d, { recursive: true }); return d; },
    writeFile: (p, text) => writeFileSync(p, text, "utf8"),
    readFile: (p) => readFileSync(p, "utf8"),
    listDir: (p) => readdirSync(p),
    writeReport: (report) => { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, REPORT_NAME), JSON.stringify(report, null, 2) + "\n", "utf8"); },
    log: (m) => console.log(m),
    now: () => new Date(),
    close: async () => { await client.end(); rmSync(tmpRoot, { recursive: true, force: true }); },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  try { args = parseArgs(argv); } catch (e) { console.error(`run-chain-steps: ${e.message}`); return 2; }
  let manifest;
  try { manifest = loadManifest(resolve(args.manifest)); } catch (e) { console.error(`run-chain-steps: cannot read the manifest: ${e.message}`); return 2; }
  const errors = validateManifest(manifest, loadHops());
  if (errors.length) { console.error(`run-chain-steps: the manifest is invalid:\n  ${errors.join("\n  ")}`); return 2; }
  if (args.plan) { console.log(planLines(manifest).join("\n")); return 0; }

  const violations = checkEnvironment(env);
  if (violations.length) { console.error(`run-chain-steps: refusing to run:\n  ${violations.join("\n  ")}`); return 2; }
  const outDir = args.outDir ?? env.CP_OUT_DIR;
  if (!outDir) { console.error("run-chain-steps: --out-dir or CP_OUT_DIR is required"); return 2; }
  const loopRunId = env.CP_LOOP_RUN_ID || env.GITHUB_RUN_ID;
  if (!loopRunId || !/^\d+$/.test(loopRunId)) { console.error("run-chain-steps: CP_LOOP_RUN_ID or GITHUB_RUN_ID must be a numeric run id"); return 2; }

  let deps;
  try { deps = await realDeps({ env, fsiRoot: FSI_ROOT, outDir: resolve(outDir) }); } catch (e) { console.error(`run-chain-steps: ${e.message}`); return 2; }
  try {
    const res = await runChainSteps({ manifest, loopRunId, deps });
    console.log(res.ok ? `run-chain-steps: ${res.report.steps.length} step(s) passed` : `run-chain-steps: FAILED at ${res.report.stopped_at}`);
    return res.ok ? 0 : 1;
  } finally {
    await deps.close();
  }
}

if (isMainModule(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
