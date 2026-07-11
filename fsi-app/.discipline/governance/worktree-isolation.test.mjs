// RED-THEN-GREEN proof for the worktree-isolation guard (RD-19).
// GOVERNING skill: remediation-discipline (Section 4 category 14 — Worktree isolation).
//
// Hermetic: exercises the PURE verdict functions with injected WHERE (git-dir/common-dir) + WHO (env)
// signals — no real git repo, no dependence on the live main checkout. RED = a simulated agent-context
// branch op / commit in the MAIN checkout MUST block; GREEN = the same op inside a worktree (and the
// orchestrator in the main checkout) MUST pass. Plus a wiring assertion: the installed hook scripts and
// the skill-gate belt actually reference the single-home module, so the gate cannot be silently unwired.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOCTRINE,
  isMainCheckout,
  isAgentContext,
  branchLooksAgentOwned,
  isBranchingGitCommand,
  evaluateCheckout,
  evaluateCommit,
} from './worktree-isolation.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // dotfiles repo root

// Canonical fixtures (shape of real `git rev-parse` output). Synthetic root — no hardcoded user-home
// path (rule 012); the '/worktrees/' segment is the load-bearing signal, not the absolute prefix.
const MAIN = {
  gitDir: '/sandbox/repo/.git',
  gitCommonDir: '/sandbox/repo/.git',
};
const WORKTREE = {
  gitDir: '/sandbox/repo/.git/worktrees/agent-abc96544c15e46cb5',
  gitCommonDir: '/sandbox/repo/.git',
};
const AGENT_ENV = { CLAUDE_CODE_CHILD_SESSION: '1', AI_AGENT: 'claude-code_2-1-204_agent' };
const ORCH_ENV = { AI_AGENT: 'claude-code_2-1-204_agent' }; // orchestrator: no CHILD_SESSION marker

test('DOCTRINE is the exact verbatim operator text', () => {
  assert.equal(
    DOCTRINE,
    "Agent branch/checkout/merge operations occur ONLY in that agent's assigned worktree. The main " +
      "checkout is the orchestrator's exclusive surface. An agent that finds itself in the main checkout " +
      'stops and reports, it does not operate there.',
  );
});

test('isMainCheckout: main equal-dirs true; linked worktree false; unknown false', () => {
  assert.equal(isMainCheckout(MAIN), true);
  assert.equal(isMainCheckout(WORKTREE), false);
  assert.equal(isMainCheckout({}), false);
  // path/case/slash tolerance
  assert.equal(isMainCheckout({ gitDir: '\\sandbox\\repo\\.git\\', gitCommonDir: '/sandbox/repo/.git' }), true);
});

test('isAgentContext: only a truthy CLAUDE_CODE_CHILD_SESSION counts', () => {
  assert.equal(isAgentContext({ CLAUDE_CODE_CHILD_SESSION: '1' }), true);
  assert.equal(isAgentContext({ CLAUDE_CODE_CHILD_SESSION: 'true' }), true);
  assert.equal(isAgentContext({ CLAUDE_CODE_CHILD_SESSION: '0' }), false);
  assert.equal(isAgentContext({ CLAUDE_CODE_CHILD_SESSION: '' }), false);
  assert.equal(isAgentContext({}), false);
  // AI_AGENT is present in BOTH orchestrator and agent → must NOT be treated as the WHO signal.
  assert.equal(isAgentContext(ORCH_ENV), false);
});

test('branchLooksAgentOwned: worktree/agent branches match; legit branches do not', () => {
  assert.equal(branchLooksAgentOwned('worktree-agent-abc96544c15e46cb5'), true);
  assert.equal(branchLooksAgentOwned('agent-abc96544c15e46cb5'), true);
  assert.equal(branchLooksAgentOwned('guard/worktree-isolation-2026-07-11'), false);
  assert.equal(branchLooksAgentOwned('feat/foo'), false);
  assert.equal(branchLooksAgentOwned('master'), false);
  assert.equal(branchLooksAgentOwned(''), false);
});

test('isBranchingGitCommand: branch/checkout/merge/rebase/worktree match; safe ops do not', () => {
  for (const c of [
    'git checkout -b feature',
    'git switch -c feature',
    'git branch newbranch',
    'git merge origin/master',
    'git rebase master',
    'git worktree add ../w branchx',
    'git -C /some/path checkout -b x',
  ]) {
    assert.equal(isBranchingGitCommand(c), true, `should match: ${c}`);
  }
  for (const c of [
    'git status',
    'git log --oneline -1',
    'git commit -m "merge the two sections and rebase notes"', // message mentions merge/rebase
    'git add -A',
    'git diff',
    'git fetch origin',
  ]) {
    assert.equal(isBranchingGitCommand(c), false, `should NOT match: ${c}`);
  }
});

// ── RED: the incident — agent context in the MAIN checkout ──
test('RED evaluateCheckout: agent branch checkout in MAIN checkout is BLOCKED with the doctrine', () => {
  const v = evaluateCheckout({ ...MAIN, env: AGENT_ENV });
  assert.equal(v.blocked, true);
  assert.match(v.reason, /RD-19/);
  assert.equal(v.doctrine, DOCTRINE);
});

test('RED evaluateCommit: agent commit in MAIN checkout is BLOCKED', () => {
  const v = evaluateCommit({ ...MAIN, env: AGENT_ENV, branch: 'guard/x' });
  assert.equal(v.blocked, true);
  assert.equal(v.agent, true);
});

test('RED evaluateCommit: MAIN checkout sitting on an agent-owned branch is BLOCKED even without the env marker', () => {
  const v = evaluateCommit({ ...MAIN, env: ORCH_ENV, branch: 'worktree-agent-abc96544c15e46cb5' });
  assert.equal(v.blocked, true);
  assert.equal(v.agentBranch, true);
});

// ── GREEN: the correct-place cases MUST pass ──
test('GREEN evaluateCheckout: agent branch checkout INSIDE its worktree passes', () => {
  assert.equal(evaluateCheckout({ ...WORKTREE, env: AGENT_ENV }).blocked, false);
});

test('GREEN evaluateCheckout: orchestrator in the MAIN checkout passes (main is its exclusive surface)', () => {
  assert.equal(evaluateCheckout({ ...MAIN, env: ORCH_ENV }).blocked, false);
});

test('GREEN evaluateCommit: agent commit inside its worktree passes', () => {
  assert.equal(evaluateCommit({ ...WORKTREE, env: AGENT_ENV, branch: 'guard/x' }).blocked, false);
});

test('GREEN evaluateCommit: orchestrator commit on a normal branch in the MAIN checkout passes', () => {
  assert.equal(evaluateCommit({ ...MAIN, env: ORCH_ENV, branch: 'master' }).blocked, false);
});

// ── WIRING: the mechanisms actually consume the single-home module (cannot be silently unwired) ──
test('WIRING: post-checkout + pre-commit hook scripts invoke the runner; runner + skill-gate import the module', () => {
  const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

  const postCheckout = read('fsi-app/.discipline/hooks/post-checkout');
  assert.match(postCheckout, /worktree-isolation-hook\.mjs/);
  assert.match(postCheckout, /--mode=post-checkout/);

  const preCommit = read('fsi-app/.discipline/hooks/pre-commit');
  assert.match(preCommit, /worktree-isolation-hook\.mjs/);
  assert.match(preCommit, /--mode=pre-commit/);

  const runner = read('fsi-app/.discipline/governance/worktree-isolation-hook.mjs');
  assert.match(runner, /worktree-isolation\.mjs/);
  assert.match(runner, /evaluateCheckout/);
  assert.match(runner, /evaluateCommit/);

  const gate = read('fsi-app/.discipline/governance/pretooluse-skill-gate.mjs');
  assert.match(gate, /isBranchingGitCommand/);
});
