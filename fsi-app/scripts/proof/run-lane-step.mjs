#!/usr/bin/env node
// run-lane-step.mjs -- run one chain-proof step script, or record a named skip when it does not exist yet
// (lane PROOF-1, 2026-10-07).
//
// The chain-proof workflow is built in pieces by separate lanes (subset export and load, chain steps, attack
// suite). Each piece is a script under scripts/proof/. This wrapper is how the workflow calls them: if the
// script is present it runs with the arguments given and its exit code is passed through; if it is absent
// the step is recorded as skipped with the lane that owns it, never as a pass that looks like a run. Either
// way one record lands in the proof's output directory (step-<name>.json: step, lane, status, reason, exit
// code, seconds), which emit-chain-proof-artifact.mjs reads. The record holds no argument values.
//
// Usage: node scripts/proof/run-lane-step.mjs --name <step> --lane <LANE> --script <path> --out-dir <dir> [-- args...]
// Exit: the script's own exit code; 0 for a skipped step; 2 for a usage error.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";

/** Build the step record. PURE. */
export function buildStepRecord({ name, lane, status, reason = null, exitCode = null, seconds = 0 }) {
  return { step: name, lane, status, reason, exit_code: exitCode, seconds };
}

/** Run or skip one step. `exists`, `spawn` and `write` are injectable. Returns { record, exitCode }. */
export function runLaneStep({ name, lane, script, outDir, args = [], exists = existsSync, spawn = spawnSync, write = writeFileSync, mkdir = mkdirSync, now = Date.now }) {
  mkdir(outDir, { recursive: true });
  const recordPath = join(outDir, `step-${name}.json`);
  if (!exists(script)) {
    const record = buildStepRecord({ name, lane, status: "skipped", reason: `${script} is absent: lane ${lane} has not landed` });
    write(recordPath, JSON.stringify(record, null, 2) + "\n", "utf8");
    return { record, exitCode: 0 };
  }
  const started = now();
  const r = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
  const seconds = Math.round((now() - started) / 100) / 10;
  const exitCode = r.error ? 1 : (r.status ?? 1);
  const record = buildStepRecord({
    name, lane,
    status: exitCode === 0 ? "ran" : "failed",
    reason: exitCode === 0 ? null : (r.error ? `could not start: ${r.error.message}` : `exited ${exitCode}`),
    exitCode, seconds,
  });
  write(recordPath, JSON.stringify(record, null, 2) + "\n", "utf8");
  return { record, exitCode };
}

function parseArgs(argv) {
  const sep = argv.indexOf("--");
  const own = sep === -1 ? argv : argv.slice(0, sep);
  const rest = sep === -1 ? [] : argv.slice(sep + 1);
  const out = { args: rest };
  for (let i = 0; i < own.length; i += 2) {
    const k = own[i];
    if (!["--name", "--lane", "--script", "--out-dir"].includes(k) || own[i + 1] == null) throw new Error(`bad argument ${k}`);
    out[k.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = own[i + 1];
  }
  for (const req of ["name", "lane", "script", "outDir"]) if (!out[req]) throw new Error(`--${req} is required`);
  return out;
}

if (isMainModule(import.meta.url)) {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`run-lane-step: ${e.message}`); process.exit(2); }
  const { record, exitCode } = runLaneStep({ name: a.name, lane: a.lane, script: resolve(a.script), outDir: resolve(a.outDir), args: a.args });
  console.log(`run-lane-step: ${record.step} ${record.status}${record.reason ? ` (${record.reason})` : ""}`);
  process.exit(exitCode);
}
