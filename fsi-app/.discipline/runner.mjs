#!/usr/bin/env node
// Discipline engine runner.
// Modes:
//   --mode=commit-msg --message-file=<path>
//     Validate the proposed commit message + currently staged files.
//   --mode=ci --commit=<sha>
//     Validate an existing commit.
//   --mode=ci --range=<range>
//     Validate every commit in a range (e.g., origin/master..HEAD).
//   --mode=fixture --message-file=<path> --files-file=<path>
//     Validate from in-memory fixture (testing).
//   --list
//     Print all registered rules.
//
// Exit codes:
//   0 = all applicable rules PASS or SKIP
//   1 = at least one rule FAIL
//   2 = engine error

import { execFileSync } from 'node:child_process';
import { rules } from './manifest.mjs';
import {
  buildContextForProposedCommit,
  buildContextForExistingCommit,
  buildContextFromFixture,
} from './lib/context.mjs';
import { STATUS } from './lib/result.mjs';

const REPO_ROOT = 'C:/Users/jason/dotfiles';

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
    return runOnContext(ctx, args);
  }

  if (args.mode === 'ci') {
    if (args.commit) {
      const ctx = buildContextForExistingCommit({ commit: args.commit });
      return runOnContext(ctx, args);
    }
    if (args.range) {
      const shas = execFileSync('git', ['-C', REPO_ROOT, 'log', '--format=%H', args.range], { encoding: 'utf-8' })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .reverse();
      let worstExit = 0;
      for (const sha of shas) {
        const ctx = buildContextForExistingCommit({ commit: sha });
        console.log(`\n=== Commit ${sha.slice(0, 8)}: ${ctx.commitSubject} ===`);
        const code = runOnContext(ctx, args);
        if (code > worstExit) worstExit = code;
      }
      return worstExit;
    }
    console.error('Error: --mode=ci requires --commit=<sha> or --range=<range>');
    return 2;
  }

  if (args.mode === 'fixture') {
    if (!args.messageFile || !args.filesFile) {
      console.error('Error: --mode=fixture requires --message-file= and --files-file=');
      return 2;
    }
    const { readFileSync } = await import('node:fs');
    const message = readFileSync(args.messageFile, 'utf-8');
    const files = JSON.parse(readFileSync(args.filesFile, 'utf-8'));
    const ctx = buildContextFromFixture({ message, files });
    return runOnContext(ctx, args);
  }

  console.error(`Error: unknown mode "${args.mode}"`);
  return 2;
}

function runOnContext(ctx, args) {
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

  printResults(results, args);

  const failed = results.filter((r) => r.status === STATUS.FAIL);
  return failed.length > 0 ? 1 : 0;
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

main().then((code) => process.exit(code)).catch((err) => {
  console.error('Engine error:', err);
  process.exit(2);
});
