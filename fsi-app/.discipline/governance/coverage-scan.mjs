/**
 * GOVERNED-SURFACE COVERAGE SCAN (pure core + CLI + F23's analyzer). The system-overhaul-by-construction:
 * instead of hand-guessing which files a skill governs (which demonstrably missed source-growth.ts,
 * the routing layer, and ~20 proofs), this ENUMERATES the entire governed surface mechanically and
 * reports coverage for every item.
 *
 * "Governed surface" (NOT every file — over-mapping decays to ceremony):
 *   WRITES   - CREATES or mutates data (Supabase .insert/.update/.upsert/.delete, a WRITE_RPCS rpc; SQL DML/DDL)
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
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillsForFile, skillsForOp } from './skill-map.mjs';
import { isExempt } from './exemptions.mjs';
import { isExecutionWired } from './execution-wiring.mjs';
import { rawWriteHits } from '../rules/015-row-mutation-guarded-path.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');               // dotfiles repo root
const ROOTS = ['fsi-app/src', 'fsi-app/scripts', 'fsi-app/supabase/migrations'];
const CODE_RE = /\.(ts|tsx|mjs|js)$/;
const SQL_RE = /\.sql$/;
// _archive trees hold sunset code + their colocated proofs (2026-09-01 sunset pass); archived proofs are
// not wired by design, so they are excluded here exactly as F14/F25/the writer registry exclude them.
const SKIP_DIR = /node_modules|\.next|\/dist\/|\/\.git\/|\/_archive\//;

// ---- governed-surface classifiers (content-based) ----
// `insert` is FIRST deliberately: creation is a governed write. Its absence here is what made the
// source-role-at-birth defect invisible to this scan (see the header note).
// update / upsert / delete are decided by rule 015's database-write detector (rawWriteHits: the receiver
// chain must be a Supabase query builder), so createHash().update() and Map.prototype.delete are not writes.
// One predicate, one site: this scan imports it instead of keeping a second regex (MIG-HIST-1b, after the
// RULES-1 / GATE-1 fix of rule 015). insert is not in that detector (additive for rule 015's purpose) but is
// a governed write HERE (creation is birth), so it keeps its own check.
const INSERT_CALL_RE = /\.\s*insert\s*\(/;

// RPC WRITERS (lane GATE-3, 2026-10-08). A bare `.rpc(` used to read as a write, so every READ rpc (a
// category fetcher, a count) landed on the governed surface as an ungoverned write (OPS-1: gate-a-gauges.mjs,
// "a read RPC; the scan cannot tell"). An rpc is a write only when its NAME is here: the repo's SECURITY
// DEFINER writers. A call whose name is not a string literal cannot be classified and is not counted. A new
// writer RPC is added to this list in the commit that adds it (the next UNMAPPED-WRITES failure names it).
export const WRITE_RPCS = Object.freeze([
  'admin_set_pause_state', 'admin_set_judgement_drain', 'create_item_correction', 'revoke_item_correction',
  'create_org_for_self', 'accept_invitation', 'request_verification', 'acquire_mutation_lease',
  'heartbeat', 'release',
  // the names the repo's lease and lock RPCs actually carry (the generic heartbeat / release above are the
  // seed names the brief gave; these are the call sites found by grep on this tree)
  'heartbeat_mutation_lease', 'release_mutation_lease', 'heartbeat_funded_pass_lock', 'release_funded_pass_lock',
]);
const RPC_NAME_RE = /\.\s*rpc\s*\(\s*(["'`])([A-Za-z0-9_]+)\1/g;

/** True when `code` (comments already stripped) calls a name in WRITE_RPCS through `.rpc("name"`. Pure. */
export function callsWriteRpc(code, writeRpcs = WRITE_RPCS) {
  RPC_NAME_RE.lastIndex = 0;
  for (const m of String(code).matchAll(RPC_NAME_RE)) if (writeRpcs.includes(m[2])) return true;
  return false;
}
const isWrite = (code) => rawWriteHits(code).length > 0 || INSERT_CALL_RE.test(code) || callsWriteRpc(code);
const SQL_MUT_RE = /\b(UPDATE\s+\w+\s+SET|DELETE\s+FROM|INSERT\s+INTO|ALTER\s+TABLE|DROP\s+\w+|CREATE\s+OR\s+REPLACE\s+(FUNCTION|VIEW))\b/i;
const MODEL_RE = /api\.anthropic\.com|new\s+Anthropic\s*\(|messages\.create|@anthropic-ai\/sdk/;
const ROUTING_RE = /runCategoryRpc|get_\w+_items\b|fetch(Market|Research|Operations|Technology|Regulations)\w*|category[-_ ]rout/i;
// npmtest + goldens joined 2026-08-11: both ARE proofs (run by the npm-ci step / run-goldens.mjs), and
// leaving them out of PROOF_RE let their fixture content classify them as WRITES/MODEL production gaps.
const PROOF_RE = /\.selftest\.mjs$|\.test\.(mjs|ts|tsx)$|\.npmtest\.mjs$|(\.golden|-golden)\.mjs$/;

// Lane GATE-8: the lexer lives in source-lexer.mjs (no import cycle with execution-wiring.mjs) and is
// re-exported here, the one site the fitness functions import it from.
import { stripComments } from './source-lexer.mjs';
export { CODE, LIT, COM, classifySource, viewSource, codeOnly, codeAndStrings, commentsOnly, stripComments, foldStringConcat } from './source-lexer.mjs';

/**
 * Blank the BODY of every template literal (keeping the backticks and every newline, so line numbers
 * survive), so text that merely LOOKS like code inside one is never read as code. Lane DAUDIT-1
 * (2026-10-08, coordinator ruling): the design-audit mounts file carries browser entry modules as template
 * strings, `import { X } from '@/components/...'` among them, and glob-portability.test.mjs followed
 * those as real imports. Comments and ordinary quoted strings are walked past (not blanked), so a
 * backtick inside either never opens a template; `${ ... }` expressions are blanked with the rest of the
 * template, nested templates included. Pure. Exported for glob-portability.test.mjs and its own test.
 */
export function blankTemplateLiterals(src) {
  const s = String(src);
  const n = s.length;
  let out = '';
  let i = 0;
  const blank = (t) => t.replace(/[^\n]/g, ' ');
  // Index just past the template that opens at s[start] === '`'; nested `${ }` expressions recurse.
  const templateEnd = (start) => {
    let j = start + 1;
    while (j < n) {
      const c = s[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return j + 1;
      if (c === '$' && s[j + 1] === '{') {
        let depth = 1;
        j += 2;
        while (j < n && depth > 0) {
          const d = s[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '`') { j = templateEnd(j); continue; }
          if (d === '"' || d === "'") {
            const q = d;
            j += 1;
            while (j < n && s[j] !== q && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
            j += 1;
            continue;
          }
          if (d === '{') depth += 1;
          else if (d === '}') depth -= 1;
          j += 1;
        }
        continue;
      }
      j += 1;
    }
    return n;
  };
  while (i < n) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === '/' && c2 === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += s.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && c2 === '/') {
      const end = s.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += s.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, n);
      out += s.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '`') {
      const stop = templateEnd(i);
      const closed = s[stop - 1] === '`' && stop - 1 > i;
      out += '`' + blank(s.slice(i + 1, closed ? stop - 1 : stop)) + (closed ? '`' : '');
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
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

/** Files to scan: the git-TRACKED files under ROOTS (lane GATE-3, 2026-10-08). A filesystem walk also read
 *  gitignored scratch (scripts/tmp, local exports), so the same commit scanned 4 more violations locally than
 *  in CI. Falls back to the walk only when git itself is unavailable. Exported for the test. */
export function listScanFiles(repo = REPO, roots = ROOTS) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--', ...roots], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26 });
    return out.split('\0').filter(Boolean)
      .filter((rel) => (CODE_RE.test(rel) || SQL_RE.test(rel)) && !SKIP_DIR.test(`/${rel}`))
      .map((rel) => join(repo, rel));
  } catch {
    return roots.flatMap((r) => walk(join(repo, r)));
  }
}

/** Classify a file's governed kinds. `content` is classified with comments STRIPPED.
 *  A PROOF file classifies as PROOF ONLY: its writes/model/routing matches are FIXTURES exercising the
 *  detector under test, not production operations — tagging a test as an ungoverned production write is
 *  the phantom-gap class (semantics fix 2026-08-11, pinned by test). */
export function classify(relPath, content) {
  if (PROOF_RE.test(relPath)) return ['PROOF'];
  const kinds = [];
  const isSql = SQL_RE.test(relPath);
  const code = isSql ? String(content) : stripComments(content);
  if (isSql ? SQL_MUT_RE.test(code) : isWrite(code)) kinds.push('WRITES');
  if (!isSql && MODEL_RE.test(code)) kinds.push('MODEL');
  if (!isSql && ROUTING_RE.test(code)) kinds.push('ROUTING');
  return kinds;
}

// ORPHANED-PROOF SEMANTICS (redefined 2026-08-11, operator wiring census). The original predicate was
// "no rule/fitness/consistency file MENTIONS this test's basename" — which flagged 113 ordinary unit
// tests that CI runs on every push (a citation census, not a wiring census) while MISSING the harmful
// class entirely: 24 green, portable proof files that NO CI surface executed, among them the red-test
// for the F22 registerSource wiring itself. Run-by-nothing is the goldens-class defect (15 goldens run
// by nothing, found 2026-08-09); cited-by-nothing is at most a naming nicety. The predicate is now
// isExecutionWired() — the SAME resolver the invariant meta-gate uses — so "orphaned proof" means
// exactly "a proof CI never executes", and the two audits cannot disagree about what "wired" means.
const KINDMAP = { WRITES: 'writes', MODEL: 'model', ROUTING: null, PROOF: null };

/** Pure core. Returns { items, summary }. FS-only: no network, no DB, no model call. */
export function runCoverageScan() {
  const files = listScanFiles();
  const report = { generated: 'see git/stamp', roots: ROOTS, items: [], summary: {} };

  for (const abs of files) {
    const rel = relative(REPO, abs).replaceAll('\\', '/');
    let content = '';
    try { content = readFileSync(abs, 'utf8'); } catch { continue; }
    const kinds = classify(rel, content);
    if (kinds.length === 0) continue;                          // not on the governed surface

    const mappedSkills = [...new Set([...skillsForFile(rel).map((s) => s.skill), ...skillsForOp(content).map((s) => s.skill)])];
    const proofWired = kinds.includes('PROOF') ? isExecutionWired(rel) : null;

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
