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
//
// Exit codes:
//   0 = all functions pass (no violations)
//   1 = at least one violation found
//   2 = engine error

import { fitnessFunctions } from './manifest.mjs';
import { readFile, _clearCache } from './lib/file-content.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (arg === '--list') out.list = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg === '--quiet') out.quiet = true;
    else if (arg.startsWith('--function=')) out.function = arg.slice(11);
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

main().then((code) => process.exit(code)).catch((err) => {
  console.error('Fitness runner error:', err);
  process.exit(2);
});
