#!/usr/bin/env node
// Fitness function runner.
// Enumerates files per function spec, reads contents, runs check, aggregates results.
//
// Modes:
//   (default)               run all registered functions against the codebase
//   --function=F1           run only function F1
//   --list                  print all registered functions
//   --verbose               verbose output (per-file PASS lines)
//   --quiet                 suppress PASS output; only show failures
//   --firings-out=<path>    where to write fitness-firings.json (default fsi-app/.discipline/out/)
//
// Exit codes:
//   0 = all functions pass (no violations)
//   1 = at least one violation found
//   2 = engine error

import { fitnessFunctions } from './manifest.mjs';
import { readFile, _clearCache } from './lib/file-content.mjs';
import { isMainModule } from '../../scripts/lib/is-main.mjs';
import { getRepoRoot } from '../lib/context.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Lane GATE-3 (2026-10-08): the firing artifact. Every violation the run found, one record each, so the
// discipline workflow can upload what fired (and a later audit can count firings from evidence instead of
// re-reading CI logs, which is how gate evaluation B had to do it).
export const FIRINGS_ARTIFACT = 'fitness-firings.json';
export const EVIDENCE_MAX = 200;

/** Pure: failureSummary entries ({ fn, file, line, message }) to [{ gate, verdict, file, line, evidence }]. */
export function buildFiringRecords(failureSummary) {
  return failureSummary.map((v) => ({
    gate: v.fn.id,
    verdict: 'fail',
    file: v.file,
    line: v.line ?? null,
    evidence: String(v.message ?? '').replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_MAX),
  }));
}

/** Writes the records as JSON to `path` (parent directories created). Returns the absolute path written. */
export function writeFiringsArtifact(path, records) {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(records, null, 2) + '\n', 'utf8');
  return abs;
}

function defaultFiringsPath() {
  return resolve(getRepoRoot(), 'fsi-app', '.discipline', 'out', FIRINGS_ARTIFACT);
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg === '--list') out.list = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg === '--quiet') out.quiet = true;
    else if (arg.startsWith('--function=')) out.function = arg.slice(11);
    else if (arg.startsWith('--firings-out=')) out.firingsOut = arg.slice(14);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.list) {
    listFunctions();
    return 0;
  }

  _clearCache();

  const functions = args.function
    ? fitnessFunctions.filter((f) => f.id === args.function)
    : fitnessFunctions;

  if (functions.length === 0) {
    console.error(`Error: no function matching id "${args.function}". Try --list.`);
    return 2;
  }

  let totalViolations = 0;
  const failureSummary = [];

  for (const fn of functions) {
    let files;
    try {
      files = fn.enumerate();
    } catch (err) {
      console.error(`  ERROR  [${fn.id}] ${fn.name}: enumerate() threw: ${err.message}`);
      return 2;
    }

    if (!args.quiet) {
      console.log(`Checking [${fn.id}] ${fn.name} (${files.length} files)`);
    }

    let fnViolations = 0;
    for (const file of files) {
      const content = readFile(file);
      if (content === null) continue; // file vanished between enumerate and read
      let fileViolations;
      try {
        fileViolations = fn.check(file, content);
      } catch (err) {
        console.error(`  ERROR  [${fn.id}] check() threw on ${file}: ${err.message}`);
        return 2;
      }
      for (const v of fileViolations) {
        failureSummary.push({ fn, file, line: v.line, message: v.message });
        fnViolations++;
        totalViolations++;
      }
    }

    if (!args.quiet) {
      if (fnViolations === 0) console.log(`  PASS  [${fn.id}] ${fn.name}`);
      else console.log(`  FAIL  [${fn.id}] ${fn.name}: ${fnViolations} violation(s)`);
    }
  }

  // The artifact is written on every run, an empty array included: "nothing fired" is a fact too. A write
  // failure is reported but never changes the verdict (the artifact is evidence, not the gate).
  try {
    writeFiringsArtifact(args.firingsOut ?? defaultFiringsPath(), buildFiringRecords(failureSummary));
  } catch (err) {
    console.error(`  WARN  could not write ${FIRINGS_ARTIFACT}: ${err.message}`);
  }

  if (failureSummary.length > 0) {
    console.error('\n=== Fitness violations ===\n');
    for (const v of failureSummary) {
      console.error(`  [${v.fn.id}] ${v.file}:${v.line}`);
      console.error(`        ${v.message}`);
      console.error(`        Source: ${v.fn.source}`);
      console.error('');
    }
  }

  if (!args.quiet) {
    const summary = `Fitness summary: ${functions.length} function(s) checked, ${totalViolations} violation(s)`;
    console.log(`\n${summary}.`);
  }

  return totalViolations > 0 ? 1 : 0;
}

function listFunctions() {
  console.log(`Registered fitness functions (${fitnessFunctions.length}):\n`);
  for (const fn of fitnessFunctions) {
    console.log(`  [${fn.id}] ${fn.name}`);
    console.log(`         ${fn.description}`);
    console.log(`         Source: ${fn.source}\n`);
  }
}

// Guarded (F67, lane R20, 2026-10-01): importing this module must never run the fitness suite.
if (isMainModule(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('Fitness runner error:', err);
    process.exit(2);
  });
}
