// CIFIX-2 (2026-10-10, row rw-wf:131): a workflow step that lands a harness-run artifact must never swallow the
// exit code of record-harness-run.mjs. That script exits 1 on a missing credential inside GitHub Actions and 2 only
// for a developer-local no-credential run, so `|| echo "best-effort"` turns a genuine landing failure into a green
// step (the research-walker.yml defect, run 37096258352, fixed in PR 1056; research-assessment.yml still carried the
// same pattern). The class is "a landing step whose failure cannot fail the job", so the check is on EVERY workflow:
// any step named "Land ..." and any line that runs record-harness-run.mjs. Cells: LAND-1 (real workflows),
// LAND-2 (attack: each swallow form is red), LAND-3 (the explicit exit branch and comments are not flagged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = join(HERE, '..', '..', '..', '.github', 'workflows');

/** A shell tail that makes a failing command succeed: `|| echo ...`, `|| true`, `|| :`, `|| exit 0`, `; true`. */
const SWALLOW_RE = /(?:\|\|\s*(?:echo\b|true\b|:(?:\s|$)|exit\s+0\b))|(?:;\s*true\b)/;

/** Split a workflow into its steps: [{ name, startLine, lines: [{ n, text }] }]. */
function stepsOf(yaml) {
  const lines = yaml.split('\n');
  const steps = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)- (?:name:\s*(.*)|uses:|run:)/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const block = [];
    let j = i;
    for (; j < lines.length; j++) {
      if (j > i && lines[j].trim() !== '' && lines[j].length - lines[j].trimStart().length <= indent) break;
      block.push({ n: j + 1, text: lines[j] });
    }
    steps.push({ name: (m[2] ?? '').replace(/^["']|["']$/g, '').trim(), startLine: i + 1, lines: block });
  }
  return steps;
}

/**
 * Every line of a landing step (a step named "Land ...", or any step line running record-harness-run.mjs) that
 * swallows a failing exit. Comment lines are skipped. Returns [{ line, text }].
 */
export function swallowedLandings(yaml) {
  const out = [];
  for (const step of stepsOf(yaml)) {
    const landing = /^Land\b/i.test(step.name);
    for (const { n, text } of step.lines) {
      if (text.trim().startsWith('#')) continue;
      if ((landing || text.includes('record-harness-run.mjs')) && SWALLOW_RE.test(text)) out.push({ line: n, text: text.trim() });
    }
  }
  return out;
}

const step = (name, body) => `    steps:\n      - name: ${name}\n        run: |\n${body.split('\n').map((l) => `          ${l}`).join('\n')}\n`;

test('LAND-1: no workflow in the repo swallows the exit of a landing step', () => {
  const offenders = [];
  for (const f of readdirSync(WORKFLOWS).filter((x) => /\.ya?ml$/.test(x))) {
    for (const o of swallowedLandings(readFileSync(join(WORKFLOWS, f), 'utf8'))) offenders.push(`${f}:${o.line}: ${o.text}`);
  }
  assert.deepEqual(offenders, []);
});

test('LAND-2 attack: each form that makes a failing landing succeed is red', () => {
  for (const tail of ['|| echo "best-effort"', '|| true', '|| :', '|| exit 0', '; true']) {
    const yaml = step('Land the x harness-run artifact into harness_runs', `node scripts/lib/record-harness-run.mjs --file "$latest" ${tail}`);
    assert.equal(swallowedLandings(yaml).length, 1, tail);
  }
  // A record-harness-run line is checked even when the step is not named "Land ...".
  const renamed = step('Record the run', 'node scripts/lib/record-harness-run.mjs --file "$f" || true');
  assert.equal(swallowedLandings(renamed).length, 1);
  // Any swallow inside a step named "Land ..." is red, not only on the record-harness-run line.
  const other = step('Land the artifact', 'node scripts/lib/some-other-lander.mjs --file "$f" || true');
  assert.equal(swallowedLandings(other).length, 1);
});

test('LAND-3: the explicit exit-code branch, an ordinary step and a comment are not flagged', () => {
  const explicit = step(
    'Land the x harness-run artifact into harness_runs',
    [
      'node scripts/lib/record-harness-run.mjs --file "$latest"',
      'status=$?',
      'if [ "$status" -eq 2 ]; then',
      '  echo "self-skip (no credentials), developer-local case only"',
      'elif [ "$status" -ne 0 ]; then',
      '  echo "::error::failed to land $latest (exit $status)"',
      '  exit 1',
      'fi',
    ].join('\n'),
  );
  assert.deepEqual(swallowedLandings(explicit), []);
  assert.deepEqual(swallowedLandings(step('Lint', 'npm run lint || true')), [], 'a non-landing step is out of scope');
  assert.deepEqual(swallowedLandings(step('Land the x', '# node scripts/lib/record-harness-run.mjs --file f || true\nnode scripts/lib/record-harness-run.mjs --file f')), []);
});
