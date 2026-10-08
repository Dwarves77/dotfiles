// Rule 015: Row-mutating scripts must write through the guarded path (scripts/lib/db.mjs).
// Governing skills (via governance/skill-map): environmental-policy-and-innovation (taxonomy
// writes) + remediation-discipline (delete/archive). Content-verifiable (012-style): we read the
// staged script bytes and FAIL on a RAW Supabase write that does not go through the guarded helper.
//
// Why this is enforcement, not ceremony (manifest 5e3ae41): it verifies the ACTUAL write path in
// code, not a trailer that claims compliance. The guarded helper captures a prior-value snapshot
// (reversibility) + records the governing-skill cite; a raw .update()/.delete() does neither.
//
// Trigger: a staged .mjs file under fsi-app/scripts/ (excluding _diag/ read-only convention, lib/ where
//          the helper itself lives, and *.test/.npmtest/.selftest/.golden.mjs proof files that fake a
//          client) whose content contains a raw Supabase write call.
// Check:   FAIL unless the file imports the guarded helper. There is no override trailer: lane GATE-1
//          (2026-10-08) removed Write-Guard-Override (no validation, whole-commit scope, one use in 30
//          days, and that use justified a false positive). The false positives are fixed at the rule.
//
// SCOPE (lane GATE-1, 2026-10-08): introduced lines, not the whole file. The rule used to fail a commit
// that touched any line of a script holding a raw write anywhere (4 of 4 firings in 30 days were that,
// or the RULES-1 hash-call class). A database-write hit now counts only when it sits on a line the commit
// introduces: an added or edited line whose removed counterpart did not already carry a write call, and
// not a line moved from elsewhere in the diff (ctx.introducedLines, lib/context.mjs). The hit itself is
// still found on the whole file, because the receiver-chain analysis below needs the surrounding code.
//
// PRECISION (lane RULES-1, 2026-10-07, operator ruling: a gate that misfires is fixed at the gate, not
// routed around). The detector used to be a bare regex over the raw file text matching any `.update(`,
// `.upsert(` or `.delete(`. It fired on `createHash().update()`, `Map.prototype.delete`,
// `Set.prototype.delete` and any other object carrying those method names, and three lanes on
// 2026-10-07 rewrote correct code to dodge it. It is now a DATABASE-write detector: a call counts only
// when its receiver chain is a Supabase query builder, decided on the code with comments and string
// contents masked (so a method name in prose or in a SQL string is never a call). A candidate call is a
// database write when:
//   1. its receiver chain contains a `.from(` call (`sb.from("t").select().eq().delete()`, multi-line
//      chains, optional chaining), except the builtin statics Array/Buffer/Object/typed-array `.from(`;
//   2. its receiver chain starts at a client factory call (`readClient()`, `writeClient()`,
//      `createClient(...)`, `getSupabase()`, ...) or at a name bound from one;
//   3. its receiver is a name bound (const/let/var or plain assignment, including `this.q = ...`) from an
//      expression that is itself a database chain and is NOT awaited: `const q = sb.from("x"); q.delete()`,
//      and builders derived from builders (`const q2 = q.eq(...)`). An awaited expression is a response,
//      not a builder, so `const rows = await sb.from("x").select(); rows.delete(...)` is not a write;
//   4. a segment of its receiver chain is named like a Supabase client (`supabase`, `supabaseAdmin`,
//      `ctx.supabase`), or is one of RECEIVER_NAMES, the bare names this repo gives its clients, and the
//      file shows a Supabase signal (imports supabase-js, the server/service/browser client or
//      lib/db.mjs, calls a client factory, or calls `.from(`). Without the signal a bare `client.delete()`
//      or `db.update()` is some other object (an HTTP client, a Map named db).
// RECEIVER_NAMES and CLIENT_FACTORIES are derived from this repo, not invented: scripts/lib/db.mjs binds
// `const sb = writeClient()` / `readClient()` in every guarded writer, and a census of `<name>.from(`
// over fsi-app/src and fsi-app/scripts gives sb (265), supabase (91), client (13), db (7), rc (5), svc
// (4), service (2), sbRead, sbClient, plus the factories createClient, readClient, writeClient,
// getSupabase, getServiceClient, getServiceSupabase, serviceClient, makeClient, createServerClient,
// createBrowserClient.
// KNOWN LIMIT (stated, not hidden): a write through a function PARAMETER whose name matches nothing above
// (`function w(qb) { qb.delete() }`) cannot be resolved inside one file and passes; the call site that
// builds the chain (`w(sb.from("x"))`) holds the `.from(` and is checked there. The GUARDED_IMPORT_RE
// exemption is unchanged.

import { pass, fail } from '../lib/result.mjs';
import { introducedMatches } from '../lib/context.mjs';
import { skillsForOp } from '../governance/skill-map.mjs';

// Raw Supabase write signals (method-call shaped, NOT bare words — avoids the _diag "UPDATE CADENCE"
// false-trip from the red-team). .insert is excluded (additive, not a row mutation of existing data).
// Candidate calls only; whether a candidate is a DATABASE write is decided by rawWriteHits() below.
const WRITE_CALL_RE = /\.\s*(update|upsert|delete)\s*\(/g;
const GUARDED_IMPORT_RE = /lib\/db\.mjs|guardedUpdate|guardedUpsert|guardedDelete|archiveRows/;

export const RECEIVER_NAMES = new Set(['sb', 'supabase', 'client', 'db', 'svc', 'service', 'rc', 'sbRead', 'sbClient']);
export const CLIENT_FACTORIES = new Set([
  'createClient', 'readClient', 'writeClient', 'getSupabase', 'getServiceClient', 'getServiceSupabase',
  'serviceClient', 'makeClient', 'createServerClient', 'createBrowserClient',
]);
// Builtin statics that have their own `.from(` and are never a query builder.
const BUILTIN_FROM = new Set([
  'Array', 'Buffer', 'Object', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array',
  'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Uint8ClampedArray',
  'Set', 'Map', 'Promise', 'String', 'Symbol',
]);
const KEYWORDS = new Set([
  'if', 'while', 'for', 'switch', 'catch', 'return', 'await', 'typeof', 'void', 'delete', 'in', 'of',
  'new', 'function', 'yield', 'throw', 'else', 'do', 'case',
]);
const SIGNAL_RAW_RE = /@supabase\/supabase-js|supabase-server|supabase-service|supabase-browser|lib\/db\.mjs/;
const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'yield', 'else', 'do', 'new', 'await']);

const isIdent = (c) => c !== undefined && /[\w$]/.test(c);
const isWs = (c) => c !== undefined && /\s/.test(c);

/** Replace comments and the CONTENT of string, template and regex literals with spaces (newlines kept so
 *  indexes and line numbers stay aligned). Code inside a template `${ ... }` is kept. */
export function maskNonCode(src) {
  const s = String(src);
  const n = s.length;
  const out = new Array(n).fill(' ');
  const keep = (k) => { out[k] = s[k]; };
  const nl = (k) => { if (s[k] === '\n' || s[k] === '\r') out[k] = s[k]; };
  let i = 0;

  function lastWord() {
    let k = i - 1;
    while (k >= 0 && isWs(out[k])) k--;
    const e = k;
    while (k >= 0 && isIdent(out[k])) k--;
    return e > k ? out.slice(k + 1, e + 1).join('') : '';
  }
  function prevSig() {
    let k = i - 1;
    while (k >= 0 && isWs(out[k])) k--;
    return k >= 0 ? out[k] : '';
  }
  function regexAllowed() {
    const p = prevSig();
    if (p === '') return true;
    if ('(,=:[!&|?{};+-*%<>~^'.includes(p)) return true;
    return isIdent(p) && REGEX_PREV_WORDS.has(lastWord());
  }
  function template() {
    while (i < n) {
      const c = s[i];
      if (c === '\\') { nl(i); i++; if (i < n) { nl(i); i++; } continue; }
      if (c === '`') { keep(i); i++; return; }
      if (c === '$' && s[i + 1] === '{') {
        i += 2;
        code(true);
        if (i < n) i++; // the closing brace of the interpolation (left masked)
        continue;
      }
      nl(i); i++;
    }
  }
  function code(stopAtBrace) {
    let depth = 0;
    while (i < n) {
      const c = s[i];
      const d = s[i + 1];
      if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') {
        i += 2;
        while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { nl(i); i++; }
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        keep(i); i++;
        while (i < n && s[i] !== c && s[i] !== '\n') {
          if (s[i] === '\\') { i++; if (i < n) { nl(i); i++; } continue; }
          i++;
        }
        if (i < n && s[i] === c) { keep(i); i++; }
        continue;
      }
      if (c === '`') { keep(i); i++; template(); continue; }
      if (c === '/' && regexAllowed()) {
        let k = i + 1;
        let inClass = false;
        let ok = false;
        while (k < n && s[k] !== '\n') {
          if (s[k] === '\\') { k += 2; continue; }
          if (s[k] === '[') inClass = true;
          else if (s[k] === ']') inClass = false;
          else if (s[k] === '/' && !inClass) { ok = true; break; }
          k++;
        }
        if (ok) { keep(i); keep(k); i = k + 1; continue; }
      }
      if (c === '{') depth++;
      if (c === '}') { if (stopAtBrace && depth === 0) return; depth--; }
      keep(i); i++;
    }
  }
  code(false);
  return out.join('');
}

function matchBack(code, closeIdx) {
  const close = code[closeIdx];
  const open = close === ')' ? '(' : close === ']' ? '[' : '{';
  let depth = 0;
  for (let k = closeIdx; k >= 0; k--) {
    if (code[k] === close) depth++;
    else if (code[k] === open) { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/** Receiver chain of the call whose `.` is at dotIdx, nearest segment first:
 *  { name, call } | { index } | { paren, inner }. */
export function receiverChain(code, dotIdx) {
  const segs = [];
  let k = dotIdx - 1;
  if (code[k] === '?') k--;
  for (let guard = 0; guard < 400; guard++) {
    while (k >= 0 && isWs(code[k])) k--;
    if (k < 0) break;
    const c = code[k];
    if (c === ')') {
      const open = matchBack(code, k);
      if (open < 0) break;
      const inner = code.slice(open + 1, k);
      let j = open - 1;
      while (j >= 0 && isWs(code[j])) j--;
      if (j >= 0 && isIdent(code[j])) {
        const end = j;
        while (j >= 0 && isIdent(code[j])) j--;
        const name = code.slice(j + 1, end + 1);
        if (KEYWORDS.has(name)) { segs.push({ paren: true, inner }); break; }
        segs.push({ name, call: true, inner });
        k = j;
      } else if (j >= 0 && (code[j] === ')' || code[j] === ']')) {
        segs.push({ name: null, call: true, inner });
        k = j;
        continue;
      } else {
        segs.push({ paren: true, inner });
        break;
      }
    } else if (c === ']') {
      const open = matchBack(code, k);
      if (open < 0) break;
      segs.push({ index: true, inner: code.slice(open + 1, k) });
      k = open - 1;
      continue;
    } else if (isIdent(c)) {
      const end = k;
      while (k >= 0 && isIdent(code[k])) k--;
      segs.push({ name: code.slice(k + 1, end + 1) });
    } else {
      break;
    }
    let m = k;
    while (m >= 0 && isWs(code[m])) m--;
    if (code[m] === '.') { k = m - 1; if (code[k] === '?') k--; continue; }
    break;
  }
  return segs;
}

function stripBuiltinFrom(text) {
  return text.replace(new RegExp(`(?<![\\w$])(?:${[...BUILTIN_FROM].join('|')})\\s*\\.\\s*from\\s*\\(`, 'g'), ' ');
}

function isClientFactoryExpr(t) {
  const m = /^(?:await\s+)?(?:[\w$]+\s*\.\s*)*([\w$]+)\s*\(/.exec(t.trim());
  return !!m && CLIENT_FACTORIES.has(m[1]);
}

/** Does this masked expression text evaluate to a query builder or a client? */
function exprIsDb(text, env) {
  const t = text.trim();
  if (/^await\b/.test(t) && !isClientFactoryExpr(t)) return false; // a response, not a builder
  if (/\.\s*from\s*\(/.test(stripBuiltinFrom(t))) return true;
  if (isClientFactoryExpr(t)) return true;
  const root = /^(?:new\s+)?([A-Za-z_$][\w$]*)/.exec(t);
  if (root && t.slice(root[0].length).trim().startsWith('.')) {
    const name = root[1];
    if (env.builderVars.has(name) || env.clientVars.has(name)) return true;
    if (env.signal && RECEIVER_NAMES.has(name)) return true;
    if (/supabase/i.test(name)) return true;
  }
  return false;
}

function chainIsDb(segs, env) {
  for (let idx = 0; idx < segs.length; idx++) {
    const sg = segs[idx];
    if (sg.paren) { if (exprIsDb(sg.inner, env)) return true; continue; }
    if (sg.call && sg.name === 'from') {
      const recv = segs[idx + 1];
      if (recv && recv.name && !recv.call && BUILTIN_FROM.has(recv.name)) continue;
      return true;
    }
  }
  const root = segs[segs.length - 1];
  if (root && root.name && root.call && CLIENT_FACTORIES.has(root.name)) return true;
  for (const sg of segs) {
    if (!sg.name) continue;
    if (env.builderVars.has(sg.name) || env.clientVars.has(sg.name)) return true;
    if (/supabase/i.test(sg.name)) return true;
    if (env.signal && RECEIVER_NAMES.has(sg.name)) return true;
  }
  return false;
}

/** Right-hand side text of the assignment whose `=` is at eqIdx: up to the statement end at depth 0. */
function rhsOf(code, eqIdx) {
  const start = eqIdx + 1;
  let k = start;
  let depth = 0;
  for (; k < code.length; k++) {
    const c = code[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (depth === 0 && c === ';') break;
    else if (depth === 0 && c === '\n') {
      let m = k + 1;
      while (m < code.length && isWs(code[m])) m++;
      const rest = code.slice(m, m + 2);
      if (!(rest[0] === '.' || rest === '?.' || rest === '||' || rest === '&&' || rest === '??' || rest[0] === ':' || rest[0] === '?')) break;
    }
  }
  return code.slice(start, k);
}

function lineOf(src, idx) {
  let line = 1;
  for (let k = 0; k < idx; k++) if (src[k] === '\n') line++;
  return line;
}

/** Every raw DATABASE write call in `content`: [{ line, method }]. Pure. */
export function rawWriteHits(content) {
  const src = String(content ?? '');
  const code = maskNonCode(src);
  const signal = SIGNAL_RAW_RE.test(src) || /\.\s*from\s*\(/.test(stripBuiltinFrom(code)) ||
    [...CLIENT_FACTORIES].some((f) => new RegExp(`(?<![\\w$.])${f}\\s*\\(`).test(code));
  const env = { builderVars: new Set(), clientVars: new Set(), signal };

  const bindings = [];
  const bindRe = /([A-Za-z_$][\w$]*)\s*=(?![=>])/g;
  let b;
  while ((b = bindRe.exec(code)) !== null) {
    if (KEYWORDS.has(b[1])) continue;
    bindings.push({ name: b[1], rhs: rhsOf(code, b.index + b[0].length - 1) });
  }
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const { name, rhs } of bindings) {
      if (env.builderVars.has(name) || env.clientVars.has(name)) continue;
      if (isClientFactoryExpr(rhs)) { env.clientVars.add(name); changed = true; continue; }
      if (exprIsDb(rhs, env)) { env.builderVars.add(name); changed = true; }
    }
    if (!changed) break;
  }

  const hits = [];
  const callRe = new RegExp(WRITE_CALL_RE.source, 'g');
  let m;
  while ((m = callRe.exec(code)) !== null) {
    const segs = receiverChain(code, m.index);
    if (segs.length > 0 && chainIsDb(segs, env)) hits.push({ line: lineOf(src, m.index), method: m[1] });
  }
  return hits;
}

function norm(p) { return (p || '').replaceAll('\\', '/'); }

function relevantScripts(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const p = norm(f.path);
    if (f.status === 'D') return false;
    if (!p.startsWith('fsi-app/scripts/')) return false;
    if (!p.endsWith('.mjs')) return false;
    if (p.includes('/scripts/_diag/')) return false;     // read-only diagnostic convention
    if (p.includes('/scripts/lib/')) return false;        // the helper itself + shared libs
    // Test/proof files fake a Supabase client (`.update(`/`.upsert(`/`.delete(` are the very methods
    // being faked) and mutate no rows; they are not row-mutating scripts. First tripped by
    // scripts/turns/apply-extraction-output.test.mjs on PR #507 (2026-09-01).
    if (/\.(test|npmtest|selftest|golden)\.mjs$/.test(p)) return false;
    return true;
  });
}

export const rule = {
  id: '015',
  name: 'Row-mutation guarded path',
  description: 'Scripts that mutate existing rows must write through scripts/lib/db.mjs (snapshot + skill-cite), not a raw .update()/.upsert()/.delete(). Charges only write lines the commit introduces.',
  ruleSource: 'governance/skill-map → environmental-policy-and-innovation + remediation-discipline; operating-mechanism build (action-class M)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevantScripts(ctx).length > 0;
  },

  check(ctx) {
    const violations = [];
    for (const f of relevantScripts(ctx)) {
      // Cheap exit first: no introduced write-shaped line means nothing to analyse, and the lexer below
      // only runs on files that gained one.
      const introduced = introducedMatches(ctx.introducedLines(f.path), isWriteLine);
      if (introduced.length === 0) continue;
      const content = ctx.getFileContent(f.path);
      if (!content) continue;
      const hits = rawWriteHits(content);
      if (hits.length === 0) continue;                    // no raw database write → fine
      if (GUARDED_IMPORT_RE.test(content)) continue;      // uses the guarded path → fine
      const lines = introducedHitLines(content, hits, introduced);
      if (lines.length === 0) continue;                   // the writes in this file are not this commit's
      const skills = skillsForOp(content);
      violations.push({ path: norm(f.path), lines, skills: skills.map((s) => s.skill) });
    }
    if (violations.length === 0) return pass();

    return fail({
      locations: violations.flatMap((v) => v.lines.map((line) => ({ path: v.path, line }))),
      message: `${violations.length} script(s) introduce RAW row mutations outside the guarded path (scripts/lib/db.mjs).`,
      remediation: [
        'Route existing-row writes through the guarded helper so the change is reversible (prior-value snapshot) and skill-cited:',
        "  import { guardedUpdate, archiveRows } from './lib/db.mjs'   (or '../lib/db.mjs')",
        'Files + the governing skill each must cite:',
        ...violations.map((v) => `    ${v.path} (line ${v.lines.join(', ')})  → cite: ${v.skills.join(', ') || '(taxonomy/remediation skill)'}`),
        'Only the write lines this commit adds are charged; writes already in the file are not.',
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};

// A line that carries a write-shaped call. Stateless twin of WRITE_CALL_RE for introducedMatches.
const WRITE_LINE_RE = new RegExp(WRITE_CALL_RE.source);
const isWriteLine = (line) => WRITE_LINE_RE.test(line);
const squash = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// The database-write hits that sit on introduced lines. Aligned by line number when the file on disk is
// the post-image of the diff (the normal case). When it is not (an unstaged edit moved the lines), fall
// back to the text of the introduced write lines, which still separates new writes from old ones except
// for two byte-identical write lines.
function introducedHitLines(content, hits, introduced) {
  const fileLines = content.split(/\r?\n/);
  const byLine = new Map(introduced.map((p) => [p.line, squash(p.added)]));
  const aligned = introduced.every((p) => squash(fileLines[p.line - 1]) === squash(p.added));
  if (aligned) return hits.map((h) => h.line).filter((line) => byLine.has(line));
  const texts = new Set(introduced.map((p) => squash(p.added)));
  return hits.map((h) => h.line).filter((line) => texts.has(squash(fileLines[line - 1])));
}
