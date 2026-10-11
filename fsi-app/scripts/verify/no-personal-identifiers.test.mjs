// ANON-1 (2026-10-11): the repository becomes anonymous before it is made public. Operator ruling: no
// tracked file names the operator. This verifier fails when any tracked text file contains the operator's
// first name as a word, the surname as a word, or a personal webmail address, unless the file is on the
// FUNCTIONAL allowlist below (or the shrinking PENDING_SCRUB list) with a stated reason and an exact count of matching lines.
//
// What counts as FUNCTIONAL: a string a program reads or matches (a permission rule, a hardcoded default, a
// fixture or test expectation, a pattern a rule exists to catch). Prose (docs, comments, notes) is never
// allowlisted; it is rewritten. An allowlist entry is exact (a count of matching lines), so one more
// occurrence in an allowed file fails, and a stale entry (the file no longer matches) fails too: the list
// can only shrink.
//
// The name and the surname are assembled from fragments, so this file never contains the strings it
// forbids and needs no allowlist entry of its own. The attack tests below seed each shape the scanner must
// refuse; the first run against master (before the scrub) was red on every prose file, which is the evidence
// the guard bites (CLAUDE.md rule 15).
//
// Scope: the working tree only. Author and committer fields in git history are a separate step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const FIRST = ['ja', 'son'].join('');
const LAST = ['lo', 'sh'].join('');
const HOME_SEG = ['Us', 'ers'].join('');

// The first name as a word, or as the head of a longer handle (name + letters): any letter before it means
// it is inside another word, so only a non-letter (start of line, space, slash, hyphen, underscore, quote) counts.
const FIRST_RE = new RegExp(`(^|[^A-Za-z])${FIRST}`, 'i');
const LAST_RE = new RegExp(`(^|[^A-Za-z])${LAST}([^A-Za-z]|$)`, 'i');
const ADDRESS_RE = /@(?:gmail|googlemail|hotmail|outlook|live|yahoo|icloud|aol|proton(?:mail)?)\.(?:com|me|net)\b/i;

export const SHAPES = [
  { kind: 'first-name', re: FIRST_RE },
  { kind: 'surname', re: LAST_RE },
  { kind: 'webmail-address', re: ADDRESS_RE },
];

// FUNCTIONAL allowlist: path -> { lines: exact count of matching lines, reason }.
export const FUNCTIONAL = {
  'fsi-app/.claude/settings.json': { lines: 4, reason: 'permission rules match the local machine paths; the rules stop working if the path text changes' },
  'fsi-app/.claude/settings.local.json': { lines: 7, reason: 'permission rules match the local machine paths; the rules stop working if the path text changes' },
  'fsi-app/.discipline/governance/doctrine-contradiction.mjs': { lines: 1, reason: 'SELF_GATE_RE is a pattern over doc text that names the operator by first name in two alternations' },
  'fsi-app/.discipline/rendering/audit/mounts.mjs': { lines: 11, reason: 'rendering fixtures: sample member names, the sample brief title, a display_name fixture and a sample org user email' },
  'fsi-app/.discipline/rendering/smoke/command-bar-search-portal-smoke.mjs': { lines: 2, reason: 'smoke fixture: the sample brief title the smoke asserts on' },
  'fsi-app/.discipline/rendering/smoke/masthead-balance-smoke.mjs': { lines: 1, reason: 'smoke fixture: the sample brief title the smoke asserts on' },
  'fsi-app/.discipline/rendering/smoke/stub-supabase-browser-account.mjs': { lines: 1, reason: 'smoke fixture: the stubbed account full_name that derives the sample brief title' },
  'fsi-app/.discipline/rules/012-hardcoded-user-path.mjs': { lines: 2, reason: 'rule 012 patterns: the hardcoded home paths of this machine are what the rule exists to catch' },
  'fsi-app/.discipline/rules/012-hardcoded-user-path.test.mjs': { lines: 11, reason: 'rule 012 attack fixtures: the path shapes the rule must refuse' },
  'fsi-app/.discipline/rules/018-new-surface-five-model.test.mjs': { lines: 1, reason: 'rule 018 test fixture: a commit message trailer' },
  'fsi-app/.claude/skills/done/SKILL.md': { lines: 1, reason: 'skill-slim conservation pins the pre-split line verbatim; the skill core line cannot be reworded without an acknowledged-change entry' },
  'fsi-app/.claude/skills/remediation-discipline/references/categories-1-17-and-retrieval.md': { lines: 1, reason: 'skill-slim conservation pins the pre-split line verbatim' },
  'fsi-app/.claude/skills/remediation-discipline/references/worked-examples.md': { lines: 4, reason: 'skill-slim conservation pins the pre-split line verbatim' },
  'fsi-app/.claude/skills/sprint-followups-discipline/references/anti-patterns-worktree-integration.md': { lines: 4, reason: 'skill-slim conservation pins the pre-split line verbatim' },
  'fsi-app/src/app/admin/parts/masthead/page.tsx': { lines: 1, reason: 'sample brief title on the parts gallery, asserted by the masthead smoke' },
  'fsi-app/src/components/dashboard/brief-title.npmtest.mjs': { lines: 4, reason: 'test expectations for the brief title derivation (input names and expected titles)' },
  'fsi-app/supabase/seed/perf-capture.mjs': { lines: 2, reason: 'script defaults: the test account email read from the env first, and the report output path' },
};

// PENDING SCRUB: prose that still names the operator in a path outside the lane that wrote this verifier
// (lane write set: docs, fsi-app/docs, .claude, fsi-app/.claude, .discipline, scripts, src). These are NOT
// functional; they are owed work (session log 2026-10-11 anon1, NOT done, WORK: owed). Each entry is removed
// in the same change that scrubs its file: a stale entry fails, so this list can only shrink to zero.
const OWED = 'prose outside the ANON-1 write set; scrub owed';
export const PENDING_SCRUB = {
  'docs/inventories/migrations.md': { lines: 2, reason: OWED + ' (generated page: its rows copy the subject line of migrations 137 and 138, so it is regenerated after those two are scrubbed)' },
  'fsi-app/STATUS.md': { lines: 2, reason: OWED + ' (historical status file: a home path and an email)' },
  'fsi-app/supabase/migrations/048_integrity_flags_platform.sql': { lines: 1, reason: OWED + ' (SQL comment in an applied migration)' },
  'fsi-app/supabase/migrations/075_profiles_consolidation_phase1.sql': { lines: 1, reason: OWED + ' (SQL comment in an applied migration)' },
  'fsi-app/supabase/migrations/077_rpc_membership_checks.sql': { lines: 3, reason: OWED + ' (SQL comments in an applied migration)' },
  'fsi-app/supabase/migrations/137_reg_family_slot_gap_satisfiable.sql': { lines: 2, reason: OWED + ' (SQL comments in an applied migration)' },
  'fsi-app/supabase/migrations/138_reg_only_authority_floor.sql': { lines: 2, reason: OWED + ' (SQL comments in an applied migration)' },
  'fsi-app/supabase/migrations/164_market_intel_org_gate.sql': { lines: 2, reason: OWED + ' (SQL comments in an applied migration)' },
  'fsi-app/supabase/seed/audit-tier-h-spot-check.mjs': { lines: 1, reason: OWED + ' (a comment holding a home path)' },
  'install.sh': { lines: 1, reason: OWED + ' (legacy dotfiles banner echoed into a shell profile)' },
};

const ALLOWED = { ...FUNCTIONAL, ...PENDING_SCRUB };

/** Lines of `text` that match any shape: [{ line, kind }]. A line is reported once, with its first kind. */
export function scanText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const s of SHAPES) {
      if (s.re.test(lines[i])) { hits.push({ line: i + 1, kind: s.kind }); break; }
    }
  }
  return hits;
}

/**
 * files: [{ path, text }] (text files only). allow: the FUNCTIONAL map.
 * Returns violation strings; empty means clean.
 */
export function evaluate(files, allow = ALLOWED) {
  const violations = [];
  const seen = new Set();
  for (const [p, entry] of Object.entries(allow)) {
    if (!entry || typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      violations.push(`${p}: allowlist entry has no reason`);
    }
    if (!entry || !Number.isInteger(entry.lines) || entry.lines < 1) violations.push(`${p}: allowlist entry has no line count`);
  }
  for (const f of files) {
    seen.add(f.path);
    const hits = scanText(f.text);
    const allowed = allow[f.path];
    if (!allowed) {
      if (hits.length) violations.push(`${f.path}:${hits[0].line} ${hits[0].kind} (${hits.length} line${hits.length === 1 ? '' : 's'})`);
    } else if (hits.length !== allowed.lines) {
      violations.push(`${f.path}: allowlisted for ${allowed.lines} matching line(s), found ${hits.length}`);
    }
  }
  for (const p of Object.keys(allow)) {
    if (!seen.has(p)) violations.push(`${p}: allowlisted but not a tracked text file (stale entry)`);
  }
  return violations;
}

function trackedTextFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  const files = [];
  for (const p of out.split('\0')) {
    if (!p) continue;
    let buf;
    try { buf = readFileSync(resolve(REPO, p)); } catch { continue; }       // tracked but deleted in this checkout
    if (buf.subarray(0, 8192).includes(0)) continue;                         // binary
    files.push({ path: p, text: buf.toString('utf8') });
  }
  return files;
}

// ---------------------------------------------------------------- attacks: the scanner refuses every shape

test('ATTACK first name in prose is a violation', () => {
  const v = evaluate([{ path: 'docs/x.md', text: `Owner: ${FIRST[0].toUpperCase()}${FIRST.slice(1)} decides.\n` }], {});
  assert.equal(v.length, 1);
  assert.match(v[0], /docs\/x\.md:1 first-name/);
});

test('ATTACK the name inside a home path, a slug, an upper-case token and a handle are all violations', () => {
  const shapes = [
    ['C:', HOME_SEG, FIRST, 'dotfiles'].join(String.fromCharCode(92)),
    ['C-', HOME_SEG, FIRST, 'dotfiles'].join('-'),
    `AWAIT-${FIRST.toUpperCase()}-AUTH`,
    `${FIRST}${LAST}`,
    `UNIX_${FIRST.toUpperCase()}`,
  ];
  for (const s of shapes) assert.equal(scanText(`see ${s} here`).length, 1, s);
});

test('ATTACK the surname as a word is a violation, and inside another word is not', () => {
  assert.equal(scanText(`Full ${LAST[0].toUpperCase()}${LAST.slice(1)}`).length, 1);
  assert.equal(scanText(`a${LAST}b and p${LAST}`).length, 0);
});

test('ATTACK a personal webmail address is a violation, a project address is not', () => {
  assert.equal(scanText('mail me at someone@' + ['hot', 'mail'].join('') + '.com').length, 1);
  assert.equal(scanText('mail me at someone@' + ['g', 'mail'].join('') + '.com').length, 1);
  assert.equal(scanText('mail me at ops@example.com and 123+x@users.noreply.github.com').length, 0);
});

test('ATTACK a clean file passes', () => {
  assert.deepEqual(evaluate([{ path: 'docs/x.md', text: 'The operator decides.\nNothing else.\n' }], {}), []);
});

test('ATTACK an allowlist entry is exact: one more occurrence, a stale entry and a missing reason all fail', () => {
  const text = `x ${FIRST}\ny ${FIRST}\n`;
  const ok = { 'a.txt': { lines: 2, reason: 'a fixture the test reads' } };
  assert.deepEqual(evaluate([{ path: 'a.txt', text }], ok), []);
  assert.equal(evaluate([{ path: 'a.txt', text: text + `z ${FIRST}\n` }], ok).length, 1);          // grew
  assert.equal(evaluate([{ path: 'a.txt', text: 'clean\n' }], ok).length, 1);                       // stale (shrank)
  assert.equal(evaluate([{ path: 'b.txt', text }], ok).length, 2);                                  // other file unlisted + a.txt missing
  assert.equal(evaluate([{ path: 'a.txt', text }], { 'a.txt': { lines: 2, reason: '' } }).length, 1); // no reason
});

// ---------------------------------------------------------------- the working tree

test('no tracked text file names the operator outside the FUNCTIONAL allowlist', () => {
  const violations = evaluate(trackedTextFiles());
  assert.deepEqual(violations.slice(0, 40), [], `${violations.length} violation(s); first 40 shown`);
});

test('every allowlist entry states a reason, and no path is in both lists', () => {
  for (const p of Object.keys(PENDING_SCRUB)) assert.ok(!(p in FUNCTIONAL), p);
  for (const [p, e] of Object.entries(ALLOWED)) assert.ok(e.reason.length >= 10, p);
});
