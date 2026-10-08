// The gates' ONE firing log (ADR-046 doctrine point 6). Lane GATE-1 introduced it for the commit rules
// engine (governance/.hook-firings.log, gitignored, one JSON line per firing); lane GATE-2 added the
// pre-push steps (a shell printf to the same file). Lane GATE-7 (2026-10-08) routes every other refusal
// through this module so a later evaluation is one query over one file: the PreToolUse skill gate, the
// worktree-isolation hooks, vault-sync, the intent-form notes ("script-file").
//
// Line shape: {ts, rule, mode, path, line, verdict[, baseline]}. `rule` is the rule id for the commit rules,
// "pre-push:<step>" for a push step, "pretooluse:<tag>" for the skill gate, "worktree-isolation:<hook>" for
// a hook, "vault-sync:<reason>". `line` is a line number for a rule and a short evidence string elsewhere
// (200 characters at most; never a command or a secret).
//
// DISCIPLINE_FIRING_LOG=<path> redirects the log and DISCIPLINE_FIRING_LOG=off disables it. A write failure is
// swallowed: a log that cannot be written must never change a verdict.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const FIRING_LOG_DEFAULT = join(import.meta.dirname, '..', 'governance', '.hook-firings.log');

/** The path lines go to, or null when logging is off. */
export function firingLogPath(env = process.env) {
  const target = env.DISCIPLINE_FIRING_LOG;
  if (target === 'off') return null;
  return target || FIRING_LOG_DEFAULT;
}

const evidence = (v) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);

/** Append firings. Each entry: { rule, mode, path?, line?, verdict, baseline? }. Never throws. */
export function appendFirings(entries, { env = process.env, path = firingLogPath(env) } = {}) {
  try {
    if (!path || !entries || entries.length === 0) return false;
    const ts = new Date().toISOString();
    const lines = entries.map((e) => JSON.stringify({
      ts,
      rule: e.rule,
      mode: e.mode,
      path: e.path ?? null,
      line: typeof e.line === 'number' ? e.line : (e.line == null ? null : evidence(e.line)),
      verdict: e.verdict,
      ...(e.baseline ? { baseline: e.baseline } : {}),
    }));
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${lines.join('\n')}\n`);
    return true;
  } catch {
    return false;
  }
}
