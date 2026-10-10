// docs-only-range.mjs (lane R22, ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH, 2026-10-01). THE ONE shared
// primitive that decides whether a commit range's diff touches only docs/** and *.md files. Both
// fsi-app/.discipline/hooks/pre-push (its docs-only fast path, step -1) and
// .github/workflows/discipline.yml (the SAME filter, in the two heavy jobs) call THIS file so the two
// surfaces cannot drift the way run-test-suite.sh / override-check.mjs / memory-gate.mjs already
// prevent for their own classes (lane-common-contract's own "ONE HOME" precedent). Never duplicate the
// glob logic in shell AND YAML separately.
//
// WHY A PATH FILTER HERE IS SAFE, UNLIKE discipline.yml's OWN REJECTED ONE (2026-08-12 header, "Filtering
// paths was considered and REJECTED: a skipped required check reports neither success nor failure").
// That rejection was about filtering at the WORKFLOW TRIGGER level (`on.push.paths` / `paths-ignore`),
// which stops the job from running at all -- a required check with no run blocks the merge forever. This
// primitive is read INSIDE an already-running job, to skip a SUBSET of that job's own steps; the job
// itself always runs its Checkout/Setup Node steps and reports a real pass/fail, so the required-check
// hazard the 2026-08-12 header warned about does not apply here.
//
// GATE-9 (2026-10-08, AUD-AT-5 DO-1, DO-2, DO-3): the verdict is about WHAT CHANGED, judged from both
// sides of every rename and with the files the heavy gates READ taken out of the fast path.
//   1. A rename is classed by its SOURCE as well as its destination. `git diff --name-only` lists a rename
//      by its new path alone, so `git mv fsi-app/src/lib/api/auth.ts docs/auth-moved.ts` read as a docs
//      change and the heavy steps never ran on code that left its directory (DO-1). changedFiles() reads
//      `--name-status -M -z`, which names both paths of a rename or copy.
//   2. A GOVERNING docs file is never docs-only. The lane contract (closure gate LANE-CONTRACT), the doctrine
//      files the invariant-coverage meta-gate sweeps, any SKILL.md (skill-contract-map pins them), the COMMON
//      terms briefs, PROGRAM-BOARD (closure gate STALE-NEXT) and the maintenance runbook index are INPUTS to
//      the gates this fast path skips. A heading edit to the contract failed the closure gate when it was run
//      directly while this primitive said docs-only (DO-2); a deleted pinned SKILL.md failed
//      skill-contract-map and the meta-gate the same way (DO-3).
//   3. A test, a golden or an executable file under docs/ is code. docs/** is documentation, but a `.mjs`,
//      `.ts`, `.sh` or `.yml` file there is run by something, and a `*.test.*` file is a test whatever
//      directory holds it.
//
// CI-FIX-1 (RULES-X-1 item 10, 2026-10-09): a docs file that a test or a gate READS is governing too, and that
// list is DERIVED here, never typed. extractReadDocPaths() scans the tracked tests and governance modules for the
// docs-like paths they read (a path literal on a read, exists, resolve or join line, a named path constant, or a
// join()/resolve() of segments), skipping comment lines and plain lists of names, and isGoverningDocPath()
// consults the result. A false "governing" costs one heavy run, while a false "docs-only" skips the gate that
// reads the file (an edit to a read doc that classed as docs-only and then failed the suite it had skipped).
//
// CLI: node docs-only-range.mjs --range=<git-range>
//   exit 0  = every changed file in the range is docs-only (see isDocsOnlyPath)
//   exit 1  = at least one changed file is outside that set (not docs-only) -- including an EMPTY diff,
//             which is treated as "not provably docs-only" rather than vacuously true
//   exit 2  = engine error (bad/missing --range, git failure)
// The changed-file list is printed to stderr either way, for diagnosis; the verdict line goes to stdout
// ("docs-only: true" / "docs-only: false") so a caller can also read it instead of relying on exit code.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { getRepoRoot } from '../lib/context.mjs';
import { isMainModule } from '../../scripts/lib/is-main.mjs';
import { DOCTRINE_FILES } from './doctrine-contradiction.mjs';
import { TEST_FILE_RE } from '../lib/test-discovery.mjs';

/** Code-like extensions: a file with one of these is run, imported or executed by something. */
const CODE_EXTENSION_RE = /\.(?:[cm]?[jt]sx?|sh|bash|yml|yaml|sql|py)$/i;
/** Doctrine and contract files the skipped gates read. Exact paths; the doctrine list is the contradiction
 *  scan's own (reused, never copied). */
const GOVERNING_EXACT = new Set([
  ...DOCTRINE_FILES,
  'docs/dispatches/lane-common-contract.md',
  'docs/plans/complete-system-build-plan-2026-09-04.md',
  'docs/PROGRAM-BOARD.md',
  'docs/runbooks/MAINTENANCE-RUNBOOK.md',
]);
const GOVERNING_PATTERNS = [
  /(?:^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/,
  // SKILL-SLIM-1 (2026-10-08): the sections a skill's core no longer carries live in references/*.md beside
  // it, moved verbatim; a change to one is a change to the skill's governing text, never docs-only.
  /(?:^|\/)\.claude\/skills\/[^/]+\/references\/[^/]+\.md$/,
  /^docs\/runbooks\/maintenance\.d\//,
  /(?:^|\/)(?:brief-)?common[^/]*\.md$/i,
];

/** A callee whose call reads, opens or resolves a path: a docs literal inside its parentheses is a dependency. */
const READ_CALLEE_RE = /(?:read|exist|stat|resolve|join|open|load|require|import)/i;
const JOIN_CALLEE_RE = /^(?:join|resolve)$/;
const DOCS_ROOT_RE = /^(?:docs|fsi-app)(?:\/|$)/;
const DOCS_FILE_RE = /\.(?:md|json|txt)$/;
/** A whole-literal docs path with no interpolation: slash-bearing, ending .md, .json or .txt. */
const PLAIN_DOC_PATH_RE = /^(?:\.\/)?([\w.-]+(?:\/[\w.-]+)+\.(?:md|json|txt))$/;
/** The scan's own files are excluded: their fixture literals name paths the tests assert are docs-only. */
const SCAN_SELF_RE = /(?:^|\/)docs-only-range(?:\.test)?\.mjs$/;
/** A word after which a `/` begins a regular expression, not a division. */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'instanceof', 'new', 'delete', 'void', 'throw', 'yield', 'await']);
/** An interpolation inside a template literal, in the literal's static text. */
const HOLE = '\0';
const HOLE_PREFIX_RE = new RegExp(`^${HOLE}/?`);
const HOLE_ALL_RE = new RegExp(HOLE, 'g');
/** A docs path that may carry `*` for an interpolated segment. */
const GLOB_PATH_RE = /^[\w.\-/*]+$/;

/**
 * CIFIX-2 (2026-10-10): a dependency-free JavaScript tokenizer, enough to walk every string literal and template
 * literal of a module without mistaking a comment, a regular expression or prose for code. The docs-only classifier
 * runs before `npm ci`, so it cannot import a parser; this lexer reads strings (with escapes), templates (with nested
 * `${}` expressions lexed recursively), comments, regular expressions, identifiers and punctuation. PURE.
 * @param {string} src
 * @param {number} [start]
 * @param {boolean} [nested] stop at the `}` that closes a template interpolation
 * @returns {{tokens: object[], end: number}}
 */
export function lexJs(src, start = 0, nested = false) {
  const tokens = [];
  const n = src.length;
  let i = start;
  let depth = 0;
  const regexAllowed = () => {
    const p = tokens[tokens.length - 1];
    if (!p) return true;
    if (p.t === 'str' || p.t === 'num' || p.t === 're') return false;
    if (p.t === 'id') return REGEX_AFTER_WORD.has(p.v);
    return !(p.v === ')' || p.v === ']' || p.v === '}');
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2; continue; }
        v += src[j++];
      }
      tokens.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let v = '';
      const inner = [];
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          const r = lexJs(src, j + 2, true);
          inner.push(r.tokens);
          v += HOLE;
          j = r.end;
          continue;
        }
        v += src[j++];
      }
      tokens.push({ t: 'str', v, inner });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j])) j++;
      tokens.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      tokens.push({ t: 're' });
      i = j;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      if (nested && depth === 0) return { tokens, end: i + 1 };
      depth--;
    }
    tokens.push({ t: 'p', v: c });
    i++;
  }
  return { tokens, end: i };
}

const isP = (tok, v) => tok?.t === 'p' && tok.v === v;

/**
 * The repo-relative docs path a literal's static text names, or null (prose, a bare name, no docs root). An
 * interpolation AFTER the docs root becomes `*` (one path segment), so `docs/zz/${name}.md` names every .md directly
 * under docs/zz/: which file is read is unknown, so every candidate is governing.
 */
function docPathOf(v) {
  if (!v || /\s/.test(v)) return null;
  const s = v.replace(/\\/g, '/');
  if (!s.includes(HOLE)) {
    const m = PLAIN_DOC_PATH_RE.exec(s);
    return m ? m[1] : null;
  }
  // A template with a variable prefix (`${root}/docs/x.md`): from the first static piece that begins at a docs root.
  const pieces = s.split(HOLE);
  const at = pieces.findIndex((p) => DOCS_ROOT_RE.test(p.replace(/^\/+/, '')));
  if (at < 0) return null;
  const path = [pieces[at].replace(/^\/+/, ''), ...pieces.slice(at + 1)].join('*');
  if (!GLOB_PATH_RE.test(path) || !path.includes('/') || !DOCS_FILE_RE.test(path)) return null;
  return posix.normalize(path);
}

/** The path a join()/resolve() call's literal arguments form from the first docs-rooted segment on, or null. */
function joinedDocPath(lits) {
  const args = lits.map((a) => a.replace(/\\/g, '/').replace(HOLE_PREFIX_RE, '').replace(HOLE_ALL_RE, '*').replace(/^\/+|\/+$/g, ''));
  const at = args.findIndex((a) => DOCS_ROOT_RE.test(a));
  if (at < 0) return null;
  const joined = args.slice(at).filter(Boolean).join('/').replace(/\/+/g, '/');
  return joined.includes('/') && DOCS_FILE_RE.test(joined) && GLOB_PATH_RE.test(joined) ? joined : null;
}

/**
 * Walk one token list: a docs-like literal is a read when it is (a) inside the parentheses of a read, open, exist,
 * resolve or join style call at any line distance, (b) the value bound to a SCREAMING_CASE constant, or bound to
 * any other name that reaches a read call anywhere in the same module (a path built in one statement and read in a
 * later one). A literal that is an object property value (a fixture
 * field such as `file_path: ...` is not a read), an element of an array, an argument of any other call, prose, or
 * inside a comment or regular expression is not.
 * @param {object[]} tokens
 * @param {Set<string>} out
 */
function collectReadDocs(tokens, ctx) {
  const { out, bindings, readIds } = ctx;
  const stack = [];
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'p') {
      if (tok.v === '(') stack.push({ kind: '(', name: tokens[k - 1]?.t === 'id' ? tokens[k - 1].v : '', lits: [] });
      else if (tok.v === '[') stack.push({ kind: '[', name: '', lits: [] });
      else if (tok.v === ')' || tok.v === ']') {
        const frame = stack.pop();
        if (frame?.kind === '(' && JOIN_CALLEE_RE.test(frame.name)) {
          const joined = joinedDocPath(frame.lits);
          if (joined) out.add(joined);
        }
      }
      continue;
    }
    if (tok.t === 'id') {
      if (stack.some((f) => f.kind === '(' && READ_CALLEE_RE.test(f.name))) readIds.add(tok.v);
      continue;
    }
    if (tok.t !== 'str') continue;
    for (const inner of tok.inner ?? []) collectReadDocs(inner, ctx);
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    const top = stack[stack.length - 1];
    if (top?.kind === '(' && (isP(prev, '(') || isP(prev, ',')) && (isP(next, ',') || isP(next, ')'))) top.lits.push(tok.v);
    const path = docPathOf(tok.v);
    if (!path) continue;
    const inRead = top?.kind !== '[' && stack.some((f) => f.kind === '(' && READ_CALLEE_RE.test(f.name));
    if (inRead) {
      out.add(path);
      continue;
    }
    const name = isP(prev, '=') && tokens[k - 2]?.t === 'id' ? tokens[k - 2].v : null;
    if (!name) continue;
    // A named path constant (SCREAMING_CASE) is a dependency as it stands; any other name is one when it reaches a read call.
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) out.add(path);
    else bindings.set(name, (bindings.get(name) ?? new Set()).add(path));
  }
}

/**
 * The docs-like paths a set of sources names. PURE.
 * @param {{path: string, text: string}[]} sources
 * @returns {Set<string>} repo-relative, forward-slash paths
 */
export function extractReadDocPaths(sources) {
  const out = new Set();
  for (const src of sources ?? []) {
    if (SCAN_SELF_RE.test(String(src?.path ?? '').replace(/\\/g, '/'))) continue;
    const ctx = { out, bindings: new Map(), readIds: new Set() };
    collectReadDocs(lexJs(String(src?.text ?? '')).tokens, ctx);
    for (const [name, paths] of ctx.bindings) if (ctx.readIds.has(name)) for (const p of paths) out.add(p);
  }
  return out;
}

/**
 * Scan the repo's tracked tests and governance modules (fsi-app/**\/*.test.mjs, *.npmtest.mjs and every .mjs under
 * fsi-app/.discipline/) for the docs paths they name.
 * @param {string} repoRoot
 * @returns {Set<string>}
 */
export function loadReadDocPaths(repoRoot) {
  const listed = execFileSync('git', ['ls-files', '-z', '--', 'fsi-app'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = listed.split('\0').filter((f) => /\.mjs$/.test(f) && (/\.(?:npm)?test\.mjs$/.test(f) || f.startsWith('fsi-app/.discipline/')));
  const sources = [];
  for (const f of files) {
    try {
      sources.push({ path: f, text: readFileSync(`${repoRoot}/${f}`, 'utf8') });
    } catch {
      // a file listed but absent from the working tree (deleted, uncommitted) names nothing
    }
  }
  return extractReadDocPaths(sources);
}

let readDocCache = null;
function defaultReadDocPaths() {
  if (!readDocCache) readDocCache = loadReadDocPaths(getRepoRoot());
  return readDocCache;
}

function normalize(path) {
  const p = String(path ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return '';
  return posix.normalize(p).replace(/^\.\//, '');
}

/**
 * @param {string} path repo-relative path (either slash convention)
 * @param {Set<string>} [readDocs] the docs paths tests and gates read; derived from the repo when omitted
 * @returns {boolean} true when the path is a governing docs file: a heavy gate reads it, so it is never docs-only
 */
export function isGoverningDocPath(path, readDocs) {
  const p = normalize(path);
  if (!p) return false;
  if (GOVERNING_EXACT.has(p) || GOVERNING_PATTERNS.some((re) => re.test(p))) return true;
  return readDocMatches(readDocs ?? defaultReadDocPaths(), p);
}

/** True for an exact entry, or an entry with `*` (an interpolated segment) that the path matches. */
function readDocMatches(readDocs, p) {
  if (readDocs.has(p)) return true;
  for (const entry of readDocs) {
    if (!entry.includes('*')) continue;
    const re = new RegExp(`^${entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
    if (re.test(p)) return true;
  }
  return false;
}

/**
 * @param {string} path repo-relative path (either slash convention)
 * @param {Set<string>} [readDocs] see isGoverningDocPath
 * @returns {boolean}
 */
export function isDocsOnlyPath(path, readDocs) {
  const p = normalize(path);
  if (!p) return false;
  if (isGoverningDocPath(p, readDocs)) return false;
  // docs/ holds design handoff scripts (.js, .jsx) that no runner executes; any other code-like file is code.
  const designScript = p.startsWith('docs/') && /\.jsx?$/i.test(p);
  if (TEST_FILE_RE.test(p) || (CODE_EXTENSION_RE.test(p) && !designScript)) return false;
  if (p.startsWith('docs/')) return true;
  if (p.endsWith('.md')) return true;
  return false;
}

/**
 * @param {string[]} files repo-relative paths
 * @param {Set<string>} [readDocs] see isGoverningDocPath
 * @returns {boolean} true only when the list is non-empty AND every entry is docs-only
 */
export function isDocsOnlyDiff(files, readDocs) {
  const list = (files ?? []).map((f) => String(f ?? '').trim()).filter(Boolean);
  if (list.length === 0) return false;
  return list.every((f) => isDocsOnlyPath(f, readDocs));
}

/**
 * Parse `git diff --name-status -M -z` output into the flat list of every path the diff names: a rename or
 * copy contributes BOTH its source and its destination, anything else its one path. PURE.
 * @param {string} raw NUL-separated: <status> NUL <path> [NUL <path2>] ...
 * @returns {string[]}
 */
export function parseNameStatusZ(raw) {
  const tokens = String(raw ?? '').split('\0');
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (!status) continue;
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    for (let k = 1; k <= pathCount; k++) {
      const p = tokens[i + k];
      if (p) out.push(p.replace(/\\/g, '/'));
    }
    i += pathCount;
  }
  return out;
}

/**
 * @param {string} range a git revision range, e.g. "origin/master..HEAD"
 * @param {string} cwd repo root
 * @returns {string[]} repo-relative changed file paths, both sides of every rename
 */
export function changedFiles(range, cwd) {
  // Both sides of a rename (GATE-7 chose --no-renames for the same end: a rename is a delete of its SOURCE plus an
  // add of its destination, so code moved into docs/ is classed by where it came from).
  const out = execFileSync('git', ['diff', '--name-status', '-M', '-z', range], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return parseNameStatusZ(out);
}

function main() {
  const rangeArg = process.argv.find((a) => a.startsWith('--range='));
  if (!rangeArg || rangeArg.length <= '--range='.length) {
    console.error('docs-only-range: --range=<git-range> is required.');
    process.exit(2);
  }
  const range = rangeArg.slice('--range='.length);
  const repoRoot = getRepoRoot();
  let files;
  try {
    files = changedFiles(range, repoRoot);
  } catch (err) {
    console.error(`docs-only-range: git diff failed for range "${range}": ${err.message}`);
    process.exit(2);
  }
  let docsOnly;
  try {
    docsOnly = isDocsOnlyDiff(files, loadReadDocPaths(repoRoot));
  } catch (err) {
    console.error(`docs-only-range: scanning the tests and gates for the docs they read failed: ${err.message}`);
    process.exit(2);
  }
  console.error(`docs-only-range: ${files.length} changed file(s) in ${range}:`);
  for (const f of files) console.error(`  ${f}`);
  console.log(`docs-only: ${docsOnly}`);
  process.exit(docsOnly ? 0 : 1);
}

if (isMainModule(import.meta.url)) main();
