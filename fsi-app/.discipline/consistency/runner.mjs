#!/usr/bin/env node
// Consistency check runner. Layer 4 reality-scanner.
//
// Usage:
//   node fsi-app/.discipline/consistency/runner.mjs        (run all checks)
//   node fsi-app/.discipline/consistency/runner.mjs --check=C1
//   node fsi-app/.discipline/consistency/runner.mjs --list
//
// Exit codes:
//   0 = no drift across any check
//   1 = at least one drift record
//   2 = engine error

import { consistencyChecks } from './manifest.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg === '--list') out.list = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg === '--quiet') out.quiet = true;
    else if (arg.startsWith('--check=')) out.check = arg.slice(8);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.list) {
    listChecks();
    return 0;
  }

  const checks = args.check
    ? consistencyChecks.filter((c) => c.id === args.check)
    : consistencyChecks;

  if (checks.length === 0) {
    console.error(`Error: no consistency check matching id "${args.check}". Try --list.`);
    return 2;
  }

  let totalDrift = 0;
  const driftSummary = [];

  for (const check of checks) {
    if (!args.quiet) console.log(`Running [${check.id}] ${check.name}`);
    let drifts;
    try {
      drifts = check.run();
    } catch (err) {
      console.error(`  ERROR  [${check.id}] run() threw: ${err.message}`);
      return 2;
    }
    for (const d of drifts) driftSummary.push({ check, drift: d });
    totalDrift += drifts.length;
    if (!args.quiet) {
      if (drifts.length === 0) console.log(`  PASS  [${check.id}]`);
      else console.log(`  DRIFT [${check.id}]: ${drifts.length} record(s)`);
    }
  }

  if (driftSummary.length > 0) {
    console.error('\n=== Consistency drift ===\n');
    for (const item of driftSummary) {
      console.error(`  [${item.check.id}] ${item.drift.kind}`);
      console.error(`        ${item.drift.detail}`);
      if (item.drift.location) console.error(`        Location: ${item.drift.location}`);
      console.error(`        Source: ${item.check.source}`);
      console.error('');
    }
  }

  if (!args.quiet) {
    console.log(`\nConsistency summary: ${checks.length} check(s), ${totalDrift} drift record(s).`);
  }

  return totalDrift > 0 ? 1 : 0;
}

function listChecks() {
  console.log(`Registered consistency checks (${consistencyChecks.length}):\n`);
  for (const c of consistencyChecks) {
    console.log(`  [${c.id}] ${c.name}`);
    console.log(`         ${c.description}`);
    console.log(`         Source: ${c.source}\n`);
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('Consistency runner error:', err);
  process.exit(2);
});
