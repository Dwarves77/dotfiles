// F70: definer-hygiene (lane SEC-4, 2026-10-08, ADR-046: a gate earns its place by guarding an irreversible class,
// constructive over detective, one check, one site). SEC-3a's session log counts 56 SECURITY DEFINER functions in the
// migration tree, 42 of them with no explicit REVOKE EXECUTE FROM PUBLIC (PostgreSQL grants EXECUTE on a new function to
// PUBLIC, and Supabase's default privileges add anon and authenticated on top). This lane's own parse of the tree found
// five whose latest definition carries no pinned search_path: a CREATE OR REPLACE resets the setting an earlier ALTER
// FUNCTION had pinned, which is how migrations 272 and 316 silently dropped the pin migration 160 had set. A definer
// function runs with its owner's rights, so an unrevoked grant is a privilege door and an unpinned search_path lets a
// caller who can create objects in a schema ahead of public shadow what the body names. Migration 371 closed the class
// for the functions that exist; this function keeps it closed for the ones that do not exist yet.
//
// THE RULE. Every `CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER` in a migration numbered 371 or higher must, in
// the SAME file, carry both:
//   1. a `REVOKE EXECUTE ON FUNCTION <name>(...) FROM ... PUBLIC ...` (REVOKE ALL is accepted too); a REVOKE that names
//      only anon or authenticated does not close the PUBLIC grant;
//   2. a pinned search_path that NAMES pg_temp (a path without it searches the temporary schema first, which is the
//      shadowing hole the pin exists to close): `SET search_path = ..., pg_temp` in the function header (or tail), or an
//      `ALTER FUNCTION <name>(...) SET search_path = ..., pg_temp` in the same file.
// A violation names the file, the function and which of the two is missing.
//
// SCOPE BY NUMBER, NOT BY ALLOWLIST. Migrations below 371 are out of scope because they are history (371 repairs every
// function they defined, at apply time, from pg_proc); there is no allowlist and none is wanted: a function that cannot
// carry both halves does not need to be SECURITY DEFINER.
//
// HONEST LIMITS. A lexical scan of the migration text, the posture F64 and F69 use: it reads CREATE statements, not the
// live catalog, so it cannot see a function created by a DO block's EXECUTE (migration 371's own self-check asserts the
// live catalog for every function that exists at apply time), and a REVOKE built from a dynamic string does not count.
// It does not check that the GRANT that follows the REVOKE is the right one: which roles a function is granted to is a
// per-function decision (migration 371 fixes five classes); this gate only guarantees the default PUBLIC grant is gone
// and the path is pinned. Proven by attack in F70-definer-hygiene.test.mjs (a fixture migration that must fail).
//
// node: builtins plus the repo's own fitness lib helpers only (loaded by the no-npm discipline test glob).

//
// Lane GATE-8 (2026-10-08, AUD-AT-4 B6-74 to B6-77): the migration text is read through ../lib/sql-mask.mjs, the one
// reader of "what is SQL and what is a comment or a string", so a `--` inside a string no longer truncates the header
// line before SECURITY DEFINER, and a REVOKE or a search_path that exists only inside a block comment no longer
// counts. Two more honest forms are closed:
//   - the REVOKE and the ALTER FUNCTION must match the created SIGNATURE, not just the name: a REVOKE written for a
//     different overload of the same name leaves the created overload with its default PUBLIC grant (B6-77);
//   - `pg_temp` must be the LAST entry of the pinned path (B6-76): `SET search_path = pg_temp, public` searches the
//     temporary schema first, which is the shadowing hole the pin exists to close, and names pg_temp all the same.
// Migrations below 371 stay out of scope by number (B6-78 is an intent form: a new migration takes the next number).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { maskSql, sqlLineOf } from '../lib/sql-mask.mjs';

export const MIGRATIONS_GLOB = 'fsi-app/supabase/migrations/*.sql';
export const MIN_MIGRATION_NUMBER = 371;

function numericIdOf(path) {
  const base = String(path).replace(/\\/g, '/').split('/').pop();
  const m = /^(\d+)_/.exec(base);
  return m ? Number(m[1]) : -1;
}

/** Index of the paren closing the one at `open` in masked `text`, or -1. */
function closeParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim() !== '' || parts.length) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

const TYPE_STARTERS = new Set(['double', 'timestamp', 'time', 'character', 'char', 'bit', 'interval', 'national', 'varchar']);
const TYPE_SYNONYMS = new Map([
  ['int', 'integer'], ['int4', 'integer'], ['int8', 'bigint'], ['int2', 'smallint'], ['bool', 'boolean'],
  ['float8', 'double precision'], ['float4', 'real'], ['timestamptz', 'timestamp with time zone'],
  ['timetz', 'time with time zone'], ['varchar', 'character varying'], ['decimal', 'numeric'],
]);

/** Normalise ONE argument of a function signature to its type: the argument name, the mode, the default and any
 *  type modifier `(10,2)` are dropped; `public.` is dropped; synonyms are folded. OUT arguments are not part of the
 *  signature that REVOKE and ALTER FUNCTION identify a function by, so they return null. */
export function normalizeArgType(arg) {
  let a = String(arg).replace(/\s+/g, ' ').trim();
  if (a === '') return null;
  a = a.replace(/\s+(?:DEFAULT\b.*|=.*)$/i, '');
  const mode = /^(IN\s+OUT|INOUT|OUT|IN|VARIADIC)\s+/i.exec(a);
  if (mode) {
    a = a.slice(mode[0].length);
    if (/^OUT$/i.test(mode[1])) return null;
  }
  const tokens = a.split(' ');
  if (tokens.length > 1 && !TYPE_STARTERS.has(tokens[0].toLowerCase()) && !tokens[0].includes('.') && !/^(?:setof)$/i.test(tokens[0])) tokens.shift();
  let t = tokens.join(' ').toLowerCase().replace(/"/g, '').replace(/\(\s*[\d\s,]+\)/g, '').replace(/^public\./, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\bpublic\./g, '');
  return TYPE_SYNONYMS.get(t) ?? t;
}

/** Normalised type list of an argument list text (the part between the parentheses). */
export function normalizeArgList(list) {
  return splitTopLevel(list).map(normalizeArgType).filter((x) => x !== null);
}

const sameSignature = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

/** Every `CREATE [OR REPLACE] FUNCTION [public.]name(` whose header (before the dollar-quoted body) or tail (after the
 *  body, up to the statement end) carries SECURITY DEFINER. PURE.
 *  @returns {{name: string, line: number, argTypes: string[], inlineSearchPath: boolean, returnsTrigger: boolean}[]} */
export function findDefinerFunctions(content) {
  const text = maskSql(content);
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = closeParen(text, open);
    const argTypes = close < 0 ? [] : normalizeArgList(text.slice(open + 1, close));
    const tagRe = /\$[A-Za-z_0-9]*\$/g;
    tagRe.lastIndex = m.index + m[0].length;
    const tag = tagRe.exec(text);
    const semi = text.indexOf(';', m.index + m[0].length);
    let header;
    let tail = '';
    let next = m.index + m[0].length;
    if (tag && (semi === -1 || tag.index < semi)) {
      header = text.slice(m.index, tag.index);
      const closeTag = text.indexOf(tag[0], tag.index + tag[0].length);
      if (closeTag !== -1) {
        const after = closeTag + tag[0].length;
        const end = text.indexOf(';', after);
        tail = text.slice(after, end === -1 ? text.length : end);
        next = after;
      }
    } else {
      header = text.slice(m.index, semi === -1 ? text.length : semi);
    }
    re.lastIndex = next;
    const all = `${header} ${tail}`;
    if (!/\bSECURITY\s+DEFINER\b/i.test(all)) continue;
    out.push({
      name: m[1].toLowerCase(),
      line: sqlLineOf(text, m.index),
      argTypes,
      inlineSearchPath: pathPinned(all),
      returnsTrigger: /\bRETURNS\s+trigger\b/i.test(header),
    });
  }
  return out;
}

/** True when `clause` carries a `SET search_path = a, b, pg_temp` whose LAST entry is pg_temp. */
function pathPinned(clause) {
  const re = /\bSET\s+search_path\s*(?:=|TO)\s*((?:"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*(?:"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*))*)/gi;
  let m;
  let ok = false;
  while ((m = re.exec(clause))) {
    const items = m[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '').toLowerCase());
    if (items[items.length - 1] === 'pg_temp') ok = true;
  }
  return ok;
}

/** Function references `name(args)` in the text after `ON FUNCTION`, as [{name, argTypes}]. */
function functionRefs(list) {
  const out = [];
  const re = /(?:"?public"?\s*\.\s*)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/g;
  let m;
  while ((m = re.exec(list))) {
    const open = m.index + m[0].length - 1;
    const close = closeParen(list, open);
    if (close < 0) break;
    out.push({ name: m[1].toLowerCase(), argTypes: normalizeArgList(list.slice(open + 1, close)) });
    re.lastIndex = close + 1;
  }
  return out;
}

/** Pure core. `content` is one migration's text; `filepath` is only used in the message. */
export function checkDefinerHygiene({ filepath, content }) {
  const text = maskSql(content);
  const stmts = text.split(';');
  const revoked = []; // [{name, argTypes}] for REVOKE ... FROM ... PUBLIC
  const pinned = []; // ALTER FUNCTION ... SET search_path with pg_temp last
  for (const s of stmts) {
    const rv = /^\s*REVOKE\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+FUNCTION\s+([\s\S]*?)\s+FROM\s+([\s\S]*)$/i.exec(s);
    if (rv && /\bPUBLIC\b/i.test(rv[2])) revoked.push(...functionRefs(rv[1]));
    const al = /^\s*ALTER\s+FUNCTION\s+((?:"?public"?\s*\.\s*)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\([\s\S]*?\))\s+(SET\s+search_path[\s\S]*)$/i.exec(s);
    if (al && pathPinned(al[2])) pinned.push(...functionRefs(al[1]));
  }
  const out = [];
  for (const fn of findDefinerFunctions(content)) {
    const has = (list) => list.some((r) => r.name === fn.name && sameSignature(r.argTypes, fn.argTypes));
    const missing = [];
    if (!has(revoked)) missing.push('REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC');
    if (!fn.inlineSearchPath && !has(pinned)) missing.push('a pinned search_path that names pg_temp last');
    if (missing.length === 0) continue;
    out.push(
      violation(
        fn.line,
        `${filepath}: F70 definer-hygiene: function public.${fn.name}(${fn.argTypes.join(', ')}) is SECURITY DEFINER and this file is missing: ` +
          `${missing.join(' and ')}. A definer runs with its owner's rights: revoke the default PUBLIC grant ` +
          '(REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM PUBLIC, naming the same argument types as the CREATE, then GRANT to the roles that need it) and pin ' +
          'the path (SET search_path = public, pg_temp in the header, with pg_temp last, or ALTER FUNCTION ... SET search_path in the same ' +
          'file). A CREATE OR REPLACE resets the search_path, so restate it every time.',
      ),
    );
  }
  return out;
}

export const fitnessFunction = {
  id: 'F70',
  name: 'definer-hygiene',
  description:
    'Every CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER in a migration numbered 371 or higher carries, in the ' +
    'same file, a REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC for the same signature and a pinned search_path (header SET search_path or an ' +
    'ALTER FUNCTION ... SET search_path, either ending with pg_temp). Migrations below 371 are out of scope by number; migration 371 repaired them ' +
    'at apply time from pg_proc.',
  source: 'fsi-app/.discipline/fitness/functions/F70-definer-hygiene.mjs',

  enumerate() {
    return globFiles([MIGRATIONS_GLOB]).filter((f) => numericIdOf(f) >= MIN_MIGRATION_NUMBER);
  },

  check(filepath, content) {
    if (numericIdOf(filepath) < MIN_MIGRATION_NUMBER) return [];
    return checkDefinerHygiene({ filepath, content });
  },
};
