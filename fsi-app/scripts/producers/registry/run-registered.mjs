#!/usr/bin/env node
// run-registered.mjs -- producers.yml's "registry producers" step (lane S8-E0, 2026-10-07). Iterates the
// producer registry (load-registry.mjs, one JSON per producer in this folder) and runs each selected
// producer exactly as the four hand-written steps it replaced did: an optional fetch stage, then the
// producer script, dry by default, --apply only when the workflow's mode is apply, the entry's kill-switch
// env var set to "1" for the child.
//
// Usage (cwd is fsi-app, as in producers.yml):
//   node scripts/producers/registry/run-registered.mjs --mode dry|apply --producer all|registry \
//        [--only <name>] [--since YYYY-MM-DD] [--list]
//   --list prints the selected runs as JSON and runs nothing (the fixture dry-run).
//
// Failure semantics match the steps it replaced: the first child exiting non-zero stops the run and this
// process exits with that code (a later producer does not run after an earlier failure). Producer scripts
// inherit the environment, so PRODUCER_SUMMARY_DIR reaches writeProducerSummary unchanged and the
// producers-family artifact step downstream sees the same summaries.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProducerRegistry, selectRuns, buildCommands } from "./load-registry.mjs";
import { isMainModule } from "../../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..", "..");

/** Parse the flags above. Throws on an unknown flag so a typo is loud. */
export function parseArgs(argv) {
  const out = { mode: "dry", producer: "all", only: "", since: "", list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") out.list = true;
    else if (["--mode", "--producer", "--only", "--since"].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`run-registered: ${a} needs a value`);
      out[a.slice(2)] = argv[++i];
    } else throw new Error(`run-registered: unknown argument ${a}`);
  }
  return out;
}

/**
 * @param {string[]} argv
 * @param {{env?: object, log?: (s: string) => void, spawn?: Function, load?: Function}} [deps]
 * @returns {number} process exit code
 */
export function runRegistered(argv, deps = {}) {
  const { env = process.env, log = (s) => console.log(s), spawn = spawnSync, load = loadProducerRegistry } = deps;
  let opts;
  let runs;
  try {
    opts = parseArgs(argv);
    runs = selectRuns(load(), opts);
    for (const entry of runs) buildCommands(entry, opts); // validates mode before anything runs
  } catch (e) {
    log(`::error::${e.message}`);
    return 2;
  }
  if (opts.list) {
    log(JSON.stringify(runs.map((e) => ({ name: e.name, domain_table: e.domain_table, commands: buildCommands(e, opts).map((c) => ["node", ...c.args]) })), null, 2));
    return 0;
  }
  log(`registry producers: mode=${opts.mode} producer=${opts.producer}${opts.only ? ` only=${opts.only}` : ""} selected=${runs.map((e) => e.name).join(",") || "(none)"}`);
  for (const entry of runs) {
    log(`registry producers: running ${entry.name} -> ${entry.domain_table}`);
    for (const cmd of buildCommands(entry, opts)) {
      const res = spawn("node", cmd.args, { cwd: FSI_ROOT, env: { ...env, ...cmd.env }, stdio: "inherit" });
      const code = res.status ?? 1;
      if (code !== 0) {
        log(`::error::registry producer ${entry.name} failed: node ${cmd.args.join(" ")} exited ${code}`);
        return code;
      }
    }
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(runRegistered(process.argv.slice(2)));
}
