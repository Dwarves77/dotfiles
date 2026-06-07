/**
 * GOVERNED-SURFACE COVERAGE SCAN (read-only detector). The system-overhaul-by-construction:
 * instead of hand-guessing which files a skill governs (which demonstrably missed source-growth.ts,
 * the routing layer, and ~20 proofs), this ENUMERATES the entire governed surface mechanically and
 * reports coverage for every item.
 *
 * "Governed surface" (NOT every file — over-mapping decays to ceremony):
 *   WRITES   — mutates existing data (Supabase .update/.upsert/.delete/.rpc-write; SQL DML/DDL)
 *   MODEL    — calls the LLM (Anthropic / Claude)
 *   ROUTING  — decides what content surfaces where (category RPCs, surface data fetchers)
 *   PROOF    — a *.selftest.mjs / *.test.* that proves some logic
 *
 * For each governed file: COVERED (skill-map maps it, or — for proofs — a rule/fitness references
 * it), EXEMPT (recorded in exemptions.mjs), or a GAP (UNMAPPED-GOVERNED / ORPHANED-PROOF).
 *
 * The gap list IS the program scope. Wire-or-exempt each; the scan re-run must show zero gaps.
 * Output: console summary + a durable JSON report at governance/coverage-report.json.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillsForFile, skillsForOp } from './skill-map.mjs';
import { isExempt } from './exemptions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');               // dotfiles repo root
const ROOTS = ['fsi-app/src', 'fsi-app/scripts', 'fsi-app/supabase/migrations'];
const CODE_RE = /\.(ts|tsx|mjs|js)$/;
const SQL_RE = /\.sql$/;
const SKIP_DIR = /node_modules|\.next|\/dist\/|\/\.git\//;

// ---- governed-surface classifiers (content-based) ----
const WRITE_RE = /\.\s*(update|upsert|delete)\s*\(|\.\s*rpc\s*\(/;          // supabase row writes / rpc (may write)
const SQL_MUT_RE = /\b(UPDATE\s+\w+\s+SET|DELETE\s+FROM|INSERT\s+INTO|ALTER\s+TABLE|DROP\s+\w+|CREATE\s+OR\s+REPLACE\s+(FUNCTION|VIEW))\b/i;
const MODEL_RE = /api\.anthropic\.com|new\s+Anthropic\s*\(|messages\.create|@anthropic-ai\/sdk/;
const ROUTING_RE = /runCategoryRpc|get_\w+_items\b|fetch(Market|Research|Operations|Technology|Regulations)\w*|category[-_ ]rout/i;
const PROOF_RE = /\.selftest\.mjs$|\.test\.(mjs|ts|tsx)$/;

function walk(absDir, acc = []) {
  if (!existsSync(absDir)) return acc;
  for (const d of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, d.name);
    if (SKIP_DIR.test(abs.replaceAll('\\', '/'))) continue;
    if (d.isDirectory()) walk(abs, acc);
    else if (CODE_RE.test(d.name) || SQL_RE.test(d.name)) acc.push(abs);
  }
  return acc;
}

function classify(relPath, content) {
  const kinds = [];
  const isSql = SQL_RE.test(relPath);
  if (PROOF_RE.test(relPath)) kinds.push('PROOF');
  if (isSql ? SQL_MUT_RE.test(content) : WRITE_RE.test(content)) kinds.push('WRITES');
  if (!isSql && MODEL_RE.test(content)) kinds.push('MODEL');
  if (!isSql && ROUTING_RE.test(content)) kinds.push('ROUTING');
  return kinds;
}

// Precompute: which proofs are referenced by a rule/fitness function (= wired).
function disciplineRefBlob() {
  const dirs = ['fsi-app/.discipline/rules', 'fsi-app/.discipline/fitness/functions', 'fsi-app/.discipline/consistency'];
  let blob = '';
  for (const d of dirs) {
    const abs = join(REPO, d);
    if (!existsSync(abs)) continue;
    for (const f of walk(abs)) blob += readFileSync(f, 'utf8');
  }
  return blob;
}

const refBlob = disciplineRefBlob();
const files = ROOTS.flatMap((r) => walk(join(REPO, r)));
const report = { generated: 'see git/stamp', roots: ROOTS, items: [], summary: {} };
const KINDMAP = { WRITES: 'writes', MODEL: 'model', ROUTING: null, PROOF: null };

for (const abs of files) {
  const rel = relative(REPO, abs).replaceAll('\\', '/');
  let content = '';
  try { content = readFileSync(abs, 'utf8'); } catch { continue; }
  const kinds = classify(rel, content);
  if (kinds.length === 0) continue;                          // not on the governed surface

  // coverage
  const mappedSkills = [...new Set([...skillsForFile(rel).map((s) => s.skill), ...skillsForOp(content).map((s) => s.skill)])];
  const base = rel.split('/').pop();
  const proofWired = kinds.includes('PROOF') ? refBlob.includes(base) : null;

  // per-kind status; a file is a GAP if ANY governed kind is uncovered AND not exempt for that kind
  const gaps = [];
  for (const k of kinds) {
    const exK = KINDMAP[k];                                  // exemption sub-kind (writes/model) or null=whole
    const ex = isExempt(rel, exK || undefined);
    if (ex) continue;                                        // exempted for this kind
    if (k === 'PROOF') { if (!proofWired) gaps.push('ORPHANED-PROOF'); continue; }
    if (mappedSkills.length === 0) gaps.push(`UNMAPPED-${k}`);
  }
  const wholeExempt = isExempt(rel);
  const status = wholeExempt ? 'EXEMPT' : (gaps.length ? gaps.join('+') : 'COVERED');
  report.items.push({ path: rel, kinds, skills: mappedSkills, proofWired, status });
}

// summary
const by = (pred) => report.items.filter(pred).length;
report.summary = {
  governed_files: report.items.length,
  covered: by((i) => i.status === 'COVERED'),
  exempt: by((i) => i.status === 'EXEMPT'),
  gaps: by((i) => i.status !== 'COVERED' && i.status !== 'EXEMPT'),
  orphaned_proofs: by((i) => i.status.includes('ORPHANED-PROOF')),
  unmapped_writes: by((i) => i.status.includes('UNMAPPED-WRITES')),
  unmapped_model: by((i) => i.status.includes('UNMAPPED-MODEL')),
  unmapped_routing: by((i) => i.status.includes('UNMAPPED-ROUTING')),
};

writeFileSync(join(HERE, 'coverage-report.json'), JSON.stringify(report, null, 2));

// ---- console output ----
console.log(`\n===== GOVERNED-SURFACE COVERAGE SCAN =====`);
console.log(`roots: ${ROOTS.join(', ')}`);
console.log(`governed files: ${report.summary.governed_files}  |  COVERED ${report.summary.covered}  EXEMPT ${report.summary.exempt}  GAPS ${report.summary.gaps}`);
console.log(`gaps breakdown: orphaned-proofs=${report.summary.orphaned_proofs}  unmapped-writes=${report.summary.unmapped_writes}  unmapped-model=${report.summary.unmapped_model}  unmapped-routing=${report.summary.unmapped_routing}\n`);

const gapItems = report.items.filter((i) => i.status !== 'COVERED' && i.status !== 'EXEMPT');
const group = (label, pred) => {
  const g = gapItems.filter(pred);
  if (!g.length) return;
  console.log(`──── ${label} (${g.length}) ────`);
  for (const i of g) console.log(`  [${i.kinds.join(',')}] ${i.path}${i.skills.length ? '  (maps: ' + i.skills.join(',') + ')' : ''}`);
  console.log('');
};
group('ORPHANED PROOFS (proven, not wired to any rule/fitness)', (i) => i.status.includes('ORPHANED-PROOF'));
group('UNMAPPED WRITES (mutates data, no governing skill)', (i) => i.status.includes('UNMAPPED-WRITES'));
group('UNMAPPED MODEL CALLS (calls LLM, no governing skill)', (i) => i.status.includes('UNMAPPED-MODEL'));
group('UNMAPPED ROUTING (decides surfaces, no governing skill)', (i) => i.status.includes('UNMAPPED-ROUTING'));
console.log(`full report: fsi-app/.discipline/governance/coverage-report.json`);
console.log(`=== scan complete (read-only) ===`);
