#!/usr/bin/env node
// run-explicit-tests.mjs (lane R6-8, 2026-10-01, closes CF-SEC-11's runner half -- see
// fsi-app/.discipline/fitness/functions/F65-no-bracket-path-tests.mjs for the full defect writeup and
// the reproduction).
//
// WHY THIS EXISTS. `node --test <path> <path> ...` on the CLI re-parses every positional file argument
// through node:test's own glob matcher -- even an EXPLICIT, already-resolved path. A path with a
// literal `[`/`]` segment (an app-router `[param]/` directory, most commonly) is interpreted as a
// bracket-expression glob token and matches nothing, silently: "tests 0", no error, no nonzero exit.
// Reproduced directly, this lane, 2026-10-01:
//
//   $ node --test "fsi-app/scripts/__fixture__/[param]/probe.npmtest.mjs"
//   ℹ tests 0
//
// node:test ALSO exposes a PROGRAMMATIC API, `run({ files })`, whose `files` option is consumed as a
// literal array and never re-parsed as a glob pattern -- the same file, passed the same way, runs
// correctly:
//
//   import { run } from 'node:test';
//   run({ files: ["fsi-app/scripts/__fixture__/[param]/probe.npmtest.mjs"] }); // runs, reports 1 test
//
// This script is the one place both `run-test-suite.sh` and `run-npmtest-suites.sh` go through to
// execute an already-discovered file list, so neither can regress back to a CLI `node --test $files`
// invocation independently.
//
// USAGE: pipe a NUL-separated file list on stdin (the same `--print0` convention
// `fsi-app/.discipline/lib/test-discovery.mjs` already uses), with execArgv passed as CLI args AFTER
// `--`:
//   node test-discovery.mjs --print0 | node run-explicit-tests.mjs
//   node test-discovery.mjs --print0 | node run-explicit-tests.mjs -- --import ./no-npm-sandbox.mjs
//
// Isolation stays at node:test's own default ("process": each file runs in its own child process), so
// execArgv (e.g. `--import` for the no-npm sandbox) applies per file exactly as the prior CLI
// invocation applied it per spawned `node --test` process. Exit code is 0 only if every discovered
// file ran with zero failures; a zero-file stdin list is a loud failure (mirrors test-discovery.mjs's
// own "discovered ZERO test files" guard), never a silent no-op success.

import { availableParallelism } from 'node:os';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { isMainModule } from '../../scripts/lib/is-main.mjs';

// CONCURRENCY (lane GATE-4, 2026-10-07). `node --test` on the CLI runs test files in parallel by default;
// the programmatic `run()` this script moved to (PR 875, 2026-10-02) defaults to ONE file at a time unless
// `concurrency` is given. That serialised the discipline unit-test step: measured 77 s on 2026-10-02 at 10:06
// before the change and 201 s at 10:51 after it, 202 s median since (gate-evaluation-B section 7.6). The
// local 40-file sample measured 172 s serial vs 116 s with `concurrency: true`. An explicit count is passed
// instead of `true`, with a floor of 2, so overlap holds on a 2-vCPU runner whatever `true` would resolve
// to there. Each file still runs in its own child process (node:test's default isolation), so the
// per-file `--import` sandbox below is unaffected.
const CONCURRENCY = Math.max(2, availableParallelism());

function readStdinNulList() {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolvePromise(raw.split('\0').filter(Boolean));
    });
    process.stdin.on('error', reject);
  });
}

function parseExecArgv(argv) {
  const dashIdx = argv.indexOf('--');
  return dashIdx === -1 ? [] : argv.slice(dashIdx + 1);
}

async function main() {
  const files = await readStdinNulList();
  if (files.length === 0) {
    console.error('run-explicit-tests: received ZERO file paths on stdin (standing red; a broken ' +
      'discovery pipe upstream, or an empty test suite, is never a silent success).');
    process.exitCode = 1;
    return;
  }

  const execArgv = parseExecArgv(process.argv);
  let failed = false;
  const stream = run({ files, execArgv, concurrency: CONCURRENCY });
  stream.on('test:fail', () => { failed = true; });
  await new Promise((resolvePromise, reject) => {
    stream.compose(spec).pipe(process.stdout);
    stream.once('end', resolvePromise);
    stream.once('error', reject);
  });
  process.exitCode = failed ? 1 : 0;
}

// F67 (unguarded-main-invocation): main() must never run merely from importing this file (e.g. a
// future test that imports a helper from this module). Guarded the same way every CLI entry point in
// this tree is (F44 / RD-68), via scripts/lib/is-main.mjs's isMainModule().
if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(`run-explicit-tests: fatal error: ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}
