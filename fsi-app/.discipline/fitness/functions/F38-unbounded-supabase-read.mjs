// F38: unbounded-supabase-read (CAP-1000, 2026-09-05, "two defects one cause" audit). PostgREST's
// db-max-rows setting caps ANY response at 1000 rows regardless of what `.limit(N)` asks for or whether
// the query carries no `.limit()`/`.range()` at all — PERF-13's `getPublicSurfaceSlugs`
// (`.limit(BUILD_TIME_SLUG_ENUM_LIMIT = 20000)`, live corpus 1,312+ regulations, only the first 1,000 ever
// prerendered) and the obligations register's `fetchObligationRegisterPage`
// (`OVERFETCH_CAP = 2000` then a JS-side filter/count over the truncated array — masthead read "60 of
// 1000" while the table held 1,141) are the two live instances that named this bug CLASS; this lane also
// found and fixed a third (`supabase-server.ts`'s `runCategoryRpc`/`runCategoryRpcPublic`, a bare unranged
// `.rpc()` call) and a fourth (`run-change-detection.mjs`'s `readPendingDrainRows`, an overflow count
// derived from a capped array's `.length` instead of an exact DB count). This guard is the mechanical
// backstop against a FIFTH: it registers every remaining `.limit(<literal or same-file ALL_CAPS
// constant> > 1000)` call site in src/+scripts/ with a classification (bounded-by-design, with why) and
// an expiry train/wave, exactly F17's size-cap-doctrine registry shape; a NEW unregistered site, or a
// registered site whose expiry has passed, is RED.
//
// SCOPE, STATED (not silently narrower than it looks): this mechanizes the literal-number half of the
// dispatch precisely ("`.limit(` with a literal > 1000"). It does NOT attempt to mechanically detect "a
// full-set read with no `.range()`/`.limit()` at all that expects the whole table" — the codebase has
// dozens of legitimate single-row/scalar `.rpc()` calls (`validate_item_provenance`, `get_surface_counts`,
// admin RPCs) that a generic "unranged .rpc()/.select() is RED" rule would flag as false positives on
// every run; building a reliable AST-level "is this a listing query" classifier is out of scope for a
// glob+regex fitness function. That half of the audit was done by hand this lane (every `.limit(`/full-
// table-read call site in fsi-app/src and fsi-app/scripts was read; see the CAP-1000 REPORT's audit
// table) and is backstopped structurally instead: every real listing/RPC site this lane found now routes
// through `fetchAllRows`/`exactCount` (src/lib/db/paginate.mjs), so a future full-table read written the
// SAME way (reusing that helper) is safe by construction, and a future one written the OLD way (a bare
// unranged call) still trips THIS gate the moment anyone adds a `.limit()` above 1000 to bound it "for
// safety" — the exact reflex that produced BUILD_TIME_SLUG_ENUM_LIMIT and OVERFETCH_CAP in the first place.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';
import { isTestFile, latestTrainWave } from './F25-module-liveness.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

// A `.limit(N)` call with a bare numeric literal.
const LIMIT_LITERAL_RE = /\.limit\(\s*(\d+)\s*\)/g;
// A `.limit(NAME)` call with a SCREAMING_SNAKE_CASE identifier — this codebase's own constant-naming
// convention (BUILD_TIME_SLUG_ENUM_LIMIT, OVERFETCH_CAP, SERIES_HISTORY_LIMIT, ...). A lowercase/camelCase
// identifier is a parameter or local variable, not a module constant, and is out of this check's reach
// (tracing an arbitrary variable's value is not a regex's job) — same-file constant declarations only.
const LIMIT_IDENT_RE = /\.limit\(\s*([A-Z][A-Z0-9_]*)\s*\)/g;
// `const NAME = <number>` / `export const NAME = <number>` — resolves LIMIT_IDENT_RE's identifier to a
// literal value when the declaration and the call site live in the same file.
const CONST_DECL_RE = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\b/g;

const DB_MAX_ROWS = 1000;

// THE REGISTRY — every remaining `.limit(...)` call site above DB_MAX_ROWS, classified. Every entry MUST
// carry `expiry` (a train/wave number, F25's `latestTrainWave` oracle): once the landed history reaches or
// passes it, the entry REDS — "bounded by design" is a live judgment call re-confirmed on a cadence, not a
// permanent exemption wearing a temporary label (same posture F25 W7.1 established for module-liveness
// allowlist entries).
export const ALLOWLIST = [
  {
    file: 'fsi-app/scripts/verify/mint-gate-calibration.mjs',
    limit: '8000',
    reason:
      'manual offline CLI mint-gate calibration tool, run by a human, never CI-dispatched; N_ITEMS ' +
      '(default 40, --items=N) bounds the REAL sample size, .limit(8000) is a generous ceiling on a ' +
      '--representative recent-window read, not a full-table listing a customer surface depends on.',
    expiry: 46,
  },
];

function allowlistEntry(file, limitExpr) {
  return ALLOWLIST.find((e) => e.file === file && e.limit === limitExpr);
}

/** Collect same-file `const NAME = <number>` bindings. PURE. @param {string} content */
export function collectConstNumbers(content) {
  const out = new Map();
  CONST_DECL_RE.lastIndex = 0;
  let m;
  while ((m = CONST_DECL_RE.exec(content)) !== null) out.set(m[1], Number(m[2]));
  return out;
}

/** Find every `.limit(...)` call site above `DB_MAX_ROWS`, resolving a same-file ALL_CAPS identifier to
 *  its declared numeric value. PURE — no filesystem, no git. Returns `{ line, limitExpr, value }[]`,
 *  `limitExpr` the exact text inside `.limit(...)` (a literal number, or the identifier name) — the key
 *  ALLOWLIST entries match on. @param {string} content */
export function findOversizedLimitCalls(content) {
  const consts = collectConstNumbers(content);
  const lines = content.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    LIMIT_LITERAL_RE.lastIndex = 0;
    let m;
    while ((m = LIMIT_LITERAL_RE.exec(line)) !== null) {
      const value = Number(m[1]);
      if (value > DB_MAX_ROWS) out.push({ line: i + 1, limitExpr: m[1], value });
    }
    LIMIT_IDENT_RE.lastIndex = 0;
    while ((m = LIMIT_IDENT_RE.exec(line)) !== null) {
      const name = m[1];
      if (!consts.has(name)) continue; // not a same-file constant (imported, or a runtime param) — out of reach
      const value = consts.get(name);
      if (value > DB_MAX_ROWS) out.push({ line: i + 1, limitExpr: name, value });
    }
  });
  return out;
}

let cachedLatestWave; // memoized across check() calls in one runner invocation — one `git log`, not one per file
function resolveLatestWave(root) {
  if (cachedLatestWave === undefined) cachedLatestWave = latestTrainWave(root);
  return cachedLatestWave;
}

const SCOPE_GLOBS = ['fsi-app/src/**/*.{ts,tsx,mjs}', 'fsi-app/scripts/**/*.mjs'];

export const fitnessFunction = {
  id: 'F38',
  name: 'unbounded-supabase-read',
  description:
    'Every `.limit(N)` call (a bare literal, or a same-file SCREAMING_SNAKE_CASE constant) above ' +
    'PostgREST\'s 1000-row db-max-rows ceiling is registered in ALLOWLIST with a bounded-by-design reason ' +
    'and an expiry train/wave; a new, unregistered site is RED, and a registered site whose expiry has ' +
    'passed is RED. Backstop for the PERF-13/OVERFETCH_CAP defect class (CAP-1000, 2026-09-05): a literal ' +
    'over 1000 silently returns at most 1000 rows no matter what it asks for.',
  source: 'CAP-1000 "two defects one cause" audit, 2026-09-05',

  enumerate() {
    return globFiles(SCOPE_GLOBS).filter((f) => !isTestFile(f) && !f.includes('/_archive/'));
  },

  check(filepath, content) {
    const out = [];
    const root = getRepoRoot();
    const latestWave = resolveLatestWave(root);

    for (const site of findOversizedLimitCalls(content)) {
      const lineText = content.split(/\r?\n/)[site.line - 1] ?? '';
      if (isOverridden(lineText, 'F38')) continue;
      const entry = allowlistEntry(filepath, site.limitExpr);
      if (!entry) {
        out.push(
          violation(
            site.line,
            `.limit(${site.limitExpr}) = ${site.value} rows is ABOVE PostgREST's 1000-row db-max-rows ceiling — ` +
              `a request for ${site.value} silently returns at most 1000 regardless (the PERF-13/OVERFETCH_CAP ` +
              `defect class). If this must page past 1000, route it through fetchAllRows/exactCount ` +
              `(src/lib/db/paginate.mjs). If it is genuinely bounded by design, add it to F38's ALLOWLIST with a ` +
              `reason and an expiry train/wave, or mark the line \`// fitness-allow: F38 (reason)\`.`
          )
        );
        continue;
      }
      if (latestWave !== null && latestWave >= entry.expiry) {
        out.push(
          violation(
            site.line,
            `F38 ALLOWLIST ENTRY EXPIRED — ${filepath}'s .limit(${entry.limit}) allowlist entry (expiry wave${entry.expiry}) ` +
              `has passed (latest landed: wave${latestWave}). Re-confirm it is still bounded by design and grant a fresh ` +
              `expiry with a current reason, page it through fetchAllRows/exactCount instead, or remove the site — an ` +
              `expiry nobody returns to is a permanent exemption wearing a temporary label.`
          )
        );
      }
    }
    return out;
  },
};
