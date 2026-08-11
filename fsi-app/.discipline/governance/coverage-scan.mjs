/**
 * GOVERNED-SURFACE COVERAGE SCAN (pure core + CLI + F23's analyzer). The system-overhaul-by-construction:
 * instead of hand-guessing which files a skill governs (which demonstrably missed source-growth.ts,
 * the routing layer, and ~20 proofs), this ENUMERATES the entire governed surface mechanically and
 * reports coverage for every item.
 *
 * "Governed surface" (NOT every file — over-mapping decays to ceremony):
 *   WRITES   — CREATES or mutates data (Supabase .insert/.update/.upsert/.delete/.rpc-write; SQL DML/DDL)
 *   MODEL    — calls the LLM (Anthropic / Claude)
 *   ROUTING  — decides what content surfaces where (category RPCs, surface data fetchers)
 *   PROOF    — a *.selftest.mjs / *.test.* that proves some logic
 *
 * For each governed file: COVERED (skill-map maps it, or — for proofs — a rule/fitness references
 * it), EXEMPT (recorded in exemptions.mjs), or a GAP (UNMAPPED-GOVERNED / ORPHANED-PROOF).
 *
 * WIRING (2026-08-11). This scan was the ONLY governance module in this directory with ZERO inbound
 * references: nothing imported it, no CI job ran it, no runner listed it. It executed when a human
 * remembered — which is the same "declared but not wired" defect class it exists to find. It is now the
 * analyzer behind fitness F23 (governed-surface-coverage), so CI runs it on every PR. F23 RATCHETS: the
 * gap count may never EXCEED the committed baseline, and a run BELOW the baseline fails too, forcing the
 * baseline down. A one-way ratchet is the only kind that actually tightens.
 *
 * COST: filesystem only. No network, no database, no model call, no schedule. It reads the repo it is
 * already checked out in and returns. Running it in CI adds seconds, not spend.
 *
 * TWO DETECTOR DEFECTS FIXED at wiring time (both proven against the F22 source-role incident):
 *   1. `insert` was ABSENT from WRITE_RE — the classifier governed mutation and deletion but not BIRTH.
 *      Consequence: verification.ts (the W2.F pipeline that CREATES sources) and 33 other row-creating
 *      files were not on the governed surface AT ALL, so the scan reported zero gaps for exactly the
 *      files carrying the source_role-at-birth defect. A coverage scan blind to creation cannot see a
 *      creation-time contract.
 *   2. Classification read COMMENTS as code — `MODEL_RE` matched `@anthropic-ai/sdk` inside a doc
 *      comment, so scripts/lib/batch-primitives.mjs (a retry/ratelimit helper that never calls the API)
 *      was reported as an ungoverned LLM call site. Phantom gaps train the reader to ignore the report.
 * Both are pinned by coverage-scan.test.mjs.
 *
 * Output: pure runCoverageScan() for F23; console summary + durable JSON report when run as a CLI.
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
// `insert` is FIRST deliberately: creation is a governed write. Its absence here is what made the
// source-role-at-birth defect invisible to this scan (see the header note).
const WRITE_RE = /\.\s*(insert|update|upsert|delete)\s*\(|\.\s*rpc\s*\(/;
const SQL_MUT_RE = /\b(UPDATE\s+\w+\s+SET|DELETE\s+FROM|INSERT\s+INTO|ALTER\s+TABLE|DROP\s+\w+|CREATE\s+OR\s+REPLACE\s+(FUNCTION|VIEW))\b/i;
const MODEL_RE = /api\.anthropic\.com|new\s+Anthropic\s*\(|messages\.create|@anthropic-ai\/sdk/;
const ROUTING_RE = /runCategoryRpc|get_\w+_items\b|fetch(Market|Research|Operations|Technology|Regulations)\w*|category[-_ ]rout/i;
const PROOF_RE = /\.selftest\.mjs$|\.test\.(mjs|ts|tsx)$/;

/**
 * Strip comments so a MENTION is never read as a CALL. Block comments go first; line comments only
 * when the `//` is NOT preceded by `:` — otherwise `https://api.anthropic.com` would be truncated at
 * the scheme and every URL in real code would vanish along with the signal we are looking for.
 * Exported for the test, which pins both halves.
 */
export function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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

/** Classify a file's governed kinds. `content` is classified with comments STRIPPED. */
export function classify(relPath, content) {
  const kinds = [];
  const isSql = SQL_RE.test(relPath);
  const code = isSql ? String(content) : stripComments(content);
  if (PROOF_RE.test(relPath)) kinds.push('PROOF');
  if (isSql ? SQL_MUT_RE.test(code) : WRITE_RE.test(code)) kinds.push('WRITES');
  if (!isSql && MODEL_RE.test(code)) kinds.push('MODEL');
  if (!isSql && ROUTING_RE.test(code)) kinds.push('ROUTING');
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

const KINDMAP = { WRITES: 'writes', MODEL: 'model', ROUTING: null, PROOF: null };

/** Pure core. Returns { items, summary }. FS-only: no network, no DB, no model call. */
export function runCoverageScan() {
  const refBlob = disciplineRefBlob();
  const files = ROOTS.flatMap((r) => walk(join(REPO, r)));
  const report = { generated: 'see git/stamp', roots: ROOTS, items: [], summary: {} };

  for (const abs of files) {
    const rel = relative(REPO, abs).replaceAll('\\', '/');
    let content = '';
    try { content = readFileSync(abs, 'utf8'); } catch { continue; }
    const kinds = classify(rel, content);
    if (kinds.length === 0) continue;                          // not on the governed surface

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
  return report;
}

// ---- CLI (unchanged behaviour: durable JSON report + console summary) ----
const INVOKED_DIRECTLY = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (INVOKED_DIRECTLY) {
  const report = runCoverageScan();
  writeFileSync(join(HERE, 'coverage-report.json'), JSON.stringify(report, null, 2));

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
}
