// SECRETS-REFERENCE AUDIT (Secrets-topology dispatch, 2026-07-12).
// GOVERNING SKILL: sprint-followups-discipline (inventory-consistency class — a referenced entity must be
// a registered entity; the CI-parity discipline). Doctrine: credential-surface-visibility +
// no-new-secrets-without-need (doctrine-register).
//
// WHAT: scans every .github/workflows/*.yml for `${{ secrets.X }}` references and FAILS when X is not in
// the registered set (secrets-registry.mjs WORKFLOW_SECRETS). An UNREGISTERED workflow secret reference is
// exactly the R0.2 defect (the invented `secrets.PROBE_SECRET` that named a secret that never existed) —
// this makes that class a build failure, so an invented/unregistered label can never silently ship again.
//
// PURE + INJECTABLE: auditSecretRefs(files, registered) is the load-bearing core (files = [{name, content}]),
// negative-tested red-then-green in secrets-reference-audit.test.mjs. No secrets, no network, no DB — it
// reads workflow YAML + the registry only, so it runs in the SECRET-LESS pre-push + the required discipline
// suite (unlike the DB-lane audits, this one is fully filesystem-pure).
//
// Exit 0 = every workflow secret reference is registered. Exit 1 = at least one unregistered reference.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_SECRETS } from './secrets-registry.mjs';

const SECRET_REF_RE = /secrets\.([A-Z_][A-Z0-9_]*)/g;

/** Pure core: given workflow files [{name, content}] and a registered Set of names, return problems for
 *  any `secrets.X` reference whose X is not registered. Also returns the full referenced set (for reporting).
 *  @param {Array<{name:string, content:string}>} files @param {Set<string>} registered */
export function auditSecretRefs(files, registered) {
  const problems = [];
  const referenced = new Map(); // name -> [workflow files that reference it]
  for (const f of files) {
    const seen = new Set();
    let m;
    SECRET_REF_RE.lastIndex = 0;
    while ((m = SECRET_REF_RE.exec(f.content)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      if (!referenced.has(name)) referenced.set(name, []);
      referenced.get(name).push(f.name);
      if (!registered.has(name)) {
        problems.push(`UNREGISTERED SECRET REFERENCE: ${f.name} references secrets.${name}, which is not in the secrets registry (WORKFLOW_SECRETS). Register it in .discipline/governance/secrets-registry.mjs + docs/ops/secrets-topology.md, or fix the reference. (This is the invented-label class — see the R0.2/PROBE_SECRET scar.)`);
      }
    }
  }
  return { problems, referenced };
}

function readWorkflows(dir) {
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml')); } catch { return []; }
  return names.map((n) => ({ name: n, content: (() => { try { return readFileSync(join(dir, n), 'utf8'); } catch { return ''; } })() }));
}

export function runSecretsReferenceAudit() {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO = resolve(HERE, '..', '..', '..');
  const files = readWorkflows(join(REPO, '.github', 'workflows'));
  const { problems, referenced } = auditSecretRefs(files, WORKFLOW_SECRETS);
  return { ok: problems.length === 0, problems, referenced, fileCount: files.length };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('secrets-reference-audit.mjs')) {
  const { ok, problems, referenced, fileCount } = runSecretsReferenceAudit();
  console.log(`\n===== SECRETS-REFERENCE AUDIT =====`);
  console.log(`workflows scanned: ${fileCount}  |  distinct secrets referenced: ${referenced.size}  |  registered: ${WORKFLOW_SECRETS.size}`);
  for (const [name, wfs] of [...referenced.entries()].sort()) {
    const mark = WORKFLOW_SECRETS.has(name) ? 'OK ' : '!! ';
    console.log(`  ${mark}secrets.${name.padEnd(28)} ${wfs.join(', ')}`);
  }
  if (ok) { console.log(`\nevery workflow secret reference is registered — no orphan labels.`); process.exit(0); }
  console.error(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
