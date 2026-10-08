#!/usr/bin/env node
// Discipline engine runner.
// Modes:
//   --mode=commit-msg --message-file=<path>
//     Validate the proposed commit message + currently staged files.
//   --mode=ci --commit=<sha>
//     Validate an existing commit.
//   --mode=ci [--range=<range>]
//     Validate every commit in a range. An explicit --range is honored verbatim (manual diagnosis).
//     Omitted, the range is RESOLVED via change-range.mjs's resolveRange() -- the CI-PR env shape
//     (BASE_REF + PR_HEAD) or the local merge-base against origin/master -- so this caller, the CI
//     workflow step, and the pre-push hook cannot each build their own range and drift apart (lane
//     R23, 2026-10-02; see change-range.mjs's resolveRange() header for the PRs #866/#869 defect this
//     replaces: a hand-built two-dot range against the base ref's TIP flags lines master fixed after
//     the branch's fork point as "added" on the branch).
//   --mode=fixture --message-file=<path> --files-file=<path>
//     Validate from in-memory fixture (testing). The files file is a JSON array of staged files, or an
//     object { files, changes } where `changes` is the diff view (see buildContextFromFixture).
//   --list
//     Print all registered rules.
//
// Firing log (lane GATE-1, 2026-10-08). Every rule whose trigger fires appends one JSON line per firing to
// governance/.hook-firings.log (gitignored): {ts, rule, mode, path, line, verdict, baseline}. A FAIL writes
// one line per location the rule reported; a PASS writes one line with a null path and line. mode is
// commit-msg, ci (one commit), ci-range (the whole-range pass) or fixture. baseline (lane GATE-5) is what
// "introduced" was measured against for that run, from ctx.baseline.label in lib/context.mjs: "merge base
// with origin/master (<sha>)", "range <a..b>", "fixture", or a named "fallback ..." to the previous commit
// when no merge base exists. The same label is printed at the top of each run's output.
// DISCIPLINE_FIRING_LOG=<path> redirects the log, DISCIPLINE_FIRING_LOG=off disables it, and fixture
// mode writes nothing unless the variable names a path. A logging failure never changes a verdict.
//
// Exit codes:
//   0 = all applicable rules PASS or SKIP
//   1 = at least one rule FAIL
//   2 = engine error

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rules } from './manifest.mjs';
import {
  buildContextForProposedCommit,
  buildContextForExistingCommit,
  buildContextForRange,
  buildContextFromFixture,
  getRepoRoot,
} from './lib/context.mjs';
import { resolveRange } from './lib/change-range.mjs';
import { STATUS } from './lib/result.mjs';
import { isMainModule } from '../scripts/lib/is-main.mjs';

function parseArgs(argv) {
  const out = { mode: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--list') out.list = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg === '--quiet') out.quiet = true;
    else if (arg.startsWith('--mode=')) out.mode = arg.slice(7);
    else if (arg.startsWith('--message-file=')) out.messageFile = arg.slice(15);
    else if (arg.startsWith('--files-file=')) out.filesFile = arg.slice(13);
    else if (arg.startsWith('--commit=')) out.commit = arg.slice(9);
    else if (arg.startsWith('--range=')) out.range = arg.slice(8);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.list) {
    listRules();
    return 0;
  }

  if (!args.mode) {
    console.error('Error: --mode= required. See --help.');
    return 2;
  }

  if (args.mode === 'commit-msg') {
    if (!args.messageFile) {
      console.error('Error: --mode=commit-msg requires --message-file=<path>');
      return 2;
    }
    const ctx = buildContextForProposedCommit({ messageFile: args.messageFile });
    return runOnContext(ctx, args, 'commit-msg');
  }

  if (args.mode === 'ci') {
    if (args.commit) {
      const ctx = buildContextForExistingCommit({ commit: args.commit });
      return runOnContext(ctx, args, 'ci');
    }

    // Range resolution -- ONE path, change-range.mjs's resolveRange() (lane R23, 2026-10-02). An
    // explicit --range is passed through verbatim (resolveRange's own 'explicit' precedence); omitted,
    // it resolves the CI-PR env shape (BASE_REF+PR_HEAD -> merge-base(origin/BASE_REF, PR_HEAD)..PR_HEAD)
    // or the local merge-base against origin/master. Before this fix, this branch trusted whatever
    // literal --range string the caller built; the CI workflow and the pre-push hook each built their
    // OWN two-dot range against the base ref's TIP (origin/<base>..<head>), which `git diff` does not
    // merge-base-correct the way `git diff A...B` does -- a fix origin/master picked up AFTER a
    // branch's fork point read as "added" on that branch's whole-range diff below (rule 022,
    // [CONFIRMED] PRs #866 and #869). Resolving here means the CI job and pre-push can both stop
    // building their own range and simply omit --range, so the three callers (this one, the CI job,
    // pre-push) cannot drift from each other or from F51's own range checks, which already resolved
    // through this same function.
    // cwd: the repo root this engine run resolved (getRepoRoot), the same root every context diffs in; omitted,
    // resolveRange anchors on this module's own location, which is only the same repository by coincidence.
    const resolved = resolveRange({ explicit: args.range, env: process.env, cwd: getRepoRoot() });
    if (resolved.source === 'unavailable' || !resolved.range) {
      console.error(
        `Error: --mode=ci could not resolve a range${resolved.reason ? ` (${resolved.reason})` : ''}. ` +
        'Pass --commit=<sha> or --range=<range> explicitly.'
      );
      return 2;
    }
    const range = resolved.range;
    if (resolved.source !== 'explicit') {
      console.log(`Resolved range via change-range.mjs (${resolved.source}): ${range}`);
    }

    const shas = execFileSync('git', ['-C', getRepoRoot(), 'log', '--format=%H', range], { encoding: 'utf-8' })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .reverse();
    let worstExit = 0;
    for (const sha of shas) {
      const ctx = buildContextForExistingCommit({ commit: sha });
      console.log(`\n=== Commit ${sha.slice(0, 8)}: ${ctx.commitSubject} ===`);
      const code = runOnContext(ctx, args, 'ci');
      if (code > worstExit) worstExit = code;
    }

    // ONE cumulative diff over the whole range, in addition to the per-commit walk above.
    // Why both (lane MASTER-022, 2026-09-26): a per-commit union of "added lines" and a single
    // whole-range diff over the identical net change can disagree on CONTENT rules (022 today)
    // when a literal value occurs more than once in the file -- git's diff pairing is a
    // heuristic, not a strict provenance oracle, and a per-commit walk and a single accumulated
    // diff are free to choose different, equally minimal pairings (see buildContextForRange's
    // header in lib/context.mjs for the full mechanism and a reproduced example). The push-to-
    // master check runs exactly ONE diff, the squash commit vs its real parent, so a PR check
    // that skips this pass can go green on a range whose squash will fail on master. Shas is
    // already empty-checked implicitly: an empty range makes `git diff` a no-op (no changed
    // files), so this is safe to run unconditionally, including on a range with zero commits.
    const rangeCtx = buildContextForRange({ range });
    console.log(`\n=== Whole-range diff (${range}), squash-merge parity ===`);
    const rangeCode = runOnContext(rangeCtx, args, 'ci-range');
    if (rangeCode > worstExit) worstExit = rangeCode;

    return worstExit;
  }

  if (args.mode === 'fixture') {
    if (!args.messageFile || !args.filesFile) {
      console.error('Error: --mode=fixture requires --message-file= and --files-file=');
      return 2;
    }
    const { readFileSync } = await import('node:fs');
    const message = readFileSync(args.messageFile, 'utf-8');
    const parsed = JSON.parse(readFileSync(args.filesFile, 'utf-8'));
    const ctx = Array.isArray(parsed)
      ? buildContextFromFixture({ message, files: parsed })
      : buildContextFromFixture({ message, files: parsed.files, changes: parsed.changes });
    return runOnContext(ctx, args, 'fixture');
  }

  console.error(`Error: unknown mode "${args.mode}"`);
  return 2;
}

function runOnContext(ctx, args, mode) {
  const results = [];
  for (const rule of rules) {
    let triggerFired;
    try {
      triggerFired = Boolean(rule.trigger(ctx));
    } catch (err) {
      results.push({ rule, status: STATUS.FAIL, message: `Rule trigger threw: ${err.message}`, remediation: 'Fix rule code; this is an engine-level error.' });
      continue;
    }
    if (!triggerFired) {
      results.push({ rule, status: STATUS.SKIP, reason: 'trigger condition not met' });
      continue;
    }
    let res;
    try {
      res = rule.check(ctx);
    } catch (err) {
      results.push({ rule, status: STATUS.FAIL, message: `Rule check threw: ${err.message}`, remediation: 'Fix rule code; this is an engine-level error.' });
      continue;
    }
    results.push({ rule, ...res });
  }

  if (!args.quiet) console.log(`  Baseline: ${ctx.baseline.label}`);
  printResults(results, args);
  logFirings(results, mode, ctx.baseline.label);

  const failed = results.filter((r) => r.status === STATUS.FAIL);
  return failed.length > 0 ? 1 : 0;
}

const FIRING_LOG_DEFAULT = join(import.meta.dirname, 'governance', '.hook-firings.log');
const MAX_FAIL_LINES_LOGGED = 50;

// One JSON line per firing. Never throws: a log that cannot be written must not change a commit's verdict.
function logFirings(results, mode, baseline) {
  try {
    const target = process.env.DISCIPLINE_FIRING_LOG;
    if (target === 'off') return;
    if (mode === 'fixture' && !target) return;
    const path = target || FIRING_LOG_DEFAULT;
    const ts = new Date().toISOString();
    const lines = [];
    for (const r of results) {
      if (r.status === STATUS.SKIP) continue;
      if (r.status === STATUS.FAIL) {
        const locations = (r.locations && r.locations.length ? r.locations : [{ path: null, line: null }]).slice(0, MAX_FAIL_LINES_LOGGED);
        for (const loc of locations) {
          lines.push(JSON.stringify({ ts, rule: r.rule.id, mode, path: loc.path ?? null, line: loc.line ?? null, verdict: 'FAIL', baseline }));
        }
      } else {
        lines.push(JSON.stringify({ ts, rule: r.rule.id, mode, path: null, line: null, verdict: 'PASS', baseline }));
      }
    }
    if (lines.length === 0) return;
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${lines.join('\n')}\n`);
  } catch {
    // intentionally swallowed, see above
  }
}

function printResults(results, args) {
  const failed = results.filter((r) => r.status === STATUS.FAIL);
  const passed = results.filter((r) => r.status === STATUS.PASS);
  const skipped = results.filter((r) => r.status === STATUS.SKIP);

  if (!args.quiet) {
    for (const r of passed) {
      console.log(`  PASS  [${r.rule.id}] ${r.rule.name}`);
    }
    if (args.verbose) {
      for (const r of skipped) {
        console.log(`  SKIP  [${r.rule.id}] ${r.rule.name}  (${r.reason})`);
      }
    }
  }

  for (const r of failed) {
    console.error(`\n  FAIL  [${r.rule.id}] ${r.rule.name}`);
    console.error(`        ${r.message}`);
    console.error(`        Source: ${r.rule.ruleSource}`);
    console.error(`        Fix:`);
    for (const line of r.remediation.split('\n')) {
      console.error(`          ${line}`);
    }
  }

  if (!args.quiet) {
    console.log(`\nSummary: ${passed.length} pass, ${failed.length} fail, ${skipped.length} skip (of ${results.length} rules).`);
  }
}

function listRules() {
  console.log(`Registered rules (${rules.length}):\n`);
  for (const r of rules) {
    console.log(`  [${r.id}] ${r.name}`);
    console.log(`         ${r.description}`);
    console.log(`         Source: ${r.ruleSource}\n`);
  }
}

// Guarded (F67, lane R20, 2026-10-01): importing this module (no exports exist today, but an unguarded
// main() at module scope is the same defect class regardless) must never run the discipline engine.
if (isMainModule(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('Engine error:', err);
    process.exit(2);
  });
}
