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

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';

export const MIGRATIONS_GLOB = 'fsi-app/supabase/migrations/*.sql';
export const MIN_MIGRATION_NUMBER = 371;

function numericIdOf(path) {
  const base = String(path).replace(/\\/g, '/').split('/').pop();
  const m = /^(\d+)_/.exec(base);
  return m ? Number(m[1]) : -1;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Drops `-- ...` line comments but keeps every newline, so line numbers still match the file. PURE. */
function stripLineComments(content) {
  return String(content).split('\n').map((l) => {
    const i = l.indexOf('--');
    return i === -1 ? l : l.slice(0, i);
  }).join('\n');
}

/** Every `CREATE [OR REPLACE] FUNCTION [public.]name(` whose header (before the dollar-quoted body) or tail (after the
 *  body, up to the statement end) carries SECURITY DEFINER. PURE.
 *  @returns {{name: string, line: number, inlineSearchPath: boolean, returnsTrigger: boolean}[]} */
export function findDefinerFunctions(content) {
  const text = stripLineComments(content);
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const tagRe = /\$[A-Za-z_0-9]*\$/g;
    tagRe.lastIndex = m.index + m[0].length;
    const tag = tagRe.exec(text);
    const semi = text.indexOf(';', m.index + m[0].length);
    let header;
    let tail = '';
    let next = m.index + m[0].length;
    if (tag && (semi === -1 || tag.index < semi)) {
      header = text.slice(m.index, tag.index);
      const close = text.indexOf(tag[0], tag.index + tag[0].length);
      if (close !== -1) {
        const after = close + tag[0].length;
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
      line: text.slice(0, m.index).split('\n').length,
      inlineSearchPath: /\bSET\s+search_path\s*(?:=|TO)\s*[^\n;]*\bpg_temp\b/i.test(all),
      returnsTrigger: /\bRETURNS\s+trigger\b/i.test(header),
    });
  }
  return out;
}

/** Pure core. `content` is one migration's text; `filepath` is only used in the message. */
export function checkDefinerHygiene({ filepath, content }) {
  const text = stripLineComments(content);
  const out = [];
  for (const fn of findDefinerFunctions(content)) {
    const name = escapeRegex(fn.name);
    const revoke = new RegExp(
      `REVOKE\\s+(?:EXECUTE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+FUNCTION\\s+(?:"?public"?\\.)?"?${name}"?\\s*\\([^)]*\\)\\s+FROM\\s+[^;]*\\bPUBLIC\\b`,
      'i',
    ).test(text);
    const alter = new RegExp(
      `ALTER\\s+FUNCTION\\s+(?:"?public"?\\.)?"?${name}"?\\s*\\([^)]*\\)\\s+SET\\s+search_path\\s*(?:=|TO)\\s*[^;]*\\bpg_temp\\b`,
      'i',
    ).test(text);
    const missing = [];
    if (!revoke) missing.push('REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC');
    if (!fn.inlineSearchPath && !alter) missing.push('a pinned search_path that names pg_temp');
    if (missing.length === 0) continue;
    out.push(
      violation(
        fn.line,
        `${filepath}: F70 definer-hygiene: function public.${fn.name} is SECURITY DEFINER and this file is missing: ` +
          `${missing.join(' and ')}. A definer runs with its owner's rights: revoke the default PUBLIC grant ` +
          '(REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM PUBLIC, then GRANT to the roles that need it) and pin ' +
          'the path (SET search_path = public, pg_temp in the header, or ALTER FUNCTION ... SET search_path in the same ' +
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
    'same file, a REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC and a pinned search_path (header SET search_path or an ' +
    'ALTER FUNCTION ... SET search_path, either naming pg_temp). Migrations below 371 are out of scope by number; migration 371 repaired them ' +
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
