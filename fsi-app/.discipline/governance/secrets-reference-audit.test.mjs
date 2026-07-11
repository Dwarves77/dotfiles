// Wires the secrets-reference audit into `node --test` (pre-push + CI) AND proves it CATCHES an
// unregistered reference (the invented-label class — the R0.2/PROBE_SECRET scar) red-then-green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditSecretRefs, runSecretsReferenceAudit } from './secrets-reference-audit.mjs';
import { WORKFLOW_SECRETS } from './secrets-registry.mjs';

// ── POSITIVE: the real workflow tree references only registered secrets ──
test('real tree: every workflow secret reference is registered (no orphan labels)', () => {
  const { ok, problems } = runSecretsReferenceAudit();
  assert.ok(ok, `unregistered workflow secret reference(s):\n` + problems.map((p) => '  - ' + p).join('\n'));
});

// ── NEGATIVE: a fabricated unregistered reference MUST be caught (proves it is not a no-op) ──
test('NEGATIVE: a fabricated secrets.PROBE_SECRET reference is flagged UNREGISTERED', () => {
  const files = [{ name: 'evil.yml', content: 'env:\n  X: ${{ secrets.PROBE_SECRET }}\n' }];
  const { problems } = auditSecretRefs(files, WORKFLOW_SECRETS);
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.ok(problems[0].includes('UNREGISTERED SECRET REFERENCE'));
  assert.ok(problems[0].includes('PROBE_SECRET'));
});

test('NEGATIVE: any invented label (not just PROBE_SECRET) is caught', () => {
  const files = [{ name: 'a.yml', content: '${{ secrets.MADE_UP_KEY }} and ${{ secrets.WORKER_SECRET }}' }];
  const { problems } = auditSecretRefs(files, WORKFLOW_SECRETS);
  assert.equal(problems.length, 1);          // only MADE_UP_KEY; WORKER_SECRET is registered
  assert.ok(problems[0].includes('MADE_UP_KEY'));
});

// ── CONTROL: registered references produce zero problems ──
test('CONTROL: a workflow referencing only registered secrets is clean', () => {
  const files = [{ name: 'ok.yml', content: '${{ secrets.APP_URL }} ${{ secrets.WORKER_SECRET }}' }];
  const { problems } = auditSecretRefs(files, WORKFLOW_SECRETS);
  assert.equal(problems.length, 0, problems.join('\n'));
});
